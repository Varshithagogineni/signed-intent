import type { NextRequest } from "next/server";
import { activateMandate } from "@/lib/mandates/service";

/**
 * PayPal's return URL. Places the hold, then hands control back to the chat: the approval
 * opens in a popup, so we notify the opener and close; without one we redirect home.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/mandates/[id]/approved">) {
  const { id } = await ctx.params;

  let outcome: { ok: true } | { ok: false; error: string };
  try {
    await activateMandate(id);
    outcome = { ok: true };
  } catch (error) {
    console.error(`Failed to activate mandate ${id}`, error);
    outcome = { ok: false, error: "PayPal approval could not be completed." };
  }

  const message = JSON.stringify({ type: "mandate-approval", mandateId: id, ...outcome });
  const fallback = `/?mandate=${encodeURIComponent(id)}&${outcome.ok ? "approved=1" : "failed=1"}`;
  const html = `<!doctype html><meta charset="utf-8"><title>Returning to Signed Intent</title>
<p style="font-family:system-ui;padding:2rem">${outcome.ok ? "Mandate approved." : "Approval failed."} Returning…</p>
<script>
  if (window.opener) { window.opener.postMessage(${message}, location.origin); window.close(); }
  else { location.replace(${JSON.stringify(fallback)}); }
</script>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
