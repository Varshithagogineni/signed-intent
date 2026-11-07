import type { NextRequest } from "next/server";
import { z } from "zod";
import { DisputeActionError, respond, responseActions } from "@/lib/disputes/service";
import { PayPalError } from "@/lib/paypal/client";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  action: z.enum(responseActions),
  text: z.string().max(2000).default(""),
});

/** Sends the response a human approved on the dispute desk to PayPal. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/disputes/[id]/respond">) {
  const limited = rateLimit(req, "actions");
  if (limited) return limited;
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose an action to take." }, { status: 400 });

  const { action, text } = parsed.data;
  if (action !== "sandbox_request_evidence" && action !== "refund" && text.trim().length < 10) {
    return Response.json({ error: "Write at least a sentence before sending this to PayPal." }, { status: 400 });
  }

  try {
    return Response.json(await respond(id, action, text.trim() || "Refund issued for this purchase."));
  } catch (error) {
    if (error instanceof DisputeActionError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof PayPalError) {
      console.error(`PayPal rejected ${action} on ${id}`, error.status, error.issue, error.debugId);
      return Response.json({ error: `PayPal rejected this action (${error.issue}).` }, { status: 502 });
    }
    console.error(`Dispute action ${action} failed for ${id}`, error);
    return Response.json({ error: "Something went wrong sending this to PayPal." }, { status: 500 });
  }
}
