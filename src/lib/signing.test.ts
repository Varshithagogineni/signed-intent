import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

type Signing = typeof import("./signing");
let signing: Signing;

beforeAll(async () => {
  // env() validates these on first use; the dev signing key is generated next to DATABASE_PATH.
  Object.assign(process.env, {
    PAYPAL_CLIENT_ID: "test",
    PAYPAL_CLIENT_SECRET: "test",
    GOOGLE_GENERATIVE_AI_API_KEY: "test",
    CHANNEL3_API_KEY: "test",
    DATABASE_PATH: join(mkdtempSync(join(tmpdir(), "signed-intent-")), "test.db"),
  });
  signing = await import("./signing");
});

describe("signed documents", () => {
  it("round-trips claims through sign and verify", async () => {
    const token = await signing.signDocument("intent-receipt", "pur_1", { amount: { value: 1999, currency: "USD" } });
    const claims = await signing.verifyDocument<{ amount: { value: number }; sub?: string; iss?: string }>("intent-receipt", token);
    expect(claims.sub).toBe("pur_1");
    expect(claims.iss).toBe("signed-intent");
    expect(claims.amount.value).toBe(1999);
  });

  it("rejects a token whose payload was altered", async () => {
    const token = await signing.signDocument("intent-receipt", "pur_1", { amount: { value: 1999 } });
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ iss: "signed-intent", sub: "pur_1", amount: { value: 1 } })).toString("base64url");
    await expect(signing.verifyDocument("intent-receipt", `${header}.${forged}.${signature}`)).rejects.toThrow();
  });

  it("rejects a mandate presented as a receipt", async () => {
    const mandate = await signing.signDocument("mandate", "mdt_1", { goal: "pitcher" });
    await expect(signing.verifyDocument("intent-receipt", mandate)).rejects.toThrow(/Expected a intent-receipt document/);
  });

  it("publishes only the public half of the key", async () => {
    const { keys } = await signing.publicJwks();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519", alg: "EdDSA", use: "sig" });
    expect(keys[0]).not.toHaveProperty("d");
  });

  it("fingerprints tokens deterministically", () => {
    expect(signing.fingerprint("abc")).toBe(signing.fingerprint("abc"));
    expect(signing.fingerprint("abc")).not.toBe(signing.fingerprint("abd"));
  });
});
