import "server-only";
import { env } from "@/lib/env";

const API_BASE = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

/** Refresh the token this long before PayPal says it expires. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface PayPalErrorDetail {
  issue: string;
  description?: string;
}

/** A non-2xx response from the PayPal REST API, with PayPal's issue codes preserved. */
export class PayPalError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: PayPalErrorDetail[],
    readonly debugId?: string,
  ) {
    super(details[0]?.description ?? code);
    this.name = "PayPalError";
  }

  /** The first PayPal issue code, e.g. `MAX_CAPTURE_AMOUNT_EXCEEDED`. */
  get issue(): string {
    return this.details[0]?.issue ?? this.code;
  }
}

let token: { value: string; expiresAt: number } | undefined;

async function getAccessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt - TOKEN_REFRESH_MARGIN_MS) return token.value;

  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENVIRONMENT } = env();
  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${API_BASE[PAYPAL_ENVIRONMENT]}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}` },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal OAuth failed with status ${res.status}`);

  const body: { access_token: string; expires_in: number } = await res.json();
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return token.value;
}

export interface PayPalRequestOptions {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  /** Sent as `PayPal-Request-Id` so retries of money-moving calls are idempotent. */
  idempotencyKey?: string;
  /** Sandbox negative testing: forces PayPal to return the given error code. */
  mockErrorCode?: string;
}

/** Calls the PayPal REST API with OAuth, JSON handling and typed errors. */
export async function paypalRequest<T>(path: string, options: PayPalRequestOptions = {}): Promise<T> {
  const { method = options.body === undefined ? "GET" : "POST", body, idempotencyKey, mockErrorCode } = options;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${await getAccessToken()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (idempotencyKey) headers["PayPal-Request-Id"] = idempotencyKey;
  if (mockErrorCode) {
    if (env().PAYPAL_ENVIRONMENT !== "sandbox") throw new Error("Mock responses are sandbox-only");
    headers["PayPal-Mock-Response"] = JSON.stringify({ mock_application_codes: mockErrorCode });
  }

  const res = await fetch(`${API_BASE[env().PAYPAL_ENVIRONMENT]}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new PayPalError(res.status, json.name ?? `HTTP_${res.status}`, json.details ?? [], json.debug_id);
  }
  return json as T;
}
