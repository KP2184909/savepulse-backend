# TradingView to stored data to test inbox — 10 November 2026

## Real ingestion evidence

Compared the connected TradingView saved-alert metadata with a read-only snapshot of `public.signals` in SavePulse Production (`knkimiyxcmkslxemcynp`). All nine rows are source=tradingview, timeframe=1D. Every stored `payload.pine.barTime` exactly matches its alert's `last_fire_bar_time`. The receipt times follow the corresponding fires. No Production records or customer dates were changed.

All times below are 10 November 2026, Asia/Bangkok. Latency compares stored receipt with TradingView's recorded fire; it is not a network performance guarantee.

| Symbol | TradingView fire | Backend receipt | Seconds | Bar timestamp match |
|---|---|---|---:|---|
| BTCUSD | 07:01:00 | 07:01:06 | 6.758 | PASS |
| XAUUSD | 05:01:00 | 05:01:04 | 4.434 | PASS |
| EURUSD | 05:00:00 | 05:00:05 | 5.169 | PASS |
| USDJPY | 05:01:00 | 05:01:05 | 5.369 | PASS |
| BTCTHB | 00:00:03 | 00:00:32 | 29.014 | PASS |
| XAUTHB | 05:00:00 | 05:00:00 | 0.896 | PASS |
| EURTHB | 05:01:00 | 05:01:07 | 7.683 | PASS |
| JPYTHB | 05:01:00 | 05:01:02 | 2.151 | PASS |
| USDTHB | 05:01:00 | 05:01:02 | 2.211 | PASS |

All nine saved alert records reported active with no last_error. However payload.sourceTicker is absent, so this proves temporal/bar correlation, not cryptographic source identity or independent verification of each saved override and webhook destination. No claim that the original provider data is real-time/licensed follows from this.

## Email fix found with actual data

All nine stored percentile fields are null. The prior premium email path defaulted this to50 and stated a middle historical range. The candidate fix renders `Historical range position unavailable` without a fabricated range bar; known valid percentiles retain their actual display. Missing instrument slots no longer inherit illustrative sample signals. Regression verifies unknown values do not become upper/middle/lower range claims. Full local suite:200/200 pass.

## Real test emails

The patched candidate templates were generated from the nine-row Production snapshot, then sent through a temporary fixed-recipient **sandbox QA mailer**, using the existing test-only Resend credential. This is not a Production scheduled-send test. Only savepulse.cloud@gmail.com received mail; no customer list, marketing subscription, billing state or Production settings were changed.

Each email is prominently TEST ONLY, dated as a snapshot, with explicit illustrative Business invoices/chart decoration. The test footer is labeled as a test return link rather than pretending to be a functioning newsletter unsubscribe link. Real unsubscribe behavior was not exercised in this run.

| Plan | Resend accepted and durable QA log | Gmail message ID | Inbox confirmed |
|---|---|---|---|
| Plus |01a1c54b-ee75-7ca1-8c6e-1f6577b1a706|1a1c54bf4eac688b|PASS|
| Pro |01a1c54b-f112-7a98-8971-c886794c92cb|1a1c54bf79cf84fd|PASS|
| Business |01a1c54b-f174-75c2-9374-fd42c33cbcf1|1a1c54bf88b2faf2|PASS|

All three arrived at approximately18:50:51–52 Bangkok time, labeled INBOX. Plus/Pro were categorized Promotions; Business Updates. Gmail message headers show SPF, DKIM and DMARC pass for each. Actual received MIME content contains the TEST disclosure; Plus includes all five FX references, Pro includes the intended broader assets, and Business includes the illustrative-example disclosure.

The temporary `savepulse-digest-qa` function in the isolated sandbox required the existing worker credential, accepted only three named plans and a compiled fixed recipient/content set, and persisted a per-plan send claim plus provider idempotency key. After the three accepted sends, it was replaced by v2: a JWT-protected410 response with no mailer code. Credentials were never exported or logged. No recurring QA schedule was created.

## Limits and next steps

- **Production ingestion: PASS** for the compared nine bars.
- **Patched template generation/local regression: PASS**; changes remain in Draft PR21, not Production.
- **Sandbox transport and actual QA inbox receipt: PASS**; not proof of Production SMTP configuration or automatic scheduling.
- **Production scheduled customer mail: NOT VERIFIED.** No rows existed for10 November in the inspected Production email_logs; the latest retained log was18 June2026. This alone cannot prove the scheduler disabled or that no other delivery path exists. Do not enable sending to customers based on this QA.
- **Visual Gmail/mobile rendering: PENDING.** Browser was logged into the owner's personal account, not the authorized QA mailbox. Requested the owner to open the QA mailbox; connector receipt/MIME checks are independent of visual layout acceptance.
- Raw snapshot bar dates, source freshness versus webhook receipt, data-use authorization, actual unsubscribe E2E and live offer acceptance remain separate requirements. Do not call Business customer invoice workflow complete because its demo email arrives.
