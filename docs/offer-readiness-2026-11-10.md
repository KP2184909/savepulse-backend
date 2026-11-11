# Offer alignment and read-only Live review — 10 November 2026

This is preparation evidence, not authorization to sell or deploy. No real payment, Live mutation, customer email, credential change or alert modification was made.

## Saved TradingView source inventory

Retrieved the owner's alert list and the nine specific saved-alert records through the connected TradingView API. Names, script inputs, message bodies and credentials were not exported. All nine records report active=true, resolution=1D, has_webhook=true.

| Backend symbol | Saved chart symbol | Alert ID |
|---|---|---|
| USDTHB | OANDA:USDTHB | 5895970340 |
| JPYTHB | FX_IDC:JPYTHB | 5895971437 |
| EURTHB | FX_IDC:EURTHB | 5895971910 |
| XAUTHB | PEPPERSTONE:XAUTHB | 5895972221 |
| BTCTHB | BITKUB:BTCTHB | 5895989525 |
| USDJPY | OANDA:USDJPY | 5895990258 |
| EURUSD | FX:EURUSD | 5895990402 |
| XAUUSD | FOREXCOM:XAUUSD | 5895991413 |
| BTCUSD | BINANCE:BTCUSD | 5895999593 |

This verifies saved chart identity and the presence of a webhook setting. It does not verify endpoint URL (connector filters it), correct override/token inside the script snapshot, closed-bar logic, successful recent ingestion, quote unit/contract classification, or commercial permission. In particular, broker-prefixed gold/FX instruments must not automatically be called spot or deliverable quotes. Exact commercial permissions and charges remain unverified. The permission-request draft now includes these sources; it was not sent.

## Candidate fixes and tests

- Following the active `buildDailyDigestEmail` path revealed Plus had three asset cards and Pro seven. The previous audit's four/nine finding described legacy/configured paths and has been corrected. Plus now uses all five configured fiat assets; Pro includes the same five plus four gold/bitcoin series. The legacy Plus renderer is aligned too.
- Added a regression verifying every entitled asset label appears in both HTML and plain text, and that Plus does not gain gold/bitcoin cards or either tier gain commodity cards.
- Homepage offer copy names the 5/9 reference-series scope, excludes commercial commodity/freight alerts from Business, and does not promise LINE/Telegram delivery.
- Business email CTA now names and links to the existing `/for-business/` planning demo, rather than claiming to open customer invoice records. It remains a demo, not a paid company invoice portal.
- Full local regression: **199/199 pass**. This includes administrator authorization on Business invoice create/list and billing lifecycle guards. It is distinct from real inbox rendering, current Production delivery and business-user E2E acceptance.
- Locally generated email HTML examples: `/tmp/savepulse-offer-qa/{plus,pro,business}.html`. Browser file preview was blocked by browser URL policy, so no visual browser PASS is claimed. No policy workaround was attempted.

## Business readiness findings

| Capability | Finding / release consequence |
|---|---|
| Manual scenario calculator / printable brief | Present in public business preview, uses user-entered assumptions locally; retain demo disclosure |
| Invoice create/list | Server routes exist, require administrator/master authorization and a business subscriber record; local HTTP authorization tests pass |
| Customer self-service invoice account | Not supplied by those admin-only routes; cannot advertise as a tested customer workflow |
| Paid entitlement for invoice routes | Routes inspect the subscriber plan field; unlike current billing status reconciliation, this alone is insufficient proof of current paid access after expiry/cancellation |
| Invoice durability | JSON file plus asynchronous Supabase mirror exists; do not claim transactional write acknowledgement/recovery for customer-critical invoices without further work |
| Team seats, team isolation, roles, audit trail | Not established by watchlist limits or a team_email channel declaration; no acceptance PASS |
| Due-date report/email/CSV | Configuration and examples do not establish a complete live, member-authorized workflow; pending E2E proof |

Do not expose admin/master secrets in a customer browser as a shortcut. A full Business release requires authenticated company membership/roles, current server-confirmed access, tenant isolation, awaited durable writes and real workflow QA. This preparation did not attempt to implement that larger product silently.

## Actual Stripe Live read-only inventory

Connector account enumeration confirmed SavePulse `acct_1TbuP21NzGcGzIig` Live and the separate sandbox. Explicit Live-scoped GETs listed all active Prices, all webhook endpoints and Portal configurations (has_more=false).

| Check | Result | Evidence |
|---|---|---|
| Revised USD39/49/69 mapped to Plus/Pro/Business | FAIL | Active Live Prices are Plus5; Pro15 and39; Business59; plus old THB199/499/1990. No active Plus39, Pro49 or Business69 in this complete active list |
| Price tax behavior | NOT READY | Listed active Prices report unspecified. Do not treat Pro39 as Plus39 merely because amounts match; legacy prices/members must be preserved |
| SavePulse lifecycle webhook | PASS configuration inventory | we_1Tbybu1NzGcGzIig15mPycaa is enabled at the exact Render `/api/v1/billing/webhook` URL; its 13 event subscriptions cover checkout, subscription, invoice, refund/dispute/fraud events currently required by code |
| Default Portal configuration | PASS configuration inventory | bpc_1UXamz1NzGcGzIigha7yZWLp active/default; invoice history and payment method updates enabled; cancellation at_period_end with proration none |
| Another integration | Untouched | Separate two-event endpoint exists; no edit made |
| Live key/Render account binding, inclusive rate and charge capability | NOT VERIFIED here | Enumeration and lists do not establish backend secret binding, correct applied manual tax rate, charges_enabled or tax fulfillment |
| Live payment/entitlement/tax/inbox E2E | NOT VERIFIED | No real charge or Live simulation attempted |

Next Live preparation is exact merchant-bound revised inclusive Price configuration, verified backend settings and tax fulfillment. Keep public checkout off until all gates are closed. Prior sandbox QA of prices39/49/69 is independent evidence, not Live approval.

## Remaining gates

1. Written permission for the identified sources and intended paid website/email outputs.
2. Actual e-Tax activation and verified lawful document issuance/delivery, or separately established lawful alternative.
3. Exact revised Live prices/account/tax/backend binding and operational preflight.
4. Product acceptance for the actual offered tier; Business customer workflows remain incomplete.
5. Reviewed deployment and Production QA before opening signup. No existing paid member migration is authorized by these findings.

## Follow-up: actual Gmail desktop review

The owner opened the QA mailbox. Plus and Business observed desktop portions were readable; Pro screenshot was inconsistent with its accessibility state before native Chrome became unavailable. Full-message, Pro visual and mobile acceptance remain unverified. See `signal-to-email-qa-2026-11-10.md` for evidence and limits. No additional email was sent or Production setting changed during this review.
