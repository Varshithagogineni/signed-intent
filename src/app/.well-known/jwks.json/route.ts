import { connection } from "next/server";
import { publicJwks } from "@/lib/signing";

/** Public keys for independently verifying signed mandates and intent receipts. */
export async function GET() {
  // The key comes from runtime configuration, so this must not be prerendered at build time.
  await connection();
  return Response.json(await publicJwks());
}
