# FreightPulse QA — 25 October 2026

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
