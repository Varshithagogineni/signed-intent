import "server-only";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type CryptoKey,
  exportJWK,
  generateKeyPair,
  importJWK,
  type JWK,
  type JWTPayload,
  jwtVerify,
  SignJWT,
} from "jose";
import { env } from "@/lib/env";

const ALG = "EdDSA";
const ISSUER = "signed-intent";

interface KeyMaterial {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: JWK;
}

let keys: Promise<KeyMaterial> | undefined;

/**
 * Loads the Ed25519 signing key from `SIGNING_PRIVATE_JWK`. In development, a key is
 * generated once and kept next to the database so receipts stay verifiable across restarts.
 */
async function loadKeys(): Promise<KeyMaterial> {
  let privateJwk: JWK;
  const configured = env().SIGNING_PRIVATE_JWK;

  if (configured) {
    privateJwk = JSON.parse(configured);
  } else {
    if (process.env.NODE_ENV === "production") throw new Error("SIGNING_PRIVATE_JWK must be set in production");
    const keyFile = join(dirname(env().DATABASE_PATH), "signing-key.dev.json");
    if (existsSync(keyFile)) {
      privateJwk = JSON.parse(readFileSync(keyFile, "utf8"));
    } else {
      const generated = await generateKeyPair(ALG, { crv: "Ed25519", extractable: true });
      privateJwk = await exportJWK(generated.privateKey);
      mkdirSync(dirname(keyFile), { recursive: true });
      writeFileSync(keyFile, JSON.stringify(privateJwk), { mode: 0o600 });
    }
  }

  const { d: _private, ...publicJwk } = privateJwk;
  const kid = createHash("sha256").update(publicJwk.x ?? "").digest("base64url").slice(0, 16);
  return {
    privateKey: (await importJWK(privateJwk, ALG)) as CryptoKey,
    publicKey: (await importJWK(publicJwk, ALG)) as CryptoKey,
    publicJwk: { ...publicJwk, kid, alg: ALG, use: "sig" },
  };
}

function getKeys(): Promise<KeyMaterial> {
  keys ??= loadKeys();
  return keys;
}

export type TokenType = "mandate" | "intent-receipt";

/** Signs `claims` as a compact JWS whose `typ` header names the document type. */
export async function signDocument(type: TokenType, subject: string, claims: JWTPayload): Promise<string> {
  const { privateKey, publicJwk } = await getKeys();
  return new SignJWT(claims)
    .setProtectedHeader({ alg: ALG, typ: type, kid: publicJwk.kid })
    .setIssuer(ISSUER)
    .setSubject(subject)
    .setIssuedAt()
    .sign(privateKey);
}

/** Verifies the signature, issuer and document type, returning the signed claims. */
export async function verifyDocument<T extends JWTPayload>(type: TokenType, token: string): Promise<T> {
  const { publicKey } = await getKeys();
  const { payload, protectedHeader } = await jwtVerify<T>(token, publicKey, { issuer: ISSUER, algorithms: [ALG] });
  if (protectedHeader.typ !== type) throw new Error(`Expected a ${type} document, got ${protectedHeader.typ}`);
  return payload;
}

/** Public key set so anyone can verify mandates and receipts independently. */
export async function publicJwks(): Promise<{ keys: JWK[] }> {
  return { keys: [(await getKeys()).publicJwk] };
}

/** SHA-256 fingerprint used to bind a receipt to the exact mandate token it was issued under. */
export function fingerprint(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}
