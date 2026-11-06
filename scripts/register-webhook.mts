/**
 * Registers the PayPal webhook that notifies Signed Intent about disputes.
 *
 * Usage (Node 24+):
 *   node --env-file=.env.local scripts/register-webhook.mts https://your-app.onrender.com
 *
 * Prints the webhook ID; set it as PAYPAL_WEBHOOK_ID on the server.
 */

const API_BASE = "https://api-m.sandbox.paypal.com";
const EVENTS = ["CUSTOMER.DISPUTE.CREATED", "CUSTOMER.DISPUTE.UPDATED", "CUSTOMER.DISPUTE.RESOLVED"];

const appUrl = process.argv[2]?.replace(/\/$/, "");
if (!appUrl?.startsWith("https://")) {
  console.error("Pass the public https URL of the app, e.g. https://signed-intent.onrender.com");
  process.exit(1);
}

const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;
if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) throw new Error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET");

const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
const tokenRes = await fetch(`${API_BASE}/v1/oauth2/token`, {
  method: "POST",
  headers: { Authorization: `Basic ${credentials}` },
  body: new URLSearchParams({ grant_type: "client_credentials" }),
});
const { access_token: token } = await tokenRes.json();

const res = await fetch(`${API_BASE}/v1/notifications/webhooks`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    url: `${appUrl}/api/webhooks/paypal`,
    event_types: EVENTS.map((name) => ({ name })),
  }),
});
const body = await res.json();
if (!res.ok) {
  console.error(`PayPal returned ${res.status}:`, JSON.stringify(body, null, 2));
  process.exit(1);
}
console.log(`Webhook registered for ${body.url}`);
console.log(`PAYPAL_WEBHOOK_ID=${body.id}`);
