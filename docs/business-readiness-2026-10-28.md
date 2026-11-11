# Business commodity readiness — 28 October 2026

Scope: review and internal testing. This is not authorization to deliver commodity reports to customers or enable checkout. No customer emails or CRM changes were made.

## Observed production evidence

- TradingView shows seven active 1D alerts: COMEX:HG1!, ICEEUR:BRN1!, NYMEX:CL1!, NYMEX:NG1!, COMEX:ALI1!, ICEUS:SB1!, MYX:FCPO1!. Each latest event returned HTTP202 from the webhook; a 202 by itself is not persistence or email-delivery confirmation.
- Production Supabase `signals` has all seven canonical rows and receipt timestamps that align with the latest TradingView events. FCPO's latest was 27 October 18:06 Thailand; the other six arrived 28 October 04:11–07:22 Thailand. Each row has a `pine.barTime`; none has `sourceTicker`. Therefore symbol-to-chart identity cannot be independently verified from the saved message. A same-named row and an active alert are not enough to prove the exact source or its freshness/license.
- SUGARUSD is US cents/pound; FCPO is MYR/metric tonne; futures are benchmarks, not physical supplier quotes. Current commodity storage does not validate source freshness separately from webhook receipt or establish rights for external distribution.
- Business plan in `src/plans.js` uses the nine legacy currency/gold/BTC assets. It does not include seven commodity benchmarks. `/for-business/` is still a research preview and online paid checkout is closed. Current evidence does not support advertising it as a commodity-email product.
- The daily digest scheduler exists in `serverRuntime.js` and is controlled by enablement and an explicit recipient allowlist. Its default is off, and the relevant production settings and a recent actual Business digest have not been independently verified. The latest aggregate `email_logs` daily_pulse_lite sent record was 18 June 2026, while the latest `notification_jobs` signal-alert sent record was 29 August 2026. These tables cannot establish whether other providers or external campaigns sent email later. Trial readiness's last scheduler time pertains to trial handling, not proof of business digests.

## Prepared internal reporting

`src/businessCommodityReport.js` creates a seven-row internal report with a test label, preserves raw quote units, avoids trading/purchase instructions, suppresses prices and stays ineligible for customer delivery when provenance/freshness/licensing is not established. It has no sender or scheduler integration. Applied to the seven production rows above, every row was `source_unverified`; the ephemeral preview withheld all prices. This is not an end-to-end email send, a paid entitlement, or a production deployment.

Full local suite: 101/101 PASS on this branch, including wrong/missing provenance, stale bars, unit preservation and disabled external delivery. No paid checkout, plan/entitlement, scheduler, alerts, email provider settings or live data were changed.

## Work before launch

1. Verify specific contracts, stored Pine alert snapshots, raw override and authenticated `source_ticker`; recreate affected TradingView alerts only after a tested backward-compatible rollout and owner credential handoff if needed. Check actual source timestamps and market holidays. Keep stale/unknown data out of current recommendations.
2. Obtain written terms covering feed access, non-display processing, paid website reports, derived outputs and email to third parties for CME/COMEX/NYMEX, ICE and Bursa, as applicable. Price, rights and data access remain unverified. CME publishes a separate [derived-data licensing process](https://www.cmegroup.com/market-data/browse-data/derived-data.html); do not infer redistribution permission from a TradingView subscription.
3. Decide which report contents, cadence, time zone and missing-data behavior customers receive, with explicit price/tax/renewal/cancellation terms. Preserve the user's $59/month approved headline unless changed explicitly.
4. Build durable, idempotent scheduling and retry with server-verified Business access, opt-in/unsubscribe and safe provider idempotency. Check actual production architecture and non-paid hosting constraints. Test only to savepulse.cloud@gmail.com, including genuine delivery and failure/retry without duplicates.
5. Validate Stripe test-mode paid subscription, renewal, failures, portal and cancellation and confirm business product taxonomy. Then perform end-to-end QA against all seven real sources and hold production launch until rights, data quality and payment are verified.
