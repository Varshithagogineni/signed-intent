import { describe, expect, it } from "vitest";
import { authorizationProven, baselineAnalysis, checkEvidence, describeOutcome, type EvidenceInput, outcomeResult } from "./evidence";

const APP_URL = "https://signed-intent.example";

const valid: EvidenceInput = {
  dispute: { reason: "UNAUTHORISED", amountCents: 1999, captureId: "CAP123", buyerStatements: ["I never bought this."] },
  purchase: {
    id: "pur_abc",
    title: "Brita Pitcher",
    retailer: "target.com",
    amountCents: 1999,
    captureId: "CAP123",
    reasoning: "BPA-free, 10-cup, well rated and under budget.",
    createdAt: new Date("2026-11-06T12:05:00Z"),
  },
  mandate: {
    goal: "water filter pitcher, up to $40",
    capCents: 4000,
    maxPerPurchaseCents: null,
    allowedRetailers: null,
    expiresAt: new Date("2026-11-13T12:00:00Z"),
    activatedAt: new Date("2026-11-06T12:00:00Z"),
    authorizationId: "AUTH9",
  },
  mandateCaptures: [{ title: "Brita Pitcher", amountCents: 1999, captureId: "CAP123" }],
  receiptValid: true,
  mandateValid: true,
  receiptBoundToMandate: true,
};

const failing = (input: EvidenceInput) => checkEvidence(input).filter((c) => !c.ok).map((c) => c.key);

describe("checkEvidence", () => {
  it("passes every check for an authorized purchase", () => {
    const checks = checkEvidence(valid);
    expect(failing(valid)).toEqual([]);
    expect(authorizationProven(checks)).toBe(true);
  });

  it("reports an unmatched dispute with a single failing check", () => {
    const input = { ...valid, purchase: null, mandate: null };
    expect(failing(input)).toEqual(["matched"]);
    expect(authorizationProven(checkEvidence(input))).toBe(false);
  });

  it("fails when a signature does not verify", () => {
    expect(failing({ ...valid, receiptValid: false })).toEqual(["receipt"]);
    expect(failing({ ...valid, mandateValid: false })).toEqual(["mandate"]);
    expect(failing({ ...valid, receiptBoundToMandate: false })).toEqual(["binding"]);
  });

  it("fails when the purchase happened before approval", () => {
    const input = { ...valid, mandate: { ...valid.mandate!, activatedAt: new Date("2026-11-06T12:10:00Z") } };
    expect(failing(input)).toEqual(["approved"]);
  });

  it("checks the total of every capture, not just the disputed one", () => {
    const input = {
      ...valid,
      mandateCaptures: [...valid.mandateCaptures, { title: "Filters", amountCents: 2500, captureId: "CAP456" }],
    };
    expect(failing(input)).toEqual(["within_cap"]);
  });

  it("enforces the per-purchase limit and retailer allowlist", () => {
    expect(failing({ ...valid, mandate: { ...valid.mandate!, maxPerPurchaseCents: 1000 } })).toEqual(["within_cap"]);
    expect(failing({ ...valid, mandate: { ...valid.mandate!, allowedRetailers: ["bestbuy.com"] } })).toEqual(["within_cap"]);
  });

  it("flags a disputed amount that differs from the receipt without failing authorization", () => {
    const input = { ...valid, dispute: { ...valid.dispute, amountCents: 2500 } };
    expect(failing(input)).toEqual(["amount"]);
    expect(authorizationProven(checkEvidence(input))).toBe(true);
  });
});

describe("baselineAnalysis", () => {
  const analyze = (input: EvidenceInput) => baselineAnalysis(input, checkEvidence(input), APP_URL);

  it("fights an unauthorized claim with the signed evidence", () => {
    const analysis = analyze(valid);
    expect(analysis.recommendation).toBe("provide_evidence");
    expect(analysis.draft).toContain(`${APP_URL}/receipts/pur_abc`);
    expect(analysis.draft).toContain("AUTH9");
    expect(analysis.draft).toContain("All captures of this authorization (1)");
  });

  it("refunds when our own evidence fails a check", () => {
    expect(analyze({ ...valid, receiptValid: false }).recommendation).toBe("refund");
  });

  it("refunds a wrong-item claim even though the purchase was authorized", () => {
    const input = { ...valid, dispute: { ...valid.dispute, reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" } };
    expect(analyze(input).recommendation).toBe("refund");
  });

  it("asks the buyer for details when there is no receipt", () => {
    expect(analyze({ ...valid, purchase: null, mandate: null }).recommendation).toBe("send_message");
  });
});

describe("describeOutcome", () => {
  it("states PayPal's ruling and who kept the money", () => {
    const won = { code: "RESOLVED_SELLER_FAVOUR", reason: "BUYER_BILLED_ONLY_ONCE" };
    expect(describeOutcome(won)).toBe("PayPal ruled in your favor: buyer billed only once");
    expect(outcomeResult(won)).toBe("won");
    expect(outcomeResult({ code: "RESOLVED_BUYER_FAVOUR", reason: null })).toBe("lost");
    expect(outcomeResult(null)).toBeNull();
  });
});
