import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** Short, URL-safe, prefixed identifiers such as `mdt_8k2q9x4m1c7v`. */
export function newId(prefix: "mdt" | "pur" | "act"): string {
  const bytes = randomBytes(12);
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return `${prefix}_${id}`;
}
