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
- **Desktop Gmail visual review: PARTIAL.** After the owner opened the QA mailbox, Plus and Business were visually inspected in native Chrome: the observed header/cards and Business illustrative table were readable without visible overlap. This is limited to the observed desktop portions, not a full-message or mobile acceptance. Plus screenshot saved locally at `/tmp/savepulse-offer-qa/plus-gmail.png` (not committed because it includes mailbox UI).
- **Pro visual review: NOT VERIFIED.** The fresh accessibility tree identified the Pro subject, all nine instrument references and unknown-range warnings, but the screenshot still showed Plus. A subsequent scroll failed with `noWindowsAvailable`; inconsistent native screenshots cannot establish Pro rendering.
- **Mobile Gmail rendering: NOT VERIFIED.** No actual mobile client was inspected.
- **Schedule copy needs verification before release.** The received templates display “Updated every morning at 08:30”; the Production scheduler was not verified in this run. The test snapshot banner does not establish that service promise.
- Raw snapshot bar dates, source freshness versus webhook receipt, data-use authorization, actual unsubscribe E2E and live offer acceptance remain separate requirements. Do not call Business customer invoice workflow complete because its demo email arrives.

## Follow-up: unverified schedule promise removed

Replaced the hardcoded 08:30 daily-update promise in all four bilingual email templates with “Snapshot at preparation time” / “สรุปข้อมูล ณ เวลาจัดทำ”. Scheduler configuration still defaults to 08:30 Asia/Bangkok, but configuration alone is not evidence of successful scheduled delivery. Regression checks both languages and all plans; full local suite: 201/201 pass. This follow-up remains a candidate in PR21; the three already received QA emails contain the prior copy and were not resent.

Data-use authorization remains unverified per the owner's decision to continue development first. This is a status record, not a representation that authorization is unnecessary. Production customer sending and paid launch were not enabled.

## Follow-up: scheduled-send source freshness

Inspected the actual bootstrap: `bootstrap.js` loads `serverRuntime.js`, which calls `runScheduledDailyDigest` every five minutes. Scheduling requires the enable flag and an explicit recipient allowlist; code existence does not establish current Live environment values or an executed run. No enable flag or allowlist was changed.

Fixed readiness so an explicit source time (`sourceUpdatedAt`, nested `payload.pine.barTime`, or bar/time fields) takes precedence over webhook receipt/update timestamps. Conflicting source dates use the oldest date conservatively; malformed source times fail closed. Records lacking source timestamps retain receipt-based legacy compatibility and therefore do not independently prove source freshness. Regression covers stale replay, future bar, malformed bar and a valid fresh millisecond bar; full local suite: 202/202 pass. These checks validate timestamps as supplied, not the upstream provider's actual update cadence.

Candidate remains in PR21, not deployed. Next operational verification is a read-only Live configuration/last-run inspection, followed by an isolated recipient-only scheduled test; no customer send is authorized by these local tests.

## Follow-up: Live scheduled-send audit

Read-only Production SQL on 10 November returned no scheduler_state rows for the six dailyEmail/dailyDigest date, last-run and last-result keys. Aggregate email_logs: 4 rows total, newest `2026-06-18T08:16:56.856Z`, zero since 10 November Bangkok midnight. No subscriber identities or secret values were retrieved. This is absence of retained evidence, not proof that every possible mail path is disabled.

Render service inspection reached GitHub sign-in, so current Live enable flags, recipient allowlist, SMTP readiness and deployed revision remain NOT VERIFIED. Owner was asked to sign in through the secure browser page; no credentials were requested in chat.

Added actual scheduled-runner regression for disabled and missing-allowlist conditions, verifying no email log or completion-state mutation. Full local suite: 203/203 pass. No outbound email or Production mutation was performed in this follow-up.

## Render verified after owner sign-in

Read-only UI verification on 10 November: service `srv-d7u3efpj2pic739fm8kg` is `savepulse-backend`, Production, Node Free, repository KP2184909/savepulse-backend, branch main. Live successful revision is `a92a7ec` (short revision shown by Render). It is the PR15 merge for the earlier 5/39/59 pricing, not PR19/20/21.

Noncredential settings inspected: `DAILY_EMAIL_ENABLED=false`, `DAILY_DIGEST_ENABLED=false`, `DAILY_EMAIL_TIME=08:30`, `DAILY_EMAIL_TIMEZONE=Asia/Bangkok`, `DAILY_EMAIL_SIGNAL_MAX_AGE_HOURS=36`, `EMAIL_PROVIDER=resend`. No credential reveal controls were used. These disabled flags explain why this configured daily scheduler does not send; this does not rule out unrelated mail paths. The service warns that its Free instance sleeps on inactivity, so an in-process timer cannot establish punctual unattended delivery.

No environment edits, rebuild, deploy or email send occurred. Before a scheduled pilot: deploy reviewed candidate code, verify a single QA recipient allowlist, verify provider availability without exposing its key, and invoke through a durable scheduling path that remains effective while Render sleeps. Keep customer recipients excluded; record receipt, job result, and replay suppression. The existing private billing-worker schedule is not evidence of daily-email invocation.

## Scheduled pilot regression: wait, restricted recipient, replay

Fixed the scheduled runner so incomplete/stale required signals do not mark the day completed. A later timer tick can send once readiness succeeds. The supplied clock now reaches batch readiness and log snapshot dates, enabling virtual-time QA without changing Production time. An in-process guard rejects overlapping ticks and is cleared in finally. This is not a distributed lock or a guarantee across multiple instances; the existing local-file/asynchronous mirror durability still requires separate hardening before broad automatic sending. Provider failures retain the existing completion/manual-review behavior; this patch does not automatically retry ambiguous email deliveries.

Local integration test with a fake provider: allowlist contains only savepulse.cloud@gmail.com, an excluded subscriber is present, first tick has a missing instrument and sends nothing, the next complete tick sends to QA only, and a third same-day tick is suppressed. A concurrent-tick test verifies one dispatch within the process. No real email was sent. Full suite: 205/205 pass.

Render flags remain false and Live code remains unchanged. Scheduled delivery in Production is still NOT VERIFIED; these are candidate-code regression results, not a completed real scheduled pilot.

## Provider duplicate protection

Daily batch requests now supply a stable SHA-256 identity over normalized recipient, template type and Bangkok snapshot date; the email address is not embedded in the key. The Resend adapter forwards it in the Idempotency-Key HTTP header, not the email body. Welcome and individual signal sends are unchanged.

Tests verify identity stability after local-state recreation, different keys for different recipients/dates, and actual adapter header propagation using a fake HTTP provider. Full local suite: 207/207 pass. No actual provider request was made during these tests. Resend documents 24-hour retention and rejection of inconsistent payload reuse: https://resend.com/docs/dashboard/emails/idempotency-keys . Changed content must not silently receive a new key to force a second daily delivery.

This is a limited additional defense, not a durable outbox implementation. Payload freezing, durable pre-send claims, multi-instance coordination and handling of ambiguity beyond provider retention remain unfinished. Automatic provider retry remains disabled. Existing local pending logs suppress repeat attempts while retained, but asynchronous mirroring is not an atomic delivery guarantee. Production flags remain false.
