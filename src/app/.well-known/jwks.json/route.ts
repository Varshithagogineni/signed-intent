import { publicJwks } from "@/lib/signing";

/** Public keys for independently verifying signed mandates and intent receipts. */
export async function GET() {
  return Response.json(await publicJwks());
}
