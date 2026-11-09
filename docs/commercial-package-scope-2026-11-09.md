# Commercial package scope review — 9 November 2026

## Decision

**No current market-data package is cleared for paid launch by this review.** This is NOT a finding that the company has no licence: the owner reports being unsure. No contract or written grant was supplied or found in the repository reviewed. Keep the existing Live sales gates closed. Do not alter existing members, feeds, customer lists or schedules in this audit.

An earlier suggestion that currency data could automatically be sold without permission must not be relied on. Market category alone does not determine the permissions for a particular data source, delivery path or derived product. TradingView Terms section3 currently covers market data, alerts and webhooks, restricts paid distribution and commercial service/API use absent applicable separate permission. Section4's chart-snapshot attribution provision is distinct; attribution alone is not evidence that an automated paid email/webhook product is authorised.

Primary source checked: https://www.tradingview.com/policies/ (sections3,4,12). No source text is reproduced here. This is an operational evidence review, not a court determination or an assertion that no separately negotiated exception exists.

## Actual configured coverage and proposed sales scope

| Package | Approved USD monthly price | Configured universe | Technical evidence | Commercial release |
|---|---:|---|---|---|
| Plus |5|USDTHB, JPYTHB, EURTHB, USDJPY, EURUSD|Watchlist cap5 and asset checks; email/queue code exists. Current plan-specific customer delivery, freshness and data rights are not established by billing QA.|HOLD: data-use permissions and delivery QA|
| Pro |39|Plus + XAUTHB, XAUUSD, BTCTHB, BTCUSD|Server membership lifecycle and actual USD39 sandbox payment/renewal/failure/recovery tested in PR16. These tests do not validate data licensing or customer email content.|HOLD: permissions and market-content QA|
| Business |59|Same9 assets in the entitlement model; commodities are excluded|Business invoice API is administrator/master-key operated, not a customer self-service/team product. Free browser scenario calculator and print/save brief exist.|HOLD: product delivery, permissions, tenant security and durable storage|
| Commodity references |No separate paid offer authorised|COPPERUSD, BRENTUSD, WTIUSD, NGUSD, ALUMINUMUSD, SUGARUSD, FCPO|Reference feed ingestion exists; none belong to the configured paid plan universe.|Excluded from paid package/email offer|
| FreightPulse |Paused|CS, BDI, ZIM separate sandbox work|Not a SavePulse entitlement; user paused project.|Excluded|

USD5/39/59 remain unchanged. Legacy THB prices are separate stored values, not implied FX conversions or a newly approved localised price. VAT-inclusive display approval does not resolve data permissions, foreign tax handling or availability.

## Production provenance read-only check

Queried only selected signal fields in SavePulse Production project knkimiyxcmkslxemcynp. All16 canonical rows declare source=tradingview; every sourceTicker/source_ticker is missing. Source labels can default in ingestion, so these tags are not independent proof of the originating broker/exchange or licence. Do not name an exact FX/crypto vendor without the saved alert's full source ticker and any transformations.

Observed source-bar times (UTC), distinct from webhook receipt times:

| Symbols | Latest stored source-bar time |
|---|---|
|USDTHB, JPYTHB, EURTHB, USDJPY, EURUSD|2026-11-05 22:00|
|XAUTHB, XAUUSD|2026-11-05 23:00|
|BTCTHB|2026-11-07 17:00|
|BTCUSD|2026-11-08 00:00|
|ALUMINUMUSD|2026-11-05 23:00|
|BRENTUSD|2026-11-06 01:00|
|COPPERUSD, WTIUSD|2026-11-03 23:00|
|FCPO|2026-11-04 13:00|
|SUGARUSD|2026-11-06 08:30|
|NGUSD|2026-10-28 22:00|

Weekend/holiday calendars must be considered before deciding a market is overdue. These observations do not support a blanket real-time claim. The daily scheduler's signalTimestamp currently prioritises the newest receipt/update timestamp and does not read nested pine.barTime; a recently received old observation can therefore pass its freshness check. Source-date-aware readiness needs separate repair and tests before commercial delivery. No production data was replaced.

## Feature claims removed from public plan descriptions in this draft

| Previous claim | Finding | Revised treatment |
|---|---|---|
|Real-time alerts|Inputs observed are1D; source freshness and SLA not established|Historical context; delivery subject to availability|
|LINE / Telegram|Plan channel enum and sanitisation exist, but actual queue flush calls sendSignalEmail only; no sending transport found|Do not advertise these channels|
|Advanced confidence score|Percentile mapping is historical context, not validated forecast accuracy|No accuracy/confidence promise|
|Historical replay windows / priority queue|No complete customer feature or distinct priority dispatch verified|Do not advertise as included|
|20-item Pro watchlist|Configured capacity20 but only9 unique eligible assets|Describe supported coverage; no inflated effective asset count|
|Team watchlists, CSV, business support queue|No complete tenant/member/invite/export/support service found|Not included in available preview|
|Invoice tracking / due-date reports|Admin/master-secret routes and local JSON invoice storage; no full customer workflow proof|Keep paid Business unavailable|

Only public-facing feature descriptions/audience wording are changed. Internal plan IDs, prices, watchlist caps, allowed assets, channel enums, entitlement checks, paid access and email schedules remain unchanged. Existing-member service is not switched off by this branch.

## What can be shown without claiming an unavailable market feed

The free Business scenario calculator can remain a clearly labelled preview using user-owned/manual assumptions or synthetic examples. Browser print/save produces an illustrative internal discussion brief, not a validated Executive Justification product or proof of savings. This review does not set a new price, launch a paid calculator or promise integrations. Customers' own supplier quotes must still be supplied with authority to use them; confidential documents should not be solicited for a demo.

## Evidence needed to clear each market source

Record the full saved-alert ticker and source entity, feed/plan and contractual licence evidence. Confirm coverage of server processing/derived analytics, customer website display, email alerts, paid users/companies, territories, delays/history/retention, attribution and any downstream exchange conditions. A retail chart subscription, webhook delivery success or our own Pine code is not sufficient evidence. If no applicable permission exists, obtain the appropriate permission or replace the feed with a directly licensed source, then retest that data path. No vendor was contacted or purchased in this audit.

## Technical release work remaining

1. Establish trustworthy source ticker/provenance and source-date freshness (including calendars, stale/missing/late replay handling).
2. Verify actual Plus/Pro market email content and delivery after the relevant permissions are resolved; current USD39 billing/tax sandbox QA is separate.
3. Build and test customer-authenticated Business invoice/team workflows, durable storage and export before offering them for payment.
4. Finish Live billing/tax launch gates and e-Tax activation separately. Data permission does not follow from e-Tax approval.

Draft customer coverage page: /service-scope/. It explains availability without internal keys or implementation details. It is linked from pricing and membership in this branch, not deployed to Production by the audit.
