import type { NextRequest } from "next/server";
import { closeMandate } from "@/lib/mandates/service";
import { rateLimit } from "@/lib/rate-limit";

/** The human pulls the agent's spending authority; PayPal releases the unspent hold. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/mandates/[id]/revoke">) {
  const limited = rateLimit(req, "actions");
  if (limited) return limited;
  const { id } = await ctx.params;
  const mandate = await closeMandate(id, "revoked");
  return Response.json({ status: mandate.status });
}
