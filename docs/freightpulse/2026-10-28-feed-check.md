# Actual sandbox feed check — 28 October 2026

Checked approximately 09:32 Thailand time. Production was not changed.

| Stream | Actual transport/persistence | Thailand receipt time |
| --- | --- | --- |
| ZIM | PASS: TradingView POST HTTP200, matching persisted latest row | 28 October 03:01:19 |
| BDI | PASS: TradingView POST HTTP200, matching persisted latest row | 28 October 07:24:17 |
| CS11–CS61 | NOT VERIFIED: active alerts, no fire time, no accepted rows | None |

Supabase function logs for the Thailand calendar day contain exactly these two TradingView POSTs, both200. No synthetic/replayed events were sent during this check. Both saved payloads explicitly say sourceFreshness unknown, so neither establishes a current decision or a licensed commercial feed.

## CS investigation

TradingView get_ohlcv, 1D count3, returned latest available bar-open time 2026-10-26T22:00:00Z for CS11, and 2026-06-08T22:00:00Z for CS21/31/41/51/61. These are observations from this account/data path, not proof that the upstream markets universally stopped publishing. The provider warns the last returned bar may still be forming.

All six alert snapshots have enabled output, no last_error, and reviewStart 2026-10-27T00:00:00Z. The Pine engine gates on bar-open time >= reviewStart. Thus every latest bar returned by this data path precedes that boundary; even the CS11 session labelled with the next calendar date can open the previous UTC date. This is evidence of a boundary/data availability problem, not proof of successful realtime close execution. Do not lower the date to June, backfill/replay as fresh, or bypass the realtime/closed-bar checks. Resolve session-start semantics and obtain reliable route data before enabling customer reports.

## Backend work

Added src/freightFeedHealth.js and tools/freight-feed-health.js. The read-only tool emits eight-stream coverage, last persisted receipt, observed chart bar versus review boundary, and explicit unknown freshness. It never grants live readiness or treats recent receipt time as fresh source data. Input fields are allowlisted into the report; credentials/envelopes are not output.

Reproduce this dated check with:

```sh
node tools/freight-feed-health.js docs/freightpulse/evidence-2026-10-28.json
```

This command uses a dated evidence export, not live provider access. Full local suite150/150 PASS, including missing streams, invalid/future timestamps, out-of-order input, source freshness separation and credential omission. The new health tool is repository/local tooling; it is not a deployed public dashboard/API. Existing sandbox Edge receiver remained version4 and accepted the actual BDI/ZIM deliveries. Member/Stripe integration and actual daily customer email schedule remain disabled/unverified as previously documented.
