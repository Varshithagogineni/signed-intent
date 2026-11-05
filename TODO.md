# Signed Intent — Build Plan

Hackathon: Build What's Next with PayPal and AI (Devpost)
Deadline: **Thu Nov 12, 2026, 12:00 PM PT** · Demo must stay live until **Dec 15, 2026**

Legend: `[ ]` todo · `[x]` done · `[~]` in progress · ⭐ must-have for the demo

## Day 1 — Wed Nov 4 · Validate the payment primitives
- [x] Sandbox app credentials work (OAuth token, scopes include auth/capture, vault, disputes, payouts)
- [x] Next.js 16 + TypeScript + Tailwind scaffold
- [x] Smoke-test script (`scripts/sandbox-smoke.mts`)
- [x] ⭐ AUTHORIZE order → buyer approval → authorization
- [x] ⭐ Two partial captures against one authorization (`final_capture: false`)
- [x] ⭐ Mock decline via `PayPal-Mock-Response: PAYER_CANNOT_PAY` (see docs/sandbox-findings.md)
- [x] Vault go/no-go (setup token → payment token → charge with `vault_id`)
- [x] Create GitHub repo, MIT license, first push

## Day 2 — Thu Nov 5 · Thin end-to-end slice (early eligibility check)
- [x] ⭐ PayPal client module (OAuth caching, idempotency keys, typed errors)
- [x] ⭐ Data layer: mandates, captures, receipts, events (SQLite + Drizzle)
- [x] ⭐ Mandate flow: chat goal → mandate order → approve (popup) → authorization stored
- [x] ⭐ Agent can make one purchase (capture) inside the mandate
- [x] End-to-end browser test (Playwright): approve → buy → overspend blocked → receipt verifies
- [x] Model fallback chain + readable rate-limit errors (Gemini free tier is 5 req/min)
- [ ] Make GitHub repo public (needs owner)
- [x] Production build passes; lazy DB connection; `/api/health`
- [x] `render.yaml` blueprint + signing key script
- [ ] Deploy to Render (needs owner's Render account)
- [ ] Rough 60–90s video + Devpost draft submitted for early check

## Day 3 — Fri Nov 6 · Policy layer + signed receipts
- [x] ⭐ Policy engine: remaining budget, retailer allowlist, expiry, max per purchase, purchase count (unit tested)
- [x] ⭐ Blocked attempts logged and shown in UI
- [x] ⭐ Mandates and receipts signed as JWS (Ed25519); public key at `/.well-known/jwks.json`
- [x] ⭐ Receipt verification page (`/receipts/[id]`)
- [x] Decline path (`PAYER_CANNOT_PAY` mock via UI toggle)

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
