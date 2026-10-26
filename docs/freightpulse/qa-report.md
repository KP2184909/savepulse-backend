# Current readiness — 26 October 2026

This section supersedes historical counts and setup blockers below.

- Local suite: 141/141 PASS.
- TradingView UI: CS11–CS61, BDI and ZIM alerts Active. Superseded CS21 and legacy ZIM Stopped manually. Dedicated sandbox URL, 1D, Any alert() function call; credentials entered by the owner.
- Isolated Supabase sandbox: Edge function version 4 ACTIVE. Synthetic public checks: CS receiver 14/14, BDI adapter 4/4, ZIM adapter 4/4 PASS. Synthetic rows removed. These checks are not actual TradingView delivery.
- Actual TradingView delivery: NOT VERIFIED, no chart events received. Unknown source freshness remains non-current even after receipt.
- Latest Deploy Preview browser (including copy revision 1dc6e52): eight Demo cards render; route names and separate context are present. At 320px viewport, document width305px: no horizontal overflow. Membership and checkout are disabled with an explicit sandbox-not-connected message. The displayed CS cancellation/restart and ZIM adapter text matches the owner-approved sandbox changes. Screenshots latest-preview-mobile.png and latest-preview-desktop.png are saved in the task evidence directory outside the repository.
- Stripe connector recheck still returns UNAUTHORIZED/requires reauthentication despite earlier successful owner OAuth. Actual provider subscription, renewal, failure, cancellation and Portal integration remain NOT VERIFIED. Local mocked lifecycle tests are separate evidence.
- Isolated member/billing backend is not deployed/configured for this preview. The Supabase Edge receiver is ingestion-only. The preview /api proxy still targets SavePulse Production, where FreightPulse stays disabled.
- No Production merge, live sale, real charge, customer alert, invitation schedule/quota or CRM change.

Next external evidence: genuine closed-daily TradingView receipt, source freshness/data-rights decisions, and working Stripe sandbox integration with an isolated member backend. Seats, trial, discounts and tax remain owner decisions before sale. A paid signup URL is not ready.

---

# Historical FreightPulse QA — 25 October 2026

## Release status

Development branch `feat/freightpulse-sandbox`. No merge, production deploy, production schema change, live Stripe product, real card, purchase, actual customer email, CRM edit or invitation scheduling/quota change performed.

Demo page: http://127.0.0.1:3091/freightpulse/ while the local preview server is running. The public production domain does not yet contain this work. No real Pine feed or AI model is connected. The Demo is a dated static fixture, so a frontend preview can display it without an enabled FreightPulse backend.

## Findings and decisions

See implementation-plan.md for inspected architecture, storage isolation and commercial decisions. FreightPulse is USD 99/company/month, independent from SavePulse plans. Company seats, trial, discounts, tax and data rights remain unset. Read access requires verified session + that company's confirmed FreightPulse subscription; SavePulse access alone does not grant it.

## Results

| Status | Layer | Scenario / evidence |
|---|---|---|
| PASS | Local automated tests | Entire suite: 121 tests, including 23 added FreightPulse/isolation cases; original SavePulse tests retained |
| PASS | Local HTTP + database/provider mocks | Email code verification → company creation → account reload; no auto trial or free paid access; logout revokes company access |
| PASS | Local subscription adapter mocks | Checkout, renewal, payment failure/recovery, cancel-at-period-end, end-of-period access expiry; same owner can keep SavePulse separately |
| PASS | Local real Stripe SDK signature verifier + HTTP | Valid signature over original raw bytes accepted; tampered bytes and timestamp replay rejected; live events rejected |
| PASS | Local concurrency/retry tests | Billing duplicates survive service reconstruction, per-company lease serializes reconciliation, provider outage retry, old events fetch current provider state |
| PASS | Local Checkout adapter mocks | Exact USD 99 active sandbox Product/Price, quantity one, fixed FreightPulse customer, stable idempotency attempt across concurrent signup, existing session price revalidated |
| PASS | Local Portal adapter mocks | Separate FreightPulse customer/config, card/invoice features required, cancel-at-period-end required; quantity/product update disabled |
| PASS | Local feed tests | Closed 1D bars; version/symbol/family checks; canonical same-bar duplicates, conflicting bar rejection, older bar rejection, future time rejection, demo/test separation |
| PASS | Local data freshness tests | Old source timestamp remains stale despite a new receivedAt; stale/missing SLA hides signal/window; missing data is explicit |
| PASS | Local email provider mocks | Preferences/route selection; failed send retry; stable provider key; duplicate suppression after restart; test recipient only; >23h ambiguity requires review |
| PASS | Browser, local in-app preview | 320/390/768/1280px viewports: no horizontal overflow, six route cards, one stale card, one missing card, BDI/ZIM separate, 2/5 window with dates; stale cards contain no current window |
| PASS | Browser, local in-app preview | Attempt to load member report without enabled sandbox shows disabled message and keeps Demo label; no misleading unlock |
| NOT VERIFIED | Stripe provider sandbox | Connector requires reauthentication; no Product/Price/customer/subscription or portal created at provider; no real sandbox checkout/test-clock lifecycle yet |
| NOT VERIFIED | Staging database | No isolated staging project selected; actual durable key/value CAS behavior for FreightPulse not exercised against a staging DB; existing trial storage behavior has automated coverage |
| NOT VERIFIED | Actual operational email | No FreightPulse email sent; all email results above use adapters. Authorized delivery target only savepulse.cloud@gmail.com |
| NOT CONNECTED | Pine / real market data | Contract is a draft; real ingestion returns 503. CS cancellation/restart, BDI rules, ZIM script version, names, SLAs and licenses await agreement |
| NOT ENABLED | Live sales / Production / Discord / AI model | Deliberately absent or disabled; these are not represented as tested/ready |

## Browser evidence (outside public repository)

`/Users/karnpiyathanin/Documents/New project/freightpulse-qa-evidence/mobile-demo.png`
`/Users/karnpiyathanin/Documents/New project/freightpulse-qa-evidence/mobile-stale.png`
`/Users/karnpiyathanin/Documents/New project/freightpulse-qa-evidence/desktop-demo.png`

Chrome's controlled tab remained blank despite HTTP 200 for HTML/CSS/JS/API; after direct reload attempts, visual QA continued in the in-app browser. No production deploy was used to work around this.

## Before enabling sales

Reauthenticate/select the Stripe sandbox; run provision-freight-sandbox.js and complete provider lifecycle/portal tests. Select isolated staging storage and verify restart/outage/CAS behavior. Agree the Pine contract with the FreightPulse author and obtain commercial data rights. Decide team membership, trial/discounts, tax registration/handling, grace/dunning and re-subscription policy. Replace the prototype key/value financial ledger with normalized transactional tables before commercial scale. Do not enable live payments or real ingestion from this patch.

Preview identity guard: email controls are disabled until the dedicated FreightPulse catalog confirms sandboxEnabled. Auth requests use /freightpulse/auth/code and auth/verify (never the Production trial endpoint); the sandbox route restricts recipients to the authorized test mailbox.

## Route labels — 2026-10-25

Verified six regional directions and FBX benchmark identifiers against CME Group's Container Freight Rate futures fact card (contract codes CS1–CS6; USD per FEU). Added names to report cards and route preferences; reverse routes CS2 and CS5 are explicitly covered by a regression test. BDI and ZIM remain separate context. This does not verify a live TradingView feed, commercial redistribution rights, Thai port coverage, or a booking quote. Payload route identifiers remain unchanged pending Pine agreement.

Local suite after route-label change: 122 passed, 0 failed. Stripe Dashboard sandbox selection was verified as SavePulse sandbox; connector still requires reauthentication. Provider payment lifecycle tests remain NOT VERIFIED.

Follow-up evidence: Dashboard creation and saved product metadata are now verified (catalog IDs recorded in sandbox-runbook.md). This is catalog setup only, not a successful payment. The sandbox account task page says a past-due photo-ID task impacts payments and payouts; no identity document was submitted. Connector reauthentication and secure isolated backend credentials remain pending.

Deploy Preview browser check: all six regional names and matching preference labels rendered; Demo label retained, member email disabled until sandbox backend exists, stale card has no active window. Mobile 390px viewport: document content width 375px, six route cards, no horizontal overflow. Evidence stored outside the repository in freightpulse-qa-evidence/routes-mobile.png and stripe-sandbox-product.png.

## v2 ingestion follow-up

Local suite: 125/125 PASS. New coverage verifies exchange-qualified symbol mapping and FBX direction validation; unknown source update time persists for test ingestion but cannot become current or send email; duplicate payload with changed event ID does not create a second signal; source update can precede bar close; expired window preserves independent pressure status; wrong exchange, mismatched route, future timestamps and invalid windows are rejected. These are injected-provider/local tests, not real Stripe, email or TradingView E2E results.

Stripe browser authorization was completed by the owner, but the account-list connector still returns UNAUTHORIZED/requires reauthentication in this chat. Do not ask the owner to repeat authorization indefinitely or treat the successful browser screen as evidence of backend/provider lifecycle tests passing. No Production deployment or paid purchase performed.

## Owner-approved CS next-four rule

Supersedes earlier five-bar/2-of-5 screenshots and wording. Rule version freightpulse.cs.rebound-next-4.v1. Local suite: 129/129 PASS. Tests cover a decline followed by a wait through flat/missing calendar days, confirmation outside the window, next available daily bar as day1, days1–4, expiry without forced easing, old rule/day5 rejection, independent confirmation/window timestamps, BDI/ZIM context isolation, new-rule notification suppression, shared bilingual notification-preview wording, and duplicate/stale safeguards.

The single-cycle reference evaluator is for sandbox fixture/Pine agreement only. It deliberately does not implement cancellation, restart or rollover rules; these remain owner decisions. Backend payload validation cannot prove source bar adjacency from a single webhook. New-rule real email is explicitly blocked even if the test email worker is enabled. Live feed remains disabled. No Production change or actual notification from this rule.

Deploy Preview after commit 61c82be: verified full rendered CS11 card says day2/4 in the exact Thai and English wording, with separate confirmation/start timestamps. CS41 card says Rate-Locking Window Ended while pressure_up remains unchanged. Stale/missing cards have no window. Shared notification preview explicitly says Demo/not sent. Evidence: ../freightpulse-qa-evidence/cs-next4-preview.png (outside repository). FreightPulse Pine chat acknowledged the exact next-four ruleVersion, confirmationBarTime and windowStart semantics; alerts/webhooks remain unconfigured. These browser checks are on Deploy Preview, not Production.

## BDI/ZIM context wording

Local tests: 131/131 PASS. New cases cover all three bilingual Demo labels for each instrument, independent context titles/explanations, removal of CS window fields, preservation of stale/missing/unknown source data states, rejection of implicit BUY/SELL mapping, and authoritative backend suppression of fresh non-demo BDI/ZIM assessments pending rule/source review. CS next-four logic is unchanged. No actual notification/live feed or Production deployment.

Deploy Preview ec5a4c5 browser verification: two separate context cards with exact Thai/English BDI softening and ZIM unclear wording plus owner explanations and Demo-only notice; context window count zero; CS day2/4 still present. Browser evidence: freightpulse-qa-evidence/bdi-zim-context-preview.png outside the repository. Other status variants are covered by local unit tests, not actual market inputs. The FreightPulse Pine chat acknowledged the new context-copy requirements and pending BDI/ZIM source review.

## Pine transport and test receiver — 2026-10-26

Local suite 134/134 PASS. HTTP tests exercise all eight qualified instruments through the TradingView envelope receiver and actual service validator/ingestion logic with isolated in-memory CAS storage; verify separate token gating, token stripping/non-echo, real dataMode rejection, version/route validation, canonical duplicate handling after service recreation and out-of-order rejection. These tests do NOT prove Supabase durability, public endpoint latency, actual TradingView delivery or Pine compiler success. A separate reference-rule regression confirms lower-close invalidation after retaining the last day's highlight, without automatic restart.

Pine v6 CS transport and BDI/ZIM telemetry files are provided, send disabled by default, no hardcoded credentials. No public receiver deployed or paid resources added. Chrome showed the user changing the app during the compiler attempt, so UI control was stopped; compilation and actual chart delivery remain NOT VERIFIED. Do not treat JS fixture tests as Pine compiler validation.

## Restart approval follow-up

Local suite: 136/136 PASS. Added regression cases for invalidating day1, flat/further declines while waiting, a new confirmation excluded from numbering, day1 at the next available bar, a second invalidation at day2 and another new cycle. A separate test ensures this approval does not silently create restart rules after normal four-day expiry. Updated Pine v1.2/script transport.v3 and exact backend rule allowlist; actual emails remain blocked. Pine compiler and actual TradingView delivery remain NOT VERIFIED; no live endpoint/deployment was activated.

## Delayed NYMEX runtime guard fix

Safari live UI diagnosed User-defined error RE10142, bar0: the NYMEX-only prefix guard rejected the user's valid delayed NYMEX_DL CS charts. Replaced only that guard in the user's existing private script (saved name FrieghtPulse) to accept NYMEX or NYMEX_DL, retained the chart/timeframe/symbol restrictions, and used Update on chart. After update the error controls disappeared from the visible CS11/CS21/CS41 instances; CS31's aggregate indicator-error marker also disappeared. No webhook token/input/alert was changed. This verifies the user's pasted v1.2 compiles/runs after the minimal guard fix, not actual webhook delivery or every branch of the transport.

Repository artifact advances to indicator v1.3/script transport.v4, retains canonical NYMEX payload symbols, and marks the source TradingView-NYMEX-delayed-sandbox when running on NYMEX_DL. Actual publisher freshness remains unknown; delayed feeds are never relabeled fresh by receipt time. This full repository variant still requires its own TradingView compile check if pasted; the live user edit was intentionally the minimal guard patch.

## Dedicated public sandbox receiver deployed

Created a separate Supabase project after the owner chose SavePulse organization and free-only provisioning; quoted cost USD0/month. Edge Function freightpulse-tv-sandbox version2 active at https://sktzydyiwqylpstxjicf.supabase.co/functions/v1/freightpulse-tv-sandbox. Local139/139 PASS; public HTTP14/14 PASS,8first accepted writes, slowest sampled1.893s. SQL readback verified committed rows and stripped credentials, service-only privileges and RLS. Synthetic QA rows removed before owner handoff. Full evidence/status in sandbox-deployment.md. Actual TradingView delivery is pending owner entry of the dedicated token into private Pine Inputs. This is sandbox infrastructure deployment, not SavePulse Production backend deployment, live feed approval or commercial launch.
