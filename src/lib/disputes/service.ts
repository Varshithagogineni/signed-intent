import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Dispute, DisputeAnalysis, Mandate, Purchase } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { formatUsd } from "@/lib/money";
import {
  acceptClaim,
  getDispute,
  listDisputeIds,
  type PayPalDispute,
  provideEvidence,
  sandboxRequestSellerEvidence,
  sendDisputeMessage,
} from "@/lib/paypal/disputes";
import { refundCapture } from "@/lib/paypal/payments";
import { fingerprint, verifyDocument } from "@/lib/signing";
import { analyzeDispute } from "./agent";
import { checkEvidence, describeReason, type EvidenceCheck, type EvidenceInput } from "./evidence";

const { disputes, purchases, mandates, activity } = schema;

function log(mandateId: string, kind: "dispute_opened" | "dispute_responded" | "purchase_refunded", message: string, amountCents?: number) {
  getDb().insert(activity).values({ id: newId("act"), mandateId, kind, message, amountCents, createdAt: new Date() }).run();
}

function findPurchase(captureId: string | null): Purchase | undefined {
  if (!captureId) return undefined;
  return getDb().select().from(purchases).where(eq(purchases.captureId, captureId)).get();
}

/** Mirrors one PayPal dispute locally and links it to the purchase it is about. */
function upsert(remote: PayPalDispute): Dispute {
  const db = getDb();
  const existing = db.select().from(disputes).where(eq(disputes.id, remote.id)).get();
  const purchase = findPurchase(remote.captureId);
  const values = {
    purchaseId: purchase?.id ?? null,
    captureId: remote.captureId,
    reason: remote.reason,
    status: remote.status,
    stage: remote.stage,
    amountCents: remote.amountCents,
    messages: remote.messages,
    actions: remote.actions,
    sellerResponseDueAt: remote.sellerResponseDueAt,
    updatedAt: remote.updatedAt,
  };

  if (existing) {
    db.update(disputes).set(values).where(eq(disputes.id, remote.id)).run();
  } else {
    db.insert(disputes).values({ id: remote.id, openedAt: remote.createdAt, ...values }).run();
    if (purchase) {
      log(purchase.mandateId, "dispute_opened", `Buyer opened dispute ${remote.id} on "${purchase.title}": ${describeReason(remote.reason)}.`, remote.amountCents ?? undefined);
    }
  }
  return db.select().from(disputes).where(eq(disputes.id, remote.id)).get()!;
}

/** Fetches one dispute from PayPal (e.g. after a webhook) and stores it. */
export async function syncDispute(id: string): Promise<Dispute> {
  return upsert(await getDispute(id));
}

/** Pulls every dispute from PayPal. Works without webhooks, e.g. on localhost. */
export async function syncAllDisputes(): Promise<number> {
  const ids = await listDisputeIds();
  for (const id of ids) await syncDispute(id);
  return ids.length;
}

export interface DisputeListItem extends Dispute {
  purchaseTitle: string | null;
}

export function listDisputes(): DisputeListItem[] {
  return getDb()
    .select({ dispute: disputes, purchaseTitle: purchases.title })
    .from(disputes)
    .leftJoin(purchases, eq(disputes.purchaseId, purchases.id))
    .orderBy(desc(disputes.openedAt))
    .all()
    .map(({ dispute, purchaseTitle }) => ({ ...dispute, purchaseTitle }));
}

async function verifies(type: "mandate" | "intent-receipt", token: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    await verifyDocument(type, token);
    return true;
  } catch {
    return false;
  }
}

export interface DisputeCase {
  dispute: Dispute;
  purchase: Purchase | null;
  mandate: Mandate | null;
  evidence: EvidenceInput;
  checks: EvidenceCheck[];
}

/** The dispute with its receipt, mandate and the verified evidence checks. */
export async function getDisputeCase(id: string): Promise<DisputeCase | undefined> {
  const db = getDb();
  const dispute = db.select().from(disputes).where(eq(disputes.id, id)).get();
  if (!dispute) return undefined;

  const purchase = dispute.purchaseId ? (db.select().from(purchases).where(eq(purchases.id, dispute.purchaseId)).get() ?? null) : null;
  const mandate = purchase ? (db.select().from(mandates).where(eq(mandates.id, purchase.mandateId)).get() ?? null) : null;

  let boundToMandate = false;
  if (purchase && mandate?.signedMandate) {
    try {
      const claims = await verifyDocument<{ mandate: { fingerprint: string } }>("intent-receipt", purchase.signedReceipt);
      boundToMandate = claims.mandate.fingerprint === fingerprint(mandate.signedMandate);
    } catch {
      boundToMandate = false;
    }
  }

  const evidence: EvidenceInput = {
    dispute: { reason: dispute.reason, amountCents: dispute.amountCents, captureId: dispute.captureId },
    purchase,
    mandate,
    receiptValid: await verifies("intent-receipt", purchase?.signedReceipt ?? null),
    mandateValid: await verifies("mandate", mandate?.signedMandate ?? null),
    receiptBoundToMandate: boundToMandate,
  };
  return { dispute, purchase, mandate, evidence, checks: checkEvidence(evidence) };
}

/** Runs the dispute agent once and stores its advice; `force` re-runs it. */
export async function analyze(id: string, force = false): Promise<DisputeAnalysis> {
  const found = await getDisputeCase(id);
  if (!found) throw new Error(`Unknown dispute ${id}`);
  if (found.dispute.analysis && !force) return found.dispute.analysis;

  const analysis = await analyzeDispute(found.evidence, found.checks);
  getDb().update(disputes).set({ analysis }).where(eq(disputes.id, id)).run();
  return analysis;
}

export const responseActions = ["provide_evidence", "refund", "accept_claim", "send_message", "sandbox_request_evidence"] as const;
export type ResponseAction = (typeof responseActions)[number];

export class DisputeActionError extends Error {}

/**
 * Carries out the action a human approved. Nothing here runs without that approval:
 * the dispute agent only recommends.
 */
export async function respond(id: string, action: ResponseAction, text: string): Promise<Dispute> {
  const found = await getDisputeCase(id);
  if (!found) throw new DisputeActionError(`Unknown dispute ${id}`);
  const { dispute, purchase } = found;

  const requirePayPalAction = (name: string) => {
    if (!dispute.actions.includes(name)) {
      throw new DisputeActionError(`PayPal does not allow "${name.replaceAll("_", " ")}" on this dispute right now.`);
    }
  };

  let resolution: string;
  switch (action) {
    case "provide_evidence":
      requirePayPalAction("provide_evidence");
      await provideEvidence(id, text);
      resolution = "Signed evidence submitted to PayPal";
      break;
    case "send_message":
      requirePayPalAction("send_message");
      await sendDisputeMessage(id, text);
      resolution = "Message sent to the buyer";
      break;
    case "accept_claim":
      requirePayPalAction("accept_claim");
      await acceptClaim(id, text);
      resolution = "Claim accepted; PayPal refunds the buyer";
      break;
    case "refund": {
      if (!purchase) throw new DisputeActionError("This dispute is not linked to an agent purchase.");
      if (purchase.status === "refunded") throw new DisputeActionError("This purchase was already refunded.");
      await refundCapture({ captureId: purchase.captureId, note: text, idempotencyKey: `refund-${purchase.id}` });
      resolution = `Refunded ${formatUsd(purchase.amountCents)}`;
      break;
    }
    case "sandbox_request_evidence":
      await sandboxRequestSellerEvidence(id);
      resolution = "";
      break;
  }

  if (purchase && (action === "refund" || action === "accept_claim")) {
    getDb().update(purchases).set({ status: "refunded" }).where(eq(purchases.id, purchase.id)).run();
    log(purchase.mandateId, "purchase_refunded", `${resolution} for "${purchase.title}" (dispute ${id}).`, purchase.amountCents);
  } else if (purchase && resolution) {
    log(purchase.mandateId, "dispute_responded", `${resolution} for dispute ${id}.`);
  }
  if (resolution) getDb().update(disputes).set({ resolution }).where(eq(disputes.id, id)).run();

  // PayPal applies some actions asynchronously; a stale mirror is fine, the next sync fixes it.
  try {
    return await syncDispute(id);
  } catch {
    return getDb().select().from(disputes).where(eq(disputes.id, id)).get()!;
  }
}
