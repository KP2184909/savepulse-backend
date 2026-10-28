# Freight data options — investigation 28 October 2026

## Current finding

TradingView's account-specific NYMEX continuous futures data returned the most recent available bar opens for CS21!, CS31!, CS41!, CS51!, CS61! on 8 June 2026 22:00 UTC, while CS11! had 26 October 22:00 UTC. The connector warns that its most recent returned bar may still be forming. These observations do not establish what the source provider publishes to other users, nor that another contract month would work. All six alerts were active, with no fire time; the configured review boundary is 27 October 00:00 UTC and Pine checks bar *open* against it. Source availability and boundary semantics both require investigation. Do not change to an unverified contract, shift the review boundary to manufacture a historical alert, or present old bars as current.

TradingView symbol search for FBX01/02/03/11/12/13 returned NYMEX CS1–CS6 futures roots, not verified spot FBX index symbols. Connector requests for the unqualified futures roots returned invalid symbol; this is not evidence that exchange contracts are unavailable. Searches also returned EURONEXT FEUW/FENE/NEUE futures roots; bar requests for those roots failed, and the routes and data rights do not establish a like-for-like six-lane replacement. No replacement TradingView ticker has been verified to deliver current 1D closed bars for all six lanes.

## Candidate: Freightos Baltic Index (FBX) direct

Freightos identifies the same underlying route labels as FBX01, FBX02, FBX03, FBX11, FBX12 and FBX13. Its documented [FBX Data API](https://apidocs.freightos.com/reference/get_fbx-data) supports requested tickers and daily or weekly data subject to permissions. [Freightos Terminal](https://www.freightos.com/enterprise/terminal/) says its daily index is published at 14:00 UTC (21:00 Bangkok). This is a documented publication schedule, not evidence that our account currently receives any particular current record. At a 09:00 Bangkok digest, the latest published business-day index would usually be the prior publication; weekends, holidays, delay, revision, contract entitlements and source date must be assessed explicitly. Never label it as a same-day update without the source's actual date and time.

The actual FBX spot index is not the same instrument as CME continuous freight futures; no backtest or four-day CS rule has been validated on it. Confirm each ticker, route definition, direction, equipment, unit, coverage, source timezone, holiday calendar, publication latency, revisions, permitted historical lookback and data lineage in a sample from a licensed account before changing integration. Source-specific rules and boundary semantics need separate testing.

The [Freightos data terms](https://www.freightos.com/freightos-data-terms-conditions/) state resale and use to produce derived data such as derivative indexes require explicit permission in the purchase order; they also specify restrictions on data use, disclosure and AI processing. Obtain written permission covering the actual intended paid customer-facing report, derived signals and summaries, website display, daily email, data retention, commercial use and permitted AI tooling; confirm applicable costs and usage rights before procurement. No permission or price is inferred from publicly viewable information or API docs. No account, contract, service, key, order, or paid trial has been created.

## Alternatives

- [Drewry World Container Index](https://www.drewry.co.uk/logistics-executive-briefing/logistics-executive-briefing-articles/world-container-index-methodology) is weekly and covers eight named port-to-port routes in USD/40ft. It may be useful after route-by-route mapping and licensing review, but is not a drop-in daily six-lane FBX replacement. Weekly data cannot simply be treated as daily bars for the existing four-day rule.
- [Xeneta ocean freight benchmarks](https://www.xeneta.com/about-us/our-data/ocean-freight-rates) describe API access and port-pair rate benchmarks. Exact routes, data cadence, pricing, derived-output and redistribution permissions require direct verification. Contracted and spot benchmarks may differ from FBX and futures.

## Selection and readiness gates

1. Obtain a no-commitment written quotation and documented commercial and derived-output rights, including customer reports/email. No outbound inquiry has been sent.
2. Verify six specific series with a dated authorized sample; check last actual source update and publication date independently of ingestion time, plus timezone, revisions and missing/holiday cases.
3. Keep sources separate in storage and the UI: benchmark identity, route definition, observation date, retrieved time, source update time, delay and license metadata. Fail closed when source freshness cannot be established.
4. Validate whether and how the four-observation CS rule applies to each source; do not infer continuous futures and spot FBX equivalence or reuse BDI/ZIM rules.
5. Test duplicate/out-of-order handling, stale/missing data, 09:00 digest cutoffs and full member/Stripe sandbox flows before considering paid release. Do not disclose a real customer's data during source evaluation.

The existing QA report and `freight-feed-health` tool remain the authoritative operational snapshot. The direct API was not called because no access credentials or licensing have been verified.
