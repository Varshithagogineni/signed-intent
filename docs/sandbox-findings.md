# Sandbox findings (Nov 4, 2026)

Verified against `api-m.sandbox.paypal.com` with `scripts/sandbox-smoke.mts`.

| Primitive | Result | Notes |
|---|---|---|
| OAuth client credentials | ✅ | Token lifetime 32,400 s (9 h). Scopes include `authcapture`, `vault/payment-tokens/readwrite`, `disputes/*`, `payouts`, `refund`, `webhooks`. |
| `intent: AUTHORIZE` order → buyer approval → authorize | ✅ | Authorization valid for **29 days** (`expiration_time` = order date + 29 d). |
| Multiple partial captures (`final_capture: false`) | ✅ | $25 + $10 captured from one $40 authorization. |
| Over-capture | ✅ blocked | `422 MAX_CAPTURE_AMOUNT_EXCEEDED`. PayPal's default overage ceiling is **115%** of the authorized amount, so our policy layer must enforce the exact mandate cap; PayPal is the backstop. |
| Mock decline on authorization capture | ✅ | Use `PayPal-Mock-Response: {"mock_application_codes":"PAYER_CANNOT_PAY"}` → `422`. `INSTRUMENT_DECLINED` returns an empty `403` on this endpoint (card-only code). |
| Vault: setup token → buyer approval → payment token | ✅ | `usage_type: MERCHANT`. Setup token reaches `APPROVED`; `POST /v3/vault/payment-tokens` returns a `vault_id`. |
| Merchant-initiated charge with `vault_id` | ✅ | `intent: CAPTURE` order completes immediately with no buyer present. Enables standing (recurring) mandates. |

## Design implications

- **One-off mandates** use AUTHORIZE + partial captures: the human approves one hold, the agent spends from it.
- **Standing mandates** ("groceries every Friday, max $60") use the vaulted PayPal account; the policy engine is the only gate, so every charge must pass policy checks and emit a signed receipt.
- Every money-moving call sets `PayPal-Request-Id` for idempotency.
