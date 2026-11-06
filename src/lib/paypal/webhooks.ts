import "server-only";
import { env } from "@/lib/env";
import { paypalRequest } from "./client";

export interface WebhookEvent {
  id: string;
  event_type: string;
  resource: Record<string, unknown>;
}

const SIGNATURE_HEADERS = {
  auth_algo: "paypal-auth-algo",
  cert_url: "paypal-cert-url",
  transmission_id: "paypal-transmission-id",
  transmission_sig: "paypal-transmission-sig",
  transmission_time: "paypal-transmission-time",
} as const;

/**
 * Asks PayPal to confirm the event was sent by PayPal for our webhook, so nobody can
 * forge dispute notifications. Returns false when any signature header is missing.
 */
export async function verifyWebhookSignature(headers: Headers, event: WebhookEvent): Promise<boolean> {
  const webhookId = env().PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not configured");

  const fields: Record<string, string> = {};
  for (const [field, header] of Object.entries(SIGNATURE_HEADERS)) {
    const value = headers.get(header);
    if (!value) return false;
    fields[field] = value;
  }

  const { verification_status } = await paypalRequest<{ verification_status: string }>(
    "/v1/notifications/verify-webhook-signature",
    { body: { ...fields, webhook_id: webhookId, webhook_event: event } },
  );
  return verification_status === "SUCCESS";
}
