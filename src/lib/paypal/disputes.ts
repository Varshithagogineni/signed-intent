import "server-only";
import { env } from "@/lib/env";
import { type Cents, toCents } from "@/lib/money";
import { paypalRequest } from "./client";

/** Seller-side actions PayPal advertises on a dispute through its HATEOAS links. */
export const disputeActions = ["send_message", "accept_claim", "provide_evidence", "escalate", "make_offer"] as const;
export type DisputeAction = (typeof disputeActions)[number];

interface Link {
  rel: string;
  href: string;
  method?: string;
}

interface Money {
  currency_code: string;
  value: string;
}

interface PayPalDisputeResource {
  dispute_id: string;
  create_time: string;
  update_time: string;
  reason: string;
  status: string;
  dispute_amount?: Money;
  dispute_life_cycle_stage?: string;
  seller_response_due_date?: string;
  disputed_transactions?: { seller_transaction_id?: string; buyer_transaction_id?: string }[];
  messages?: { posted_by: string; time_posted?: string; content: string }[];
  links?: Link[];
}

/** A PayPal dispute normalized to what the dispute desk needs. */
export interface PayPalDispute {
  id: string;
  reason: string;
  status: string;
  stage: string | null;
  amountCents: Cents | null;
  /** Our capture ID, which links the dispute to a signed intent receipt. */
  captureId: string | null;
  messages: { postedBy: string; content: string; postedAt: string | null }[];
  sellerResponseDueAt: Date | null;
  actions: DisputeAction[];
  createdAt: Date;
  updatedAt: Date;
}

function normalize(d: PayPalDisputeResource): PayPalDispute {
  const advertised = new Set(d.links?.map((l) => l.rel));
  return {
    id: d.dispute_id,
    reason: d.reason,
    status: d.status,
    stage: d.dispute_life_cycle_stage ?? null,
    amountCents: d.dispute_amount ? toCents(d.dispute_amount.value) : null,
    captureId: d.disputed_transactions?.find((t) => t.seller_transaction_id)?.seller_transaction_id ?? null,
    messages: (d.messages ?? []).map((m) => ({ postedBy: m.posted_by, content: m.content, postedAt: m.time_posted ?? null })),
    sellerResponseDueAt: d.seller_response_due_date ? new Date(d.seller_response_due_date) : null,
    actions: disputeActions.filter((a) => advertised.has(a)),
    createdAt: new Date(d.create_time),
    updatedAt: new Date(d.update_time),
  };
}

/** IDs of the merchant's disputes, newest first. */
export async function listDisputeIds(): Promise<string[]> {
  const { items = [] } = await paypalRequest<{ items?: { dispute_id: string }[] }>("/v1/customer/disputes?page_size=50");
  return items.map((d) => d.dispute_id);
}

export async function getDispute(id: string): Promise<PayPalDispute> {
  return normalize(await paypalRequest<PayPalDisputeResource>(`/v1/customer/disputes/${encodeURIComponent(id)}`));
}

const path = (id: string, action: string) => `/v1/customer/disputes/${encodeURIComponent(id)}/${action}`;

/** Posts a message to the buyer in the dispute conversation. */
export async function sendDisputeMessage(id: string, message: string): Promise<void> {
  await paypalRequest(path(id, "send-message"), { body: { message: message.slice(0, 2000) } });
}

/** Concedes the dispute; PayPal refunds the buyer the disputed amount. */
export async function acceptClaim(id: string, note: string): Promise<void> {
  await paypalRequest(path(id, "accept-claim"), { body: { note: note.slice(0, 2000) } });
}

/** Submits written evidence. PayPal requires `multipart/form-data` with a JSON `input` part. */
export async function provideEvidence(id: string, notes: string): Promise<void> {
  const form = new FormData();
  const input = { evidences: [{ evidence_type: "OTHER", notes: notes.slice(0, 2000) }] };
  form.append("input", new Blob([JSON.stringify(input)], { type: "application/json" }));
  await paypalRequest(path(id, "provide-evidence"), { form });
}

/**
 * Sandbox only: escalates an inquiry to a claim and asks the seller for evidence, so the
 * evidence flow can be demonstrated without waiting days for PayPal to do it.
 */
export async function sandboxRequestSellerEvidence(id: string): Promise<void> {
  if (env().PAYPAL_ENVIRONMENT !== "sandbox") throw new Error("Sandbox-only helper");
  const dispute = await getDispute(id);
  if (dispute.actions.includes("escalate")) {
    await paypalRequest(path(id, "escalate"), { body: { note: "Escalating so the merchant can submit signed evidence." } });
  }
  await paypalRequest(path(id, "require-evidence"), { body: { action: "SELLER_EVIDENCE" } });
}
