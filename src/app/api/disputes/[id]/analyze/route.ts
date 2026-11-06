import type { NextRequest } from "next/server";
import { analyze } from "@/lib/disputes/service";
import { rateLimit } from "@/lib/rate-limit";

/** Runs the dispute agent. `{ "force": true }` asks for a fresh recommendation. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/disputes/[id]/analyze">) {
  const limited = rateLimit(req, "analyze");
  if (limited) return limited;

  const { id } = await ctx.params;
  const { force = false } = (await req.json().catch(() => ({}))) as { force?: boolean };
  try {
    return Response.json(await analyze(id, force));
  } catch (error) {
    console.error(`Dispute analysis failed for ${id}`, error);
    return Response.json({ error: "The dispute agent could not analyze this dispute." }, { status: 500 });
  }
}
