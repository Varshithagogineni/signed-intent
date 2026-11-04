/**
 * Sandbox smoke test for the payment primitives Signed Intent depends on.
 *
 * Usage (Node 24+, runs TypeScript natively):
 *   node --env-file=.env.local scripts/sandbox-smoke.ts create [amount]
 *   node --env-file=.env.local scripts/sandbox-smoke.ts authorize <orderId>
 *   node --env-file=.env.local scripts/sandbox-smoke.ts capture <authorizationId> <amount> [--final] [--decline]
 *   node --env-file=.env.local scripts/sandbox-smoke.ts vault
 */

const API_BASE = "https://api-m.sandbox.paypal.com";

async function getAccessToken(): Promise<string> {
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.local");
  }
  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}` },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`OAuth failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function paypal(path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": crypto.randomUUID(),
      Prefer: "return=representation",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function approveLink(json: { links?: { rel: string; href: string }[] }) {
  return json.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "create": {
      const amount = args[0] ?? "40.00";
      const { status, json } = await paypal("/v2/checkout/orders", {
        intent: "AUTHORIZE",
        purchase_units: [
          {
            description: "Signed Intent smoke test mandate",
            custom_id: "smoke-test",
            amount: { currency_code: "USD", value: amount },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              user_action: "CONTINUE",
              return_url: "https://example.com/return",
              cancel_url: "https://example.com/cancel",
            },
          },
        },
      });
      console.log(status, json.id, json.status);
      console.log("Approve as the sandbox buyer:", approveLink(json));
      break;
    }

    case "authorize": {
      const { status, json } = await paypal(`/v2/checkout/orders/${args[0]}/authorize`);
      const auth = json.purchase_units?.[0]?.payments?.authorizations?.[0];
      console.log(status, json.status ?? json.name, json.details ?? "");
      if (auth) console.log("Authorization:", auth.id, auth.status, auth.amount, "expires", auth.expiration_time);
      break;
    }

    case "capture": {
      const [authorizationId, amount] = args;
      const headers: Record<string, string> = args.includes("--decline")
        ? { "PayPal-Mock-Response": JSON.stringify({ mock_application_codes: "INSTRUMENT_DECLINED" }) }
        : {};
      const { status, json } = await paypal(
        `/v2/payments/authorizations/${authorizationId}/capture`,
        { amount: { currency_code: "USD", value: amount }, final_capture: args.includes("--final") },
        headers,
      );
      console.log(status, json.id ?? json.name, json.status ?? "", json.details ?? "");
      break;
    }

    case "vault": {
      const { status, json } = await paypal("/v3/vault/setup-tokens", {
        payment_source: {
          paypal: {
            usage_type: "MERCHANT",
            experience_context: {
              return_url: "https://example.com/return",
              cancel_url: "https://example.com/cancel",
            },
          },
        },
      });
      console.log(status, json.id ?? json.name, json.status ?? "", json.details ?? "");
      console.log("Approve as the sandbox buyer:", approveLink(json));
      break;
    }

    default:
      console.log("Commands: create [amount] | authorize <orderId> | capture <authId> <amount> [--final] [--decline] | vault");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
