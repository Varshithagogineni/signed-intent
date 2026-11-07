# Signed Intent — Build Plan

Hackathon: Build What's Next with PayPal and AI (Devpost)
Deadline: **Thu Nov 12, 2026, 12:00 PM PT** · Demo, credentials and repo must stay live and unchanged until winners are announced **Dec 21, 2026**

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
- [x] Devpost text + video script (`docs/submission.md`)
- [ ] Rough 60–90s video recorded and uploaded (owner)
- [ ] Devpost draft submitted for early check (owner)

## Day 3 — Fri Nov 6 · Policy layer + signed receipts
- [x] ⭐ Policy engine: remaining budget, retailer allowlist, expiry, max per purchase, purchase count (unit tested)
- [x] ⭐ Blocked attempts logged and shown in UI
- [x] ⭐ Mandates and receipts signed as JWS (Ed25519); public key at `/.well-known/jwks.json`
- [x] ⭐ Receipt verification page (`/receipts/[id]`)
- [x] Decline path (`PAYER_CANNOT_PAY` mock via UI toggle)

## Day 4 — Sat Nov 7 · Disputes + refunds (built Fri Nov 6)
- [x] ⭐ Webhook endpoint with signature verification (+ `scripts/register-webhook.mts`)
- [x] ⭐ Dispute agent: fetch dispute → match receipt → evidence checks → AI recommendation (rule-based fallback)
- [x] ⭐ Human-approved action: provide evidence / message buyer / accept claim / refund
- [x] Independent review of direction and PayPal API usage; fixes applied
- [x] Sandbox dispute opened end to end: PP-R-CVJ-10197002 ("charged twice") synced, matched, analyzed, signed evidence accepted by PayPal (now under review)
- [x] `scripts/open-sandbox-dispute.mts` files a dispute as the sandbox buyer (PayPal has no create-dispute API)
- [x] PayPal ruled PP-R-CVJ-10197002 for the seller (BUYER_BILLED_ONLY_ONCE) ~3 min after our evidence; the desk now shows won/lost
- [ ] Still untested on a live dispute: accept claim, refund (PayPal offered no send-message on chargeback-stage claims). PP-R-HKF-10197004 is open locally if wanted

## Day 5 — Sun Nov 8 · Product design pass
- [x] ⭐ Mandate card, live spend ledger, agent activity feed, receipt viewer, dispute view
- [x] "How it works" page that explains the problem in one screen; shared header nav
- [x] Empty, loading and error states; mobile ledger drawer
- [ ] ~~Stretch: Bryntum timeline~~ (cut: not worth the time before the deadline)

## Day 6 — Mon Nov 9 · Feature freeze + hardening
- [ ] Seed demo merchant catalog
- [x] Rate-limit AI routes (per IP + daily global cap); token refresh verified
- [x] Unit tests for policy engine, receipt signing, dispute evidence and rate limits (28 tests)
- [ ] Three clean rehearsals on the hosted URL

## Day 7 — Tue Nov 10 · Story
- [x] README: problem, architecture diagram, trust model, setup, judge instructions, tools used
- [ ] Video script + recording (< 2:50)

## Day 8 — Wed Nov 11 · Submit
- [ ] Repo public with license visible; YouTube video public
- [ ] All Devpost fields complete; re-verify demo from a clean browser

## Day 9 — Thu Nov 12 · Buffer only
- [ ] Confirm submission before 12:00 PM PT

## Owner checklist (in order)
- [ ] Gemini: turn on pay-as-you-go billing in AI Studio (free tier is 5 req/min; one agent turn uses 4–8)
- [ ] Render: New → Blueprint → this repo; fill secrets; set `APP_URL`; redeploy; open `/api/health`
- [ ] On the hosted site: run the water-filter flow once, then `node --env-file=.env.local scripts/open-sandbox-dispute.mts <pur_… from the receipt>` and press *Check PayPal for disputes* a few minutes later, so judges see a populated Disputes tab
- [ ] Optional: register the webhook against the Render URL and set `PAYPAL_WEBHOOK_ID`
- [ ] Make the GitHub repo public
- [ ] Record the video (script in `docs/submission.md`), upload to YouTube as public
- [ ] Fill Devpost (text in `docs/submission.md`), select sponsor tools, submit

## After judging — Tue Dec 22, 2026
- [ ] Render: suspend/delete the `signed-intent` service and its disk, then remove the card from Billing (do not change the repo or video before winners are announced Dec 21)
