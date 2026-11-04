import type { NextRequest } from "next/server";
import { getMandateDetail } from "@/lib/mandates/service";

/** Live mandate state for the ledger panel: terms, purchases and the activity trail. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/mandates/[id]">) {
  const { id } = await ctx.params;
  const detail = getMandateDetail(id);
  if (!detail) return Response.json({ error: "Mandate not found" }, { status: 404 });

  const { signedMandate: _token, ...mandate } = detail.mandate;
  return Response.json({
    mandate,
    purchases: detail.purchases.map(({ signedReceipt: _receipt, ...p }) => p),
    activity: detail.activity,
  });
}
