import "server-only";
import { count, desc, eq, sql } from "drizzle-orm";
import { getProduct, type Product } from "@/lib/catalog/channel3";
import { getDb, schema } from "@/lib/db";
import type { ActivityKind, Mandate, Purchase } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { type Cents, formatUsd } from "@/lib/money";
import { PayPalError } from "@/lib/paypal/client";
import { authorizeOrder, captureAuthorization, createMandateOrder, voidAuthorization } from "@/lib/paypal/payments";
import { fingerprint, signDocument } from "@/lib/signing";
import { evaluatePurchase, type PolicyViolation } from "./policy";

const { mandates, purchases, activity } = schema;

/** PayPal decline codes we surface to the agent as "payment declined" rather than crashing. */
const DECLINE_ISSUES = new Set(["PAYER_CANNOT_PAY", "INSTRUMENT_DECLINED", "PAYEE_ACCOUNT_RESTRICTED", "AUTHORIZATION_VOIDED"]);

function log(mandateId: string, kind: ActivityKind, message: string, amountCents?: Cents) {
  getDb().insert(activity)
    .values({ id: newId("act"), mandateId, kind, message, amountCents, createdAt: new Date() })
    .run();
}

export interface MandateTerms {
  goal: string;
  capCents: Cents;
  maxPerPurchaseCents?: Cents;
  allowedRetailers?: string[];
  maxPurchases?: number;
  expiresInDays: number;
}

/** Records the proposed mandate and creates the PayPal order the human must approve. */
export async function createMandate(terms: MandateTerms): Promise<Mandate> {
  const id = newId("mdt");
  const now = new Date();
  getDb().insert(mandates)
    .values({
      id,
      goal: terms.goal,
      capCents: terms.capCents,
      maxPerPurchaseCents: terms.maxPerPurchaseCents ?? null,
      allowedRetailers: terms.allowedRetailers?.length ? terms.allowedRetailers : null,
      maxPurchases: terms.maxPurchases ?? null,
      expiresAt: new Date(now.getTime() + terms.expiresInDays * 24 * 60 * 60 * 1000),
      createdAt: now,
    })
    .run();

  const { APP_URL } = env();
  const order = await createMandateOrder({
    mandateId: id,
    capCents: terms.capCents,
    description: `Agent mandate: ${terms.goal}`,
    returnUrl: `${APP_URL}/api/mandates/${id}/approved`,
    cancelUrl: `${APP_URL}/?mandate=${id}&cancelled=1`,
  });

  getDb().update(mandates).set({ paypalOrderId: order.orderId, approveUrl: order.approveUrl }).where(eq(mandates.id, id)).run();
  log(id, "mandate_created", `Mandate proposed: up to ${formatUsd(terms.capCents)} for "${terms.goal}".`, terms.capCents);
  return getMandate(id)!;
}

export function getMandate(id: string): Mandate | undefined {
  return getDb().select().from(mandates).where(eq(mandates.id, id)).get();
}

/**
 * Called when PayPal redirects the human back after approval: places the hold and signs
 * the mandate. Safe to call more than once.
 */
export async function activateMandate(id: string): Promise<Mandate> {
  const mandate = getMandate(id);
  if (!mandate) throw new Error(`Unknown mandate ${id}`);
  if (mandate.status !== "pending_approval") return mandate;
  if (!mandate.paypalOrderId) throw new Error(`Mandate ${id} has no PayPal order`);

  const auth = await authorizeOrder(mandate.paypalOrderId);
  const activatedAt = new Date();
  const signedMandate = await signDocument("mandate", id, {
    goal: mandate.goal,
    cap: { amount: auth.amountCents, currency: "USD" },
    constraints: {
      max_per_purchase: mandate.maxPerPurchaseCents,
      allowed_retailers: mandate.allowedRetailers,
      max_purchases: mandate.maxPurchases,
      expires_at: mandate.expiresAt.toISOString(),
    },
    paypal: { order_id: mandate.paypalOrderId, authorization_id: auth.authorizationId },
    approved_at: activatedAt.toISOString(),
  });

  getDb().update(mandates)
    .set({
      status: "active",
      authorizationId: auth.authorizationId,
      authorizationExpiresAt: auth.expiresAt,
      signedMandate,
      activatedAt,
    })
    .where(eq(mandates.id, id))
    .run();
  log(id, "mandate_approved", `Approved in PayPal. ${formatUsd(auth.amountCents)} is now on hold for the agent.`, auth.amountCents);
  return getMandate(id)!;
}

export type PurchaseOutcome =
  | { status: "completed"; purchase: Purchase; remainingCents: Cents }
  | { status: "blocked"; violation: PolicyViolation | "PAYPAL_LIMIT" | "PRODUCT_UNAVAILABLE"; reason: string; product?: Product }
  | { status: "declined"; reason: string; product: Product };

/**
 * The only path by which the agent can move money. Every attempt — allowed, blocked or
 * declined — lands in the activity trail.
 */
export async function purchase(input: {
  mandateId: string;
  productId: string;
  reasoning: string;
  /** Sandbox only: makes PayPal decline the capture to exercise recovery paths. */
  simulateDecline?: boolean;
}): Promise<PurchaseOutcome> {
  const product = await getProduct(input.productId);
  if (!product) {
    return { status: "blocked", violation: "PRODUCT_UNAVAILABLE", reason: `Product ${input.productId} has no purchasable offer.` };
  }

  // Check policy and reserve the amount atomically so concurrent purchases cannot overspend.
  const reservation = getDb().transaction((tx) => {
    const mandate = tx.select().from(mandates).where(eq(mandates.id, input.mandateId)).get();
    if (!mandate) return { ok: false as const, violation: "MANDATE_NOT_ACTIVE" as const, reason: "Unknown mandate." };
    const [{ value: purchaseCount }] = tx
      .select({ value: count() })
      .from(purchases)
      .where(eq(purchases.mandateId, mandate.id))
      .all();

    const decision = evaluatePurchase(
      { ...mandate, purchaseCount },
      { amountCents: product.priceCents, retailer: product.retailer },
      new Date(),
    );
    if (!decision.allowed) return { ok: false as const, violation: decision.violation, reason: decision.reason };

    tx.update(mandates)
      .set({ spentCents: mandate.spentCents + product.priceCents })
      .where(eq(mandates.id, mandate.id))
      .run();
    return { ok: true as const, mandate, remainingCents: decision.remainingAfterCents };
  });

  if (!reservation.ok) {
    log(input.mandateId, "purchase_blocked", `Blocked "${product.title}" (${formatUsd(product.priceCents)}): ${reservation.reason}`, product.priceCents);
    return { status: "blocked", violation: reservation.violation, reason: reservation.reason, product };
  }

  const { mandate } = reservation;
  const purchaseId = newId("pur");
  const releaseReservation = () =>
    getDb().update(mandates)
      .set({ spentCents: sql`${mandates.spentCents} - ${product.priceCents}` })
      .where(eq(mandates.id, mandate.id))
      .run();

  let captureId: string;
  try {
    const capture = await captureAuthorization({
      authorizationId: mandate.authorizationId!,
      amountCents: product.priceCents,
      idempotencyKey: purchaseId,
      invoiceId: purchaseId,
      final: false,
      mockErrorCode: input.simulateDecline ? "PAYER_CANNOT_PAY" : undefined,
    });
    captureId = capture.captureId;
  } catch (error) {
    releaseReservation();
    if (error instanceof PayPalError && error.issue === "MAX_CAPTURE_AMOUNT_EXCEEDED") {
      const reason = `PayPal refused the capture: it exceeds the authorized hold.`;
      log(mandate.id, "purchase_blocked", `Blocked "${product.title}" (${formatUsd(product.priceCents)}): ${reason}`, product.priceCents);
      return { status: "blocked", violation: "PAYPAL_LIMIT", reason, product };
    }
    if (error instanceof PayPalError && DECLINE_ISSUES.has(error.issue)) {
      const reason = `PayPal declined the payment (${error.issue}).`;
      log(mandate.id, "payment_declined", `Declined "${product.title}" (${formatUsd(product.priceCents)}): ${reason}`, product.priceCents);
      return { status: "declined", reason, product };
    }
    throw error;
  }

  const createdAt = new Date();
  const signedReceipt = await signDocument("intent-receipt", purchaseId, {
    mandate: { id: mandate.id, goal: mandate.goal, fingerprint: fingerprint(mandate.signedMandate!) },
    item: { product_id: product.id, title: product.title, retailer: product.retailer, url: product.url },
    amount: { value: product.priceCents, currency: "USD" },
    agent_reasoning: input.reasoning,
    paypal: { authorization_id: mandate.authorizationId, capture_id: captureId },
    purchased_at: createdAt.toISOString(),
  });

  getDb().insert(purchases)
    .values({
      id: purchaseId,
      mandateId: mandate.id,
      productId: product.id,
      title: product.title,
      retailer: product.retailer,
      productUrl: product.url,
      imageUrl: product.imageUrl,
      amountCents: product.priceCents,
      reasoning: input.reasoning,
      captureId,
      signedReceipt,
      createdAt,
    })
    .run();
  log(mandate.id, "purchase_completed", `Bought "${product.title}" from ${product.retailer} for ${formatUsd(product.priceCents)}.`, product.priceCents);

  return { status: "completed", purchase: getDb().select().from(purchases).where(eq(purchases.id, purchaseId)).get()!, remainingCents: reservation.remainingCents };
}

/** Ends the mandate and releases any unspent part of the hold back to the buyer. */
export async function closeMandate(id: string, reason: "closed" | "revoked"): Promise<Mandate> {
  const mandate = getMandate(id);
  if (!mandate) throw new Error(`Unknown mandate ${id}`);
  if (mandate.status !== "active" && mandate.status !== "pending_approval") return mandate;

  if (mandate.authorizationId && mandate.spentCents < mandate.capCents) {
    await voidAuthorization(mandate.authorizationId);
  }
  getDb().update(mandates).set({ status: reason }).where(eq(mandates.id, id)).run();
  const released = formatUsd(mandate.capCents - mandate.spentCents);
  log(id, reason === "revoked" ? "mandate_revoked" : "mandate_closed", `Mandate ${reason}. ${released} released back to the buyer.`);
  return getMandate(id)!;
}

export interface MandateDetail {
  mandate: Mandate;
  purchases: Purchase[];
  activity: (typeof activity.$inferSelect)[];
}

export function getMandateDetail(id: string): MandateDetail | undefined {
  const mandate = getMandate(id);
  if (!mandate) return undefined;
  return {
    mandate,
    purchases: getDb().select().from(purchases).where(eq(purchases.mandateId, id)).orderBy(desc(purchases.createdAt)).all(),
    activity: getDb().select().from(activity).where(eq(activity.mandateId, id)).orderBy(desc(activity.createdAt)).all(),
  };
}
