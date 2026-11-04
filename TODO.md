# Signed Intent — Build Plan

Hackathon: Build What's Next with PayPal and AI (Devpost)
Deadline: **Thu Nov 12, 2026, 12:00 PM PT** · Demo must stay live until **Dec 15, 2026**

Legend: `[ ]` todo · `[x]` done · `[~]` in progress · ⭐ must-have for the demo

## Day 1 — Wed Nov 4 · Validate the payment primitives
- [x] Sandbox app credentials work (OAuth token, scopes include auth/capture, vault, disputes, payouts)
- [x] Next.js 16 + TypeScript + Tailwind scaffold
- [x] Smoke-test script (`scripts/sandbox-smoke.ts`)
- [~] ⭐ AUTHORIZE order → buyer approval → authorization
- [ ] ⭐ Two partial captures against one authorization (`final_capture: false`)
- [ ] ⭐ Mock decline via `PayPal-Mock-Response: INSTRUMENT_DECLINED`
- [ ] Vault go/no-go (setup token → payment token → charge with `vault_id`)
- [ ] Create GitHub repo, MIT license, first push

## Day 2 — Thu Nov 5 · Thin end-to-end slice (early eligibility check)
- [ ] ⭐ PayPal client module (OAuth caching, idempotency keys, typed errors)
- [ ] ⭐ Data layer: mandates, captures, receipts, events (SQLite + Drizzle)
- [ ] ⭐ Mandate flow: chat goal → mandate order → approve → authorization stored
- [ ] ⭐ Agent can make one purchase (capture) inside the mandate
- [ ] Deploy skeleton to Render
- [ ] Rough 60–90s video + Devpost draft submitted for early check

## Day 3 — Fri Nov 6 · Policy layer + signed receipts
- [ ] ⭐ Policy engine: remaining budget, merchant, category, expiry, max per purchase
- [ ] ⭐ Blocked attempts logged and shown in UI
- [ ] ⭐ Mandates and receipts signed as JWS (Ed25519), hash in order `custom_id`
- [ ] ⭐ Receipt verification page (`/receipts/[id]`)
- [ ] Decline recovery path in the agent loop

## Day 4 — Sat Nov 7 · Disputes + refunds
- [ ] ⭐ Webhook endpoint with signature verification
- [ ] ⭐ Dispute agent: fetch dispute → match receipt → evidence packet → recommend
- [ ] ⭐ Human-approved action: refund / accept claim / provide evidence
- [ ] Sandbox dispute opened end to end

## Day 5 — Sun Nov 8 · Product design pass
- [ ] ⭐ Mandate card, live spend ledger, agent activity feed, receipt viewer, dispute view
- [ ] Landing page that explains the problem in one screen
- [ ] Empty, loading and error states
- [ ] Stretch: Bryntum timeline of mandates, captures and dispute deadlines

## Day 6 — Mon Nov 9 · Feature freeze + hardening
- [ ] Seed demo merchant catalog
- [ ] Rate-limit AI routes; token refresh verified
- [ ] Unit tests for policy engine and receipt signing
- [ ] Three clean rehearsals on the hosted URL

## Day 7 — Tue Nov 10 · Story
- [ ] README: problem, architecture diagram, setup, judge instructions, tools used
- [ ] Video script + recording (< 2:50)

## Day 8 — Wed Nov 11 · Submit
- [ ] Repo public with license visible; YouTube video public
- [ ] All Devpost fields complete; re-verify demo from a clean browser

## Day 9 — Thu Nov 12 · Buffer only
- [ ] Confirm submission before 12:00 PM PT
