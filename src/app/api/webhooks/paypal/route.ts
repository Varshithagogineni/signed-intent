import { env } from "@/lib/env";
import { syncDispute } from "@/lib/disputes/service";
import { verifyWebhookSignature, type WebhookEvent } from "@/lib/paypal/webhooks";

const DISPUTE_EVENTS = new Set(["CUSTOMER.DISPUTE.CREATED", "CUSTOMER.DISPUTE.UPDATED", "CUSTOMER.DISPUTE.RESOLVED"]);

/**
 * PayPal webhook receiver. Every event is verified with PayPal before we act on it, so a
 * forged request cannot create or change a dispute.
 */
export async function POST(req: Request) {
  if (!env().PAYPAL_WEBHOOK_ID) return Response.json({ error: "Webhooks are not configured" }, { status: 503 });

  let event: WebhookEvent;
  try {
    event = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!(await verifyWebhookSignature(req.headers, event))) {
    console.warn(`Rejected webhook ${event.id} with an invalid signature`);
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const disputeId = typeof event.resource?.dispute_id === "string" ? event.resource.dispute_id : null;
  if (DISPUTE_EVENTS.has(event.event_type) && disputeId) {
    // A failure here returns 500 so PayPal retries the delivery.
    await syncDispute(disputeId);
  }
  return Response.json({ received: true });
}
