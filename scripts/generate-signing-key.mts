/**
 * Prints a new Ed25519 private key as a JWK, ready to paste into SIGNING_PRIVATE_JWK.
 *
 *   node scripts/generate-signing-key.mts
 *
 * Keep it secret. Rotating it invalidates verification of receipts signed with the old key.
 */
import { exportJWK, generateKeyPair } from "jose";

const { privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
console.log(JSON.stringify(await exportJWK(privateKey)));
