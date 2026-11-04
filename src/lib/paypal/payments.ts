import "server-only";
import { type Cents, toCents, toPayPalValue } from "@/lib/money";
import { paypalRequest } from "./client";

interface Link {
  rel: string;
  href: string;
}

interface Amount {
  currency_code: string;
  value: string;
}

interface Order {
  id: string;
  status: string;
  links?: Link[];
  purchase_units?: {
    payments?: {
      authorizations?: { id: string; status: string; amount: Amount; expiration_time: string }[];
    };
  }[];
}

interface Capture {
  id: string;
  status: string;
  amount: Amount;
}

export interface MandateOrder {
  orderId: string;
  approveUrl: string;
}

/**
 * Creates an AUTHORIZE-intent order for the mandate cap. Once the buyer approves it,
 * the authorization becomes a hold the agent can draw down with partial captures.
 */
export async function createMandateOrder(input: {
  mandateId: string;
  capCents: Cents;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<MandateOrder> {
  const order = await paypalRequest<Order>("/v2/checkout/orders", {
    idempotencyKey: `mandate-order-${input.mandateId}`,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: input.mandateId,
          custom_id: input.mandateId,
          description: input.description.slice(0, 127),
          amount: { currency_code: "USD", value: toPayPalValue(input.capCents) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Signed Intent",
            user_action: "CONTINUE",
            shipping_preference: "NO_SHIPPING",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
  });

  const approveUrl = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  if (!approveUrl) throw new Error(`PayPal order ${order.id} has no approval link`);
  return { orderId: order.id, approveUrl };
}

export interface Authorization {
  authorizationId: string;
  amountCents: Cents;
  expiresAt: Date;
}

/** Authorizes a buyer-approved order, placing the hold on the buyer's PayPal account. */
export async function authorizeOrder(orderId: string): Promise<Authorization> {
  const order = await paypalRequest<Order>(`/v2/checkout/orders/${orderId}/authorize`, {
    method: "POST",
    idempotencyKey: `authorize-${orderId}`,
  });
  const auth = order.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new Error(`PayPal order ${orderId} returned no authorization`);
  return {
    authorizationId: auth.id,
    amountCents: toCents(auth.amount.value),
    expiresAt: new Date(auth.expiration_time),
  };
}

export interface CaptureResult {
  captureId: string;
  status: string;
  amountCents: Cents;
}

/** Captures part of an authorization. `final` releases whatever remains of the hold. */
export async function captureAuthorization(input: {
  authorizationId: string;
  amountCents: Cents;
  idempotencyKey: string;
  invoiceId: string;
  final: boolean;
  mockErrorCode?: string;
}): Promise<CaptureResult> {
  const capture = await paypalRequest<Capture>(`/v2/payments/authorizations/${input.authorizationId}/capture`, {
    idempotencyKey: input.idempotencyKey,
    mockErrorCode: input.mockErrorCode,
    body: {
      amount: { currency_code: "USD", value: toPayPalValue(input.amountCents) },
      invoice_id: input.invoiceId,
      final_capture: input.final,
    },
  });
  return { captureId: capture.id, status: capture.status, amountCents: toCents(capture.amount.value) };
}

/** Releases the unused remainder of an authorization (mandate revoked or closed). */
export async function voidAuthorization(authorizationId: string): Promise<void> {
  await paypalRequest(`/v2/payments/authorizations/${authorizationId}/void`, {
    method: "POST",
    idempotencyKey: `void-${authorizationId}`,
  });
}

/** Refunds a capture in full, or partially when `amountCents` is given. */
export async function refundCapture(input: {
  captureId: string;
  amountCents?: Cents;
  note: string;
  idempotencyKey: string;
}): Promise<{ refundId: string; status: string }> {
  const refund = await paypalRequest<{ id: string; status: string }>(`/v2/payments/captures/${input.captureId}/refund`, {
    idempotencyKey: input.idempotencyKey,
    body: {
      note_to_payer: input.note.slice(0, 255),
      ...(input.amountCents !== undefined && {
        amount: { currency_code: "USD", value: toPayPalValue(input.amountCents) },
      }),
    },
  });
  return { refundId: refund.id, status: refund.status };
}
