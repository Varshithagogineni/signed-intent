import type { DisputeAnalysis } from "@/lib/db/schema";
import { type Cents, formatUsd } from "@/lib/money";

/** PayPal dispute reasons, in words a person can act on. */
export const REASON_LABELS: Record<string, string> = {
  UNAUTHORISED: "Buyer says they didn't authorize the payment",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Buyer says the item isn't what they wanted",
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Buyer says the item never arrived",
  DUPLICATE_TRANSACTION: "Buyer says they were charged twice",
  INCORRECT_AMOUNT: "Buyer says the amount was wrong",
  CREDIT_NOT_PROCESSED: "Buyer says a refund never arrived",
  PAYMENT_BY_OTHER_MEANS: "Buyer says they paid another way",
  CANCELED_RECURRING_BILLING: "Buyer says they cancelled",
  OTHER: "Other problem",
};

export function describeReason(reason: string): string {
  return REASON_LABELS[reason] ?? reason.toLowerCase().replaceAll("_", " ");
}

/** Everything the evidence checks look at, gathered by the dispute service. */
export interface EvidenceInput {
  dispute: { reason: string; amountCents: Cents | null; captureId: string | null };
  purchase: {
    id: string;
    title: string;
    retailer: string;
    amountCents: Cents;
    captureId: string;
    reasoning: string;
    createdAt: Date;
  } | null;
  mandate: {
    goal: string;
    capCents: Cents;
    maxPerPurchaseCents: Cents | null;
    allowedRetailers: string[] | null;
    expiresAt: Date;
    activatedAt: Date | null;
    authorizationId: string | null;
  } | null;
  /**
   * Every capture made under the mandate, oldest first. Partial captures of one hold can
   * look like duplicate charges to a buyer, so the evidence lists all of them.
   */
  mandateCaptures: { title: string; amountCents: Cents; captureId: string }[];
  /** Receipt JWS verified against our public key. */
  receiptValid: boolean;
  /** Mandate JWS verified against our public key. */
  mandateValid: boolean;
  /** The receipt's mandate fingerprint equals the hash of the mandate token on file. */
  receiptBoundToMandate: boolean;
}

const domain = (value: string) => value.trim().toLowerCase().replace(/^www\./, "");

export interface EvidenceCheck {
  key: "matched" | "receipt" | "mandate" | "binding" | "approved" | "within_cap" | "amount";
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Deterministic checks of what the signed records prove. These are facts, computed
 * without a model; the dispute agent only interprets them.
 */
export function checkEvidence(input: EvidenceInput): EvidenceCheck[] {
  const { dispute, purchase, mandate } = input;
  if (!purchase || !mandate) {
    return [
      {
        key: "matched",
        label: "Matched to an agent purchase",
        ok: false,
        detail: dispute.captureId
          ? `No signed receipt exists for PayPal capture ${dispute.captureId}.`
          : "PayPal did not include a transaction ID we can match.",
      },
    ];
  }

  const approvedBeforePurchase = mandate.activatedAt !== null && mandate.activatedAt <= purchase.createdAt;
  const insideWindow = purchase.createdAt < mandate.expiresAt;
  const totalCents = input.mandateCaptures.reduce((sum, c) => sum + c.amountCents, 0);
  const termViolations = [
    mandate.maxPerPurchaseCents !== null && purchase.amountCents > mandate.maxPerPurchaseCents
      ? `over the ${formatUsd(mandate.maxPerPurchaseCents)} per-purchase limit`
      : null,
    mandate.allowedRetailers?.length && !mandate.allowedRetailers.map(domain).includes(domain(purchase.retailer))
      ? `${purchase.retailer} is not an approved retailer`
      : null,
  ].filter((v): v is string => v !== null);

  return [
    {
      key: "matched",
      label: "Matched to an agent purchase",
      ok: true,
      detail: `PayPal capture ${purchase.captureId} is "${purchase.title}" from ${purchase.retailer}.`,
    },
    {
      key: "receipt",
      label: "Intent receipt signature",
      ok: input.receiptValid,
      detail: input.receiptValid
        ? "Valid Ed25519 signature: the item, price and agent reasoning are unaltered."
        : "The receipt signature does not verify.",
    },
    {
      key: "mandate",
      label: "Mandate signature",
      ok: input.mandateValid,
      detail: input.mandateValid ? `Valid signature over the buyer's terms: "${mandate.goal}".` : "The mandate signature does not verify.",
    },
    {
      key: "binding",
      label: "Receipt issued under this mandate",
      ok: input.receiptBoundToMandate,
      detail: input.receiptBoundToMandate
        ? "The receipt carries the SHA-256 fingerprint of the signed mandate."
        : "The receipt's mandate fingerprint does not match.",
    },
    {
      key: "approved",
      label: "Buyer approved in PayPal first",
      ok: approvedBeforePurchase && insideWindow,
      detail: !approvedBeforePurchase
        ? "The purchase is not after a PayPal approval on record."
        : !insideWindow
          ? `The purchase came after the mandate expired on ${mandate.expiresAt.toISOString()}.`
          : `Buyer approved PayPal authorization ${mandate.authorizationId} before the agent spent anything, and the purchase was inside the mandate window.`,
    },
    {
      key: "within_cap",
      label: "Within the mandate's terms",
      ok: totalCents <= mandate.capCents && termViolations.length === 0,
      detail:
        termViolations.length > 0
          ? `This purchase was ${termViolations.join(" and ")}.`
          : `${input.mandateCaptures.length} charge(s) under this mandate total ${formatUsd(totalCents)} of the ${formatUsd(mandate.capCents)} limit.`,
    },
    {
      key: "amount",
      label: "Disputed amount matches",
      ok: dispute.amountCents === null || dispute.amountCents === purchase.amountCents,
      detail:
        dispute.amountCents === null
          ? "PayPal did not report a disputed amount."
          : `Disputed ${formatUsd(dispute.amountCents)}; the receipt records ${formatUsd(purchase.amountCents)}.`,
    },
  ];
}

const INTEGRITY_CHECKS: EvidenceCheck["key"][] = ["receipt", "mandate", "binding", "approved", "within_cap"];

/** True when the signed records prove the buyer authorized this exact spend. */
export function authorizationProven(checks: EvidenceCheck[]): boolean {
  return checks.some((c) => c.key === "matched" && c.ok) && INTEGRITY_CHECKS.every((key) => checks.find((c) => c.key === key)?.ok);
}

/**
 * The evidence statement submitted to PayPal, built only from verified facts. It leads with
 * PayPal's own records (which PayPal can check itself); our signatures then show scope.
 */
export function evidenceNotes(input: EvidenceInput, appUrl: string): string {
  const { purchase, mandate } = input;
  if (!purchase || !mandate) return "";
  const charges = input.mandateCaptures.map((c) => `${c.captureId} ${formatUsd(c.amountCents)} "${c.title}"`).join("; ");
  return [
    `The buyer approved PayPal authorization ${mandate.authorizationId} for ${formatUsd(mandate.capCents)} on ${mandate.activatedAt?.toISOString()}, logged in to their own PayPal account, before any money moved.`,
    `The approval was for an AI shopping agent to buy: "${mandate.goal}". This payment, capture ${purchase.captureId} for ${formatUsd(purchase.amountCents)}, is a partial capture of that authorization: "${purchase.title}" from ${purchase.retailer} on ${purchase.createdAt.toISOString()}.`,
    `All captures of this authorization (${input.mandateCaptures.length}): ${charges}. They are separate items, not duplicate charges, and together stay within the approved amount.`,
    `Agent's recorded reasoning: "${purchase.reasoning}"`,
    `The mandate terms and this purchase receipt are signed (Ed25519) and can be verified: ${appUrl}/receipts/${purchase.id} with the public key at ${appUrl}/.well-known/jwks.json.`,
  ].join("\n");
}

/**
 * Rule-based recommendation, used when the model is unavailable and as the baseline
 * the model is told about.
 */
export function baselineAnalysis(input: EvidenceInput, checks: EvidenceCheck[], appUrl: string): Omit<DisputeAnalysis, "author" | "createdAt"> {
  const reason = describeReason(input.dispute.reason).toLowerCase();
  if (!input.purchase) {
    return {
      recommendation: "send_message",
      confidence: "low",
      summary: `${describeReason(input.dispute.reason)}, but this payment has no agent receipt.`,
      rationale: "Without a signed receipt there is no agent evidence to offer. Ask the buyer for details before deciding.",
      draft: "Hi, we're looking into this payment. Could you tell us more about the problem so we can resolve it quickly?",
    };
  }
  if (!authorizationProven(checks)) {
    const failed = checks.filter((c) => !c.ok).map((c) => c.label.toLowerCase());
    return {
      recommendation: "refund",
      confidence: "high",
      summary: `The signed records don't fully support this purchase (${failed.join(", ")}).`,
      rationale: "When our own evidence fails a check, the fair and safe outcome is to refund the buyer.",
      draft: `We're sorry. We have refunded ${formatUsd(input.purchase.amountCents)} for "${input.purchase.title}".`,
    };
  }

  switch (input.dispute.reason) {
    case "UNAUTHORISED":
    case "DUPLICATE_TRANSACTION":
    case "INCORRECT_AMOUNT":
      return {
        recommendation: "provide_evidence",
        confidence: "high",
        summary: `${describeReason(input.dispute.reason)}, but the signed mandate proves they approved this spend in PayPal.`,
        rationale: `Every check passes: the buyer approved the hold first, the agent stayed inside the limit, and one capture of the exact amount was made. That directly answers a claim that ${reason}.`,
        draft: evidenceNotes(input, appUrl),
      };
    case "MERCHANDISE_OR_SERVICE_NOT_RECEIVED":
      return {
        recommendation: "send_message",
        confidence: "medium",
        summary: "The purchase was authorized, but the buyer says it never arrived.",
        rationale: "Signed Intent proves authorization and scope, not delivery. Check the order with the retailer and update the buyer; refund if it can't be found.",
        draft: `Hi, our records show "${input.purchase.title}" was ordered from ${input.purchase.retailer} under the mandate you approved. We're checking delivery with the retailer and will update you shortly.`,
      };
    case "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED":
      return {
        recommendation: "refund",
        confidence: "medium",
        summary: "The purchase was authorized, but the buyer says the agent chose the wrong item.",
        rationale: "The signatures prove authorization, not that the item fit the goal. Refunding keeps the buyer's trust in letting the agent shop.",
        draft: `Sorry the agent's choice didn't fit. We have refunded ${formatUsd(input.purchase.amountCents)} for "${input.purchase.title}".`,
      };
    default:
      return {
        recommendation: "send_message",
        confidence: "medium",
        summary: `${describeReason(input.dispute.reason)}. The purchase itself was authorized.`,
        rationale: "The receipt proves what was bought and that it was approved, but not what happened afterwards. Ask the buyer before conceding.",
        draft: `Hi, our records show "${input.purchase.title}" was bought from ${input.purchase.retailer} under the mandate you approved. Can you tell us more so we can sort this out?`,
      };
  }
}
