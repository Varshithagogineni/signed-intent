# Devpost submission kit

Copy-paste material for the Devpost form. Keep it in sync with what the demo actually shows.

## Project name

Signed Intent

## Elevator pitch (≤ 200 characters)

Give your AI agent a budget, not your wallet. Approve one spending limit in PayPal; the agent shops inside it, and every purchase comes with a signed receipt.

## About the project

### Inspiration

AI agents can already browse and shop, but letting one pay is all-or-nothing: hand over your payment method and hope. Nothing stops an agent from overspending, buying the wrong thing, or being steered by a prompt injection on a product page. And when something goes wrong there's no record of what you actually authorized, so a dispute is your word against a log file. We wanted to make agent spending accountable on the payment rails people already trust.

**Who it's for:** people who want an AI agent to shop for them without handing over their wallet, and the agent platforms and merchants who need proof of what the buyer approved when a payment is disputed.

### What it does

Signed Intent is a shopping agent that can only spend money you've approved in PayPal.

1. **Mandate.** Tell the agent what you want and your limit, e.g. "a water filter pitcher, up to $40, this week." It proposes a mandate; you approve it once in PayPal, which places a real authorization hold for exactly that amount.
2. **Shop, then ask.** The agent searches 100M+ real products (via Channel3), checks the live listings of the best ones, and shows a shortlist with its top pick. It buys only when you say so, and it answers questions like a real assistant. An "agent computer" window shows every step it takes: each search, listing check, policy decision, PayPal call and receipt signature, with the real endpoint behind it.
3. **Policy, then pay.** Before any money moves, the server looks up the real price itself, checks the mandate's rules (remaining budget, per-item cap, approved retailers, purchase count, expiry), and only then partially captures the PayPal authorization.
4. **Blocked means blocked.** Ask it to buy a $120 blender on a $40 mandate and the policy refuses. Even if our code had a bug, PayPal itself rejects captures above the hold.
5. **Signed receipt.** Every purchase produces an Ed25519-signed receipt binding your mandate, the item, the agent's reasoning and the PayPal capture ID. Anyone can verify it with our public key.
6. **Revoke anytime.** One click voids the authorization and PayPal releases what's left.
7. **Disputes answer themselves.** When a buyer disputes a purchase in PayPal, the dispute agent matches it to its signed receipt, verifies the signatures, checks every capture under the mandate, and recommends a response (submit evidence, refund, accept the claim, or message the buyer) with the text drafted. You approve before anything goes to PayPal.

### How we built it

- **PayPal Orders v2 + Payments v2 (sandbox):** `intent: AUTHORIZE` orders for mandates, buyer approval in a popup, authorization, multiple partial captures with `final_capture: false`, voids for revocation, refunds, `PayPal-Request-Id` idempotency on every money-moving call, and `PayPal-Mock-Response` to demo declines. We verified every primitive in the sandbox before building (see `docs/sandbox-findings.md`).
- **PayPal Disputes API + webhooks:** disputes are pulled on demand or pushed by a `CUSTOMER.DISPUTE.*` webhook (signature verified with PayPal), matched to receipts by capture ID, and answered with `send-message`, `provide-evidence` (multipart) or a refund. Sandbox `escalate` / `require-evidence` let us demo the full evidence path.
- **Google Gemini via the Vercel AI SDK 7:** a conversational, tool-calling agent (`requestMandate`, `searchProducts`, `inspectProduct`, `recommendProducts`, `purchase`, `checkMandate`) that shortlists, asks before buying, and falls back to lighter models when rate-limited. Every tool call is rendered as a step in the "agent computer".
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

- Check out at the retailer itself. In this prototype Signed Intent is the merchant of record: each capture pays our sandbox business account and no retailer order is placed.
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
- **Render:** deployment Blueprint (`render.yaml`, Node web service with a persistent disk).
- **Claude Code:** AI pair programmer used throughout development.
- **ElevenLabs (eleven_v3):** text-to-speech narration for the demo video; the demo itself is a real, unedited run of the app against the PayPal sandbox, with waits sped up.

## Demo video

https://youtu.be/1s4wg5ph96c

## Testing instructions for judges

- Hosted demo: `<RENDER URL>`
- Sandbox buyer login for the PayPal approval popup: `<JUDGE BUYER EMAIL>` / `<PASSWORD>` (a dedicated sandbox Personal account)
- Flow: click the water-filter example → Approve with PayPal → watch the agent computer search and check listings → click **Buy this** on the top pick → ask "Now try to buy a $120 blender anyway" → open the signed receipt. You can also ask it questions at any point.
- Disputes: open the **Disputes** tab; a pre-made sandbox dispute is there with its evidence checks and the agent's recommendation. "How it works" explains the design in one screen.

---

# Demo video (final cut, 2:50)

Recorded automatically against the real app and the PayPal sandbox at 1920×1080 (Playwright), with CSS zoom-ins on what the narration describes, waits sped up and labelled, and one continuous, conversational ElevenLabs narration (eleven_v3 model); scenes are cut to the narration's word timings. Tooling lives outside the repo in `video/tooling` (`tts_full.mjs`, `record.cjs`, `assemble.py`). Open a fresh sandbox dispute with `scripts/open-sandbox-dispute.mts` a few minutes before recording.

| # | Screen | Narration |
|---|---|---|
| 1 | Title card | "Hey! This is Signed Intent. It lets you give your AI agent a budget, instead of your wallet." |
| 2 | Empty console, prompt cards | "So, AI agents can shop for us now. But if you actually want one to pay for something? You'd usually have to hand over your card and just... hope it behaves. Signed Intent is for anyone who wants an agent to do their shopping, without that leap of faith." |
| 3 | Click the water-filter card; mandate card (zoom) | "Let's try it. I'll ask for a water filter pitcher, forty dollars max, sometime this week. Notice it never asks for my card. Instead, it proposes a mandate: forty dollars, good for one week." |
| 4 | PayPal approval popup; ledger turns active (zoom) | "I approve that once, in PayPal. That puts a real forty-dollar hold on my account, and that hold is the agent's whole budget." |
| 5 | Agent computer: search, two listing checks, compare; shortlist with Top pick and its question (zoom) | "Now it gets to work, and you can actually watch what it's doing. It searches real products across retailers with Channel3, checks the live listings, compares price and ratings... and then, instead of just buying something, it checks with me first." |
| 6 | Click Buy this: policy, PayPal capture, receipt steps; ledger drops to $20.01 (zoom) | "I like the top pick, so let's buy it. Before a single dollar moves, the policy engine checks the mandate. Then PayPal captures part of the hold, and I get a signed receipt. And the budget on the right updates right away." |
| 7 | Ask "Which of these works best for hard water?"; answer (zoom) | "It's a real conversation, too. I can ask which pitcher handles hard water better, and it answers from the listings it just checked." |
| 8 | Ask for a $120 blender; red blocked step and card (zoom) | "Okay, let's try to break it. Buy me a hundred and twenty dollar blender. Blocked. The policy makes that call, not the AI. And even if our code had a bug, PayPal would still refuse anything above the hold." |
| 9 | Tick the decline toggle, ask for a filter cartridge; amber declined card (zoom) | "Payments fail sometimes, too. Here PayPal declines one, and the agent tells me straight up. Nothing's charged, and my budget's untouched." |
| 10 | Signed receipt: valid signature banner, rows, public key (zoom) | "Every purchase comes with a signed receipt: what I asked for, what it bought, why it picked it, and the PayPal capture ID. Anyone can check it with our public key." |
| 11 | Disputes → fresh dispute: seven green checks, agent recommendation, Approve (zoom) | "Now here's the part no other shopping agent handles: disputes. Say a buyer reports a charge in PayPal. The dispute agent pulls up the signed receipt and runs seven checks. All green. It drafts the evidence, I approve it, and it goes straight to PayPal." |
| 12 | Earlier dispute with the green "won" ruling (zoom) | "And this one's from earlier. A few minutes after the evidence went in, PayPal ruled in our favor." |
| 13 | Closing card | "That's Signed Intent. Give your agent a budget, not your wallet. Built with PayPal, Gemini, and Channel3." |
