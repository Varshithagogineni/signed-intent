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
  disputed_transactions?: { seller_transaction_id?: string; buyer_transaction_id?: string; invoice_number?: string }[];
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
  /** The invoice ID we sent on the capture, which is our purchase ID: a fallback link. */
  invoiceId: string | null;
  messages: { postedBy: string; content: string; postedAt: string | null }[];
  sellerResponseDueAt: Date | null;
  actions: DisputeAction[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * PayPal documents action links with hyphens in some places and underscores in others, so
 * match on either the `rel` or the endpoint path (`…/provide-evidence`).
 */
function advertises(links: Link[], action: DisputeAction): boolean {
  const hyphenated = action.replaceAll("_", "-");
  return links.some((l) => l.rel === action || l.rel === hyphenated || l.href.endsWith(`/${hyphenated}`));
}

function normalize(d: PayPalDisputeResource): PayPalDispute {
  const transaction = d.disputed_transactions?.[0];
  return {
    id: d.dispute_id,
    reason: d.reason,
    status: d.status,
    stage: d.dispute_life_cycle_stage ?? null,
    amountCents: d.dispute_amount ? toCents(d.dispute_amount.value) : null,
    captureId: transaction?.seller_transaction_id ?? null,
    invoiceId: transaction?.invoice_number ?? null,
    messages: (d.messages ?? []).map((m) => ({ postedBy: m.posted_by, content: m.content, postedAt: m.time_posted ?? null })),
    sellerResponseDueAt: d.seller_response_due_date ? new Date(d.seller_response_due_date) : null,
    actions: disputeActions.filter((a) => advertises(d.links ?? [], a)),
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

/**
 * Submits written evidence. PayPal requires `multipart/form-data` whose `input` part is a
 * JSON field (not a file), so the body is encoded by hand rather than with FormData.
 */
export async function provideEvidence(id: string, notes: string): Promise<void> {
  const input = { evidences: [{ evidence_type: "OTHER", notes: notes.slice(0, 2000) }] };
  const boundary = `signed-intent-${crypto.randomUUID()}`;
  const data = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="input"',
    "Content-Type: application/json",
    "",
    JSON.stringify(input),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  await paypalRequest(path(id, "provide-evidence"), {
    raw: { contentType: `multipart/form-data; boundary=${boundary}`, data },
  });
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
  // PayPal can take a moment to move an escalated claim to UNDER_REVIEW, which
  // require-evidence needs; a PayPalError here tells the human to retry shortly.
  await paypalRequest(path(id, "require-evidence"), { body: { action: "SELLER_EVIDENCE" } });
}
