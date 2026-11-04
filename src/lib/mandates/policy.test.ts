import { describe, expect, it } from "vitest";
import { evaluatePurchase, type MandateState } from "./policy";

const now = new Date("2026-11-06T12:00:00Z");

const activeMandate: MandateState = {
  status: "active",
  capCents: 4000,
  spentCents: 0,
  maxPerPurchaseCents: null,
  allowedRetailers: null,
  maxPurchases: null,
  purchaseCount: 0,
  expiresAt: new Date("2026-11-13T00:00:00Z"),
};

describe("evaluatePurchase", () => {
  it("allows a purchase inside the budget and reports what remains", () => {
    expect(evaluatePurchase(activeMandate, { amountCents: 2500, retailer: "bestbuy.com" }, now)).toEqual({
      allowed: true,
      remainingAfterCents: 1500,
    });
  });

  it("allows spending exactly the remaining budget", () => {
    const decision = evaluatePurchase({ ...activeMandate, spentCents: 3500 }, { amountCents: 500, retailer: "x.com" }, now);
    expect(decision).toEqual({ allowed: true, remainingAfterCents: 0 });
  });

  it("blocks a purchase over the remaining budget", () => {
    const decision = evaluatePurchase({ ...activeMandate, spentCents: 3500 }, { amountCents: 12000, retailer: "x.com" }, now);
    expect(decision).toMatchObject({ allowed: false, violation: "EXCEEDS_REMAINING_BUDGET" });
  });

  it("blocks when the mandate is not active", () => {
    const decision = evaluatePurchase({ ...activeMandate, status: "pending_approval" }, { amountCents: 100, retailer: "x.com" }, now);
    expect(decision).toMatchObject({ allowed: false, violation: "MANDATE_NOT_ACTIVE" });
  });

  it("blocks after expiry", () => {
    const decision = evaluatePurchase(
      { ...activeMandate, expiresAt: new Date("2026-11-06T11:59:59Z") },
      { amountCents: 100, retailer: "x.com" },
      now,
    );
    expect(decision).toMatchObject({ allowed: false, violation: "MANDATE_EXPIRED" });
  });

  it("enforces the per-purchase limit", () => {
    const decision = evaluatePurchase(
      { ...activeMandate, maxPerPurchaseCents: 2000 },
      { amountCents: 2001, retailer: "x.com" },
      now,
    );
    expect(decision).toMatchObject({ allowed: false, violation: "EXCEEDS_PER_PURCHASE_LIMIT" });
  });

  it("enforces the retailer allowlist, ignoring case and www", () => {
    const mandate = { ...activeMandate, allowedRetailers: ["BestBuy.com"] };
    expect(evaluatePurchase(mandate, { amountCents: 100, retailer: "www.bestbuy.com" }, now).allowed).toBe(true);
    expect(evaluatePurchase(mandate, { amountCents: 100, retailer: "amazon.com" }, now)).toMatchObject({
      allowed: false,
      violation: "RETAILER_NOT_ALLOWED",
    });
  });

  it("enforces the maximum number of purchases", () => {
    const decision = evaluatePurchase(
      { ...activeMandate, maxPurchases: 1, purchaseCount: 1 },
      { amountCents: 100, retailer: "x.com" },
      now,
    );
    expect(decision).toMatchObject({ allowed: false, violation: "PURCHASE_COUNT_EXCEEDED" });
  });
});
