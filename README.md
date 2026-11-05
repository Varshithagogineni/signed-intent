# Signed Intent

**Give your AI agent a budget, not your wallet.**

Signed Intent lets a person approve one spending limit in PayPal and hand it to an AI shopping agent. The agent finds real products and pays for them, but only inside the limit. PayPal holds the money, a deterministic policy layer decides every payment, and each purchase produces a cryptographically signed receipt that records what the human asked for and why the agent bought what it did.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) (Build What's Next with PayPal and AI).

---

## The problem

AI agents can now shop, but handing one your payment details is an all-or-nothing bet. Nothing stops an agent from overspending, buying the wrong thing, or being manipulated by a prompt injection on a product page. When a purchase goes wrong, there is no record of what the human actually authorized, so disputes become one person's word against a log file. PayPal's own seller protection for AI-initiated purchases does not assess agent intent.

## How Signed Intent solves it

1. **Mandate.** You tell the agent what you want and your limit ("a water filter pitcher, up to $40, this week"). The agent proposes a mandate and you approve it once in PayPal. That approval creates a PayPal **authorization**: a real hold for exactly that amount.
2. **Shop.** The agent searches 100M+ real products through **Channel3**, compares price, rating and fit, and picks one.
3. **Policy, then pay.** The agent asks to buy. The server looks up the authoritative price itself (the model cannot misstate it), runs the mandate policy (remaining budget, per-item cap, retailer allowlist, purchase count, expiry), reserves the amount atomically, and only then **partially captures** the PayPal authorization.
4. **Blocked means blocked.** Over-budget attempts are refused by the policy layer, and PayPal independently rejects any capture above the hold (`MAX_CAPTURE_AMOUNT_EXCEEDED`). Every attempt, allowed or not, lands in an append-only activity trail.
5. **Signed receipt.** Each purchase emits an Ed25519-signed intent receipt (JWS) that binds the human's mandate, the item, the agent's reasoning and the PayPal capture ID. Anyone can verify it against the public key at `/.well-known/jwks.json`.
6. **Revoke anytime.** One click voids the authorization and PayPal releases the unspent hold.

## PayPal integration

| Capability | API | Where |
|---|---|---|
| Mandate hold | Orders v2 `intent: AUTHORIZE`, buyer approval, `POST /v2/checkout/orders/{id}/authorize` | `src/lib/paypal/payments.ts` |
| Agent purchases | Partial captures `POST /v2/payments/authorizations/{id}/capture` with `final_capture: false` | `src/lib/mandates/service.ts` |
| Hard ceiling | PayPal's over-capture rejection surfaced as a policy block | `src/lib/mandates/service.ts` |
| Revocation | `POST /v2/payments/authorizations/{id}/void` | `src/lib/paypal/payments.ts` |
| Refunds | `POST /v2/payments/captures/{id}/refund` | `src/lib/paypal/payments.ts` |
| Idempotency | `PayPal-Request-Id` on every money-moving call | `src/lib/paypal/client.ts` |
| Failure testing | `PayPal-Mock-Response` (`PAYER_CANNOT_PAY`) from a UI toggle | `src/lib/paypal/client.ts` |

Sandbox behaviour we verified before building is documented in [`docs/sandbox-findings.md`](docs/sandbox-findings.md).

## AI and tools used

| Tool | How it is used |
|---|---|
| **Google Gemini** (`gemini-3.5-flash`, falling back to flash-lite models on rate limits) via the **Vercel AI SDK 7** | The shopping agent: understands the goal, proposes the mandate, searches, compares and decides what to buy through tool calls (`requestMandate`, `checkMandate`, `searchProducts`, `purchase`). The model never decides whether money moves; the policy layer does. |
| **Channel3** | Real product search and authoritative price lookup across 25k+ retailers. |
| **PayPal REST APIs** (sandbox) | Authorizations, partial captures, voids, refunds, negative testing. |
| **jose** | Ed25519 (EdDSA) signing and verification of mandates and receipts. |
| **Claude Code** | AI pair programmer used to build the project. |

## Architecture

```
Browser (Next.js)            Server (Next.js route handlers)                 External
─────────────────            ───────────────────────────────                 ────────
Chat console  ──── /api/chat ──► Gemini agent (AI SDK) ── tools ──┐
                                                                  ├─ searchProducts ──► Channel3
                                                                  ├─ requestMandate ──► PayPal Orders (AUTHORIZE)
PayPal popup ◄─── approve link                                    └─ purchase
     │                                                                 │
     └── /api/mandates/:id/approved ──► authorize + sign mandate       ▼
                                                     policy engine (pure) → reserve → PayPal capture
Ledger panel ◄─── /api/mandates/:id (poll)                              │
Receipt page ◄─── /receipts/:id ◄── verify JWS ◄──── signed receipt ◄───┘
                                       SQLite (mandates, purchases, activity)
```

## Run it locally

Requirements: Node.js 24+, a PayPal developer account, a Google AI Studio key, a Channel3 key.

```bash
git clone https://github.com/Varshithagogineni/signed-intent.git
cd signed-intent
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:3000
```

| Variable | Where to get it |
|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | [developer.paypal.com](https://developer.paypal.com/dashboard/applications/sandbox) → Apps & Credentials → Sandbox |
| `GOOGLE_GENERATIVE_AI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/) → Get API key (free tier works) |
| `CHANNEL3_API_KEY` | [trychannel3.com/developers](https://trychannel3.com/developers) (promo `PAYPAL-HACKATHON-2026`) |

The SQLite database and a development signing key are created automatically in `data/`.

To approve a mandate you need a sandbox **Personal** account: developer.paypal.com → Testing Tools → Sandbox Accounts.

### Try the demo flow

1. Click *"Buy me a water filter pitcher, budget $40, within a week"*.
2. Click **Approve with PayPal** and log in with the sandbox personal account.
3. Watch the agent search and buy; the ledger on the right updates live.
4. Ask *"Now try to buy a $120 blender anyway"* and watch the policy block it.
5. Tick *"make PayPal decline the next payment"* to see decline handling.
6. Open **View signed receipt** to verify the signature.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm test` | Unit tests (policy engine) |
| `npm run test:e2e` | Full browser flow against a running app (needs `SANDBOX_BUYER_EMAIL` / `SANDBOX_BUYER_PASSWORD`) |
| `npm run typecheck` | TypeScript checks |
| `npm run lint` | ESLint |
| `node --env-file=.env.local scripts/sandbox-smoke.ts` | Exercise PayPal sandbox primitives directly |

## Project structure

```
src/
  app/                   routes: console, receipts, API, JWKS
  components/            chat console, tool result cards, mandate ledger
  lib/
    agent/               system prompt and agent tools
    catalog/channel3.ts  product search and price lookup
    db/                  Drizzle schema and SQLite connection
    mandates/            policy engine (pure, tested) and mandate service
    paypal/              REST client and payment helpers
    signing.ts           Ed25519 JWS signing and verification
drizzle/                 SQL migrations
e2e/                     Playwright end-to-end test
docs/                    sandbox findings
scripts/                 sandbox smoke test
```

## Status

Hackathon project, sandbox only. See [`TODO.md`](TODO.md) for the build plan.

## License

[MIT](LICENSE)
