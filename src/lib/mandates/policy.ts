import { type Cents, formatUsd } from "@/lib/money";

/** The mandate terms and running totals the policy engine needs. */
export interface MandateState {
  status: string;
  capCents: Cents;
  spentCents: Cents;
  maxPerPurchaseCents: Cents | null;
  allowedRetailers: string[] | null;
  maxPurchases: number | null;
  purchaseCount: number;
  expiresAt: Date;
}

export interface PurchaseRequest {
  amountCents: Cents;
  retailer: string;
}

export type PolicyViolation =
  | "MANDATE_NOT_ACTIVE"
  | "MANDATE_EXPIRED"
  | "EXCEEDS_REMAINING_BUDGET"
  | "EXCEEDS_PER_PURCHASE_LIMIT"
  | "RETAILER_NOT_ALLOWED"
  | "PURCHASE_COUNT_EXCEEDED";

export type PolicyDecision =
  | { allowed: true; remainingAfterCents: Cents }
  | { allowed: false; violation: PolicyViolation; reason: string };

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

/**
 * Decides whether the agent may spend `request.amountCents` under this mandate.
 * Pure and deterministic: the model never gets a vote on whether money moves.
 */
export function evaluatePurchase(mandate: MandateState, request: PurchaseRequest, now: Date): PolicyDecision {
  const deny = (violation: PolicyViolation, reason: string): PolicyDecision => ({
    allowed: false,
    violation,
    reason,
  });

  if (mandate.status !== "active") {
    return deny("MANDATE_NOT_ACTIVE", `The mandate is ${mandate.status.replace("_", " ")}, not active.`);
  }
  if (now >= mandate.expiresAt) {
    return deny("MANDATE_EXPIRED", `The mandate expired on ${mandate.expiresAt.toISOString()}.`);
  }

  const remaining = mandate.capCents - mandate.spentCents;
  if (request.amountCents > remaining) {
    return deny(
      "EXCEEDS_REMAINING_BUDGET",
      `${formatUsd(request.amountCents)} exceeds the ${formatUsd(remaining)} left of the ${formatUsd(mandate.capCents)} mandate.`,
    );
  }
  if (mandate.maxPerPurchaseCents !== null && request.amountCents > mandate.maxPerPurchaseCents) {
    return deny(
      "EXCEEDS_PER_PURCHASE_LIMIT",
      `${formatUsd(request.amountCents)} exceeds the ${formatUsd(mandate.maxPerPurchaseCents)} per-purchase limit.`,
    );
  }
  if (mandate.allowedRetailers?.length) {
    const allowed = mandate.allowedRetailers.map(normalizeDomain);
    if (!allowed.includes(normalizeDomain(request.retailer))) {
      return deny("RETAILER_NOT_ALLOWED", `${request.retailer} is not one of the approved retailers (${allowed.join(", ")}).`);
    }
  }
  if (mandate.maxPurchases !== null && mandate.purchaseCount >= mandate.maxPurchases) {
    return deny("PURCHASE_COUNT_EXCEEDED", `The mandate allows at most ${mandate.maxPurchases} purchase(s).`);
  }

  return { allowed: true, remainingAfterCents: remaining - request.amountCents };
}
