# Devpost submission kit

Copy-paste material for the Devpost form. Keep it in sync with what the demo actually shows.

## Project name

Signed Intent

## Elevator pitch (≤ 200 characters)

Give your AI agent a budget, not your wallet. Approve one spending limit in PayPal; the agent shops inside it, and every purchase comes with a signed receipt.

## About the project

### Inspiration

AI agents can already browse and shop, but letting one pay is all-or-nothing: hand over your payment method and hope. Nothing stops an agent from overspending, buying the wrong thing, or being steered by a prompt injection on a product page. And when something goes wrong there's no record of what you actually authorized, so a dispute is your word against a log file. PayPal has said its seller protection for AI purchases doesn't assess agent intent. We wanted to make agent spending accountable on the payment rails people already trust.

### What it does

Signed Intent is a shopping agent that can only spend money you've approved in PayPal.

1. **Mandate.** Tell the agent what you want and your limit, e.g. "a water filter pitcher, up to $40, this week." It proposes a mandate; you approve it once in PayPal, which places a real authorization hold for exactly that amount.
2. **Shop.** The agent searches 100M+ real products (via Channel3), compares price, rating and fit, and chooses.
3. **Policy, then pay.** Before any money moves, the server looks up the real price itself, checks the mandate's rules (remaining budget, per-item cap, approved retailers, purchase count, expiry), and only then partially captures the PayPal authorization.
4. **Blocked means blocked.** Ask it to buy a $120 blender on a $40 mandate and the policy refuses. Even if our code had a bug, PayPal itself rejects captures above the hold.
5. **Signed receipt.** Every purchase produces an Ed25519-signed receipt binding your mandate, the item, the agent's reasoning and the PayPal capture ID. Anyone can verify it with our public key.
6. **Revoke anytime.** One click voids the authorization and PayPal releases what's left.
7. **Disputes answer themselves.** When a buyer disputes a purchase in PayPal, the dispute agent matches it to its signed receipt, verifies the signatures, checks every capture under the mandate, and recommends a response (submit evidence, refund, or message the buyer) with the text drafted. You approve before anything goes to PayPal.

### How we built it

- **PayPal Orders v2 + Payments v2 (sandbox):** `intent: AUTHORIZE` orders for mandates, buyer approval in a popup, authorization, multiple partial captures with `final_capture: false`, voids for revocation, refunds, `PayPal-Request-Id` idempotency on every money-moving call, and `PayPal-Mock-Response` to demo declines. We verified every primitive in the sandbox before building (see `docs/sandbox-findings.md`).
- **PayPal Disputes API + webhooks:** disputes are pulled on demand or pushed by a `CUSTOMER.DISPUTE.*` webhook (signature verified with PayPal), matched to receipts by capture ID, and answered with `send-message`, `provide-evidence` (multipart) or a refund. Sandbox `escalate` / `require-evidence` let us demo the full evidence path.
- **Google Gemini via the Vercel AI SDK 7:** a tool-calling agent (`requestMandate`, `searchProducts`, `purchase`, `checkMandate`) with automatic fallback to lighter models when rate-limited.
- **Channel3:** real product search and authoritative price lookup, so the model can never misstate what it pays.
- **Dispute agent:** deterministic evidence checks (signatures, mandate binding, approval before purchase, total captures within the terms) feed a Gemini structured-output call that recommends and drafts the response, with a rule-based fallback.
- **Policy engine:** a pure, unit-tested function. The model never votes on whether money moves. Budget is reserved atomically in SQLite so concurrent purchases can't overspend.
- **Signing:** compact JWS (EdDSA/Ed25519) with `jose`, public key served at `/.well-known/jwks.json`.
- **Next.js 16 + Tailwind**, SQLite with Drizzle, Playwright end-to-end test that drives the real PayPal sandbox approval.
- **Built with Claude Code** as an AI pair programmer.

### Challenges we ran into

- PayPal allows captures up to 115% of an authorization, so PayPal alone isn't a strict cap. We enforce the exact mandate amount in our policy layer and treat PayPal's `MAX_CAPTURE_AMOUNT_EXCEEDED` as a second, independent backstop.
- PayPal's hosted sandbox MCP server was failing during the hackathon, so we integrated the REST APIs directly with our own typed client.
- Mock decline codes differ by endpoint: `INSTRUMENT_DECLINED` returns an empty 403 on authorization captures, while `PAYER_CANNOT_PAY` works.
- A buyer sees several partial captures of one authorization as "duplicate charges", so dispute evidence lists every capture under the mandate. And our own signatures prove the *scope* of what was approved, not consent, so the evidence leads with PayPal's authorization record, which PayPal can check itself.
- Gemini's free tier allows only a few requests per minute and an agent turn needs several, so we added a model fallback chain and trimmed redundant steps.

### Accomplishments we're proud of

- The agent is genuinely constrained: money only moves through one audited function, behind deterministic policy and a real PayPal hold.
- Receipts are verifiable by anyone, not just stored in our database, and they get used: a dispute arrives already matched to its evidence.
- It works on PayPal's side too: on a real sandbox "charged twice" dispute, the agent's evidence went in through the Disputes API and PayPal ruled for the seller (*buyer billed only once*) about three minutes later.
- A full end-to-end test runs the real sandbox approval and purchase in about 35 seconds.

### What we learned

PayPal primitives that have existed for years (authorizations, partial captures, voids) map almost perfectly onto agent spending mandates. The hard part of agentic commerce isn't letting agents pay; it's proving what they were allowed to do.

### What's next

- Attach the signed receipt as a PDF document on the dispute, and track delivery so "item not received" claims can be answered too.
- Standing mandates ("groceries every Friday, max $60") on vaulted PayPal accounts, which we've already verified work in the sandbox.
- An MCP server so any agent (Claude, ChatGPT) can spend under a Signed Intent mandate.

## Built with

nextjs, typescript, react, tailwindcss, paypal, paypal-orders-api, paypal-disputes-api, gemini, vercel-ai-sdk, channel3, sqlite, drizzle, jose, playwright, render

## Tools used (AI and sponsor tools)

- **Google Gemini (gemini-3.5-flash, flash-lite fallbacks):** the shopping agent's reasoning and tool calling, and the dispute agent's recommendation.
- **Vercel AI SDK 7:** agent loop, streaming, tool calling and the chat UI hook.
- **Channel3 API:** product search (`/v1/search`) and price lookup (`/v1/products/{id}`).
- **PayPal REST APIs (sandbox):** Orders v2 (AUTHORIZE), Payments v2 (capture, void, refund), Disputes v1, Webhooks.
- **Render:** hosting (Blueprint with a persistent disk).
- **Claude Code:** AI pair programmer used throughout development.

## Testing instructions for judges

- Hosted demo: `<RENDER URL>`
- Sandbox buyer login for the PayPal approval popup: `<JUDGE BUYER EMAIL>` / `<PASSWORD>` (a dedicated sandbox Personal account)
- Flow: click the water-filter example → Approve with PayPal → watch the purchase → ask "Now try to buy a $120 blender anyway" → open the signed receipt.
- Disputes: open the **Disputes** tab; a pre-made sandbox dispute is there with its evidence checks and the agent's recommendation. "How it works" explains the design in one screen.

---

# Demo video script (target 2:30, hard limit < 3:00)

Revoke is left out to keep time; mention it on the closing card if there is room. Create the dispute before recording with `scripts/open-sandbox-dispute.mts` (it takes a few minutes to appear in the API), never on camera. After approving the evidence, a won dispute (PayPal's ruling shown in green) makes a strong last frame for the scene.

Record at 1440×900 or larger, browser zoom 110%. No copyrighted music. An AI voiceover is fine.

| Time | Screen | Voiceover |
|---|---|---|
| 0:00–0:15 | Title card, then the empty console | "AI agents can shop for us now. But letting one pay means handing over your wallet and hoping. Signed Intent gives your agent a budget instead." |
| 0:15–0:35 | Click the water-filter example; mandate card appears | "I ask for a water filter pitcher, up to forty dollars, this week. The agent doesn't get my card. It proposes a mandate: forty dollars, expiring in a week." |
| 0:35–0:55 | PayPal popup, log in, Continue; ledger turns active | "I approve it once in PayPal. That places a real forty-dollar authorization hold. That hold is the agent's entire budget." |
| 0:55–1:25 | Product grid, then "Paid $19.99 via PayPal"; ledger drops to $20.01 | "The agent searches real products across retailers, compares price and ratings, and buys one. Our server checks the mandate and captures part of the PayPal hold. Twenty dollars left." |
| 1:25–1:50 | Type "Now try to buy a $120 blender anyway"; red blocked card | "Now I tell it to buy a hundred-and-twenty-dollar blender. Blocked. The policy decides, not the model. And even if our code failed, PayPal rejects any capture above the hold." |
| 1:50–2:10 | Tick decline toggle, ask for another item; amber declined card | "Payments fail in real life too. Here PayPal declines, and the agent reports it instead of pretending it worked." |
| 2:10–2:25 | Receipt page, signature valid, expand JWS | "Every purchase gets a signed receipt: what I asked for, what the agent bought, why, and the PayPal capture ID. Anyone can verify it with our public key." |
| 2:25–2:50 | Disputes tab → open the pre-made dispute; checks all green; recommendation card | "And when a buyer disputes a purchase, the receipt becomes evidence. The dispute agent matches the dispute to its receipt, verifies every signature, and drafts a response. I approve it, and it goes to PayPal." |
| 2:50–2:58 | Closing card | "Signed Intent: give your agent a budget, not your wallet." |

## Rough early-check cut (60–90 s)

Use rows 0:15–1:50 plus the receipt shot. The polished version replaces it before Nov 12.
