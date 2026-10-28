# Sandbox webhook incident — 27 October 2026

## Repair rollout update

All eight replacement alerts were created and verified through TradingView's server-side alert details. CS inputs have output enabled, an owner-entered token, reviewStart 27 October 2026 00:00 UTC (07:00 Thailand), 1D and webhook enabled. BDI and ZIM replacements likewise have output enabled and a configured token. The owner entered the ZIM token directly into the new revision's Inputs. Legacy alerts for these eight instruments were paused; an intermediate disabled-output CS11 alert was also paused. Other SavePulse and trading alerts were not changed.

| Instrument | Replacement alert ID | Pine revision |
| --- | --- | --- |
| CS11! | 5931910754 | 193.0 |
| CS21! | 5931916248 | 193.0 |
| CS31! | 5931916546 | 193.0 |
| CS41! | 5931917179 | 193.0 |
| CS51! | 5931917466 | 193.0 |
| CS61! | 5931918251 | 193.0 |
| BDI | 5934138660 | 4.0 |
| ZIM | 5934217153 | 4.0 |

ZIM keeps EMA14/60 and window5. Its chart includes the older visual instance alongside the new revision; the old alert is stopped. Receiver readback after CS/BDI rollout still contained no accepted actual chart events and only the two earlier 422 requests. Successful creation/activation is not successful delivery; next genuine closed-bar POST and persisted record remain required. Source freshness stays unknown, never current by assumption. No live customer notification schedule or billing launch was enabled.

The notes below describe the earlier diagnostic state before this rollout.

## Verified evidence (Thailand time)

- Eight TradingView alerts are active and have a webhook configured. Stored alert inputs enable output and contain an owner-entered credential; no credential values are recorded here.
- ZIM fired at approximately 03:01 and BDI at approximately 07:23. Supabase edge request logs show two genuine TradingViewWebhook POST requests, both HTTP 422. ZIM's TradingView delivery log also reports a timeout; receiver validation and end-to-end delivery are separate observations.
- CS11–CS61 have no recorded fire time. Their stored alert snapshots have output enabled and a review start of 26 October. An unconfigured chart indicator is not evidence that those existing alert snapshots are disabled.
- No actual chart events have been accepted into the isolated sandbox latest/events tables at the time of inspection.

## Cause and repair

The Pine JSON quote helper used an unsupported carriage-return escape. The actual BDI payload contains carriage returns where literal letters r should occur, corrupting scriptVersion, ruleVersion, source and signalStatus. The receiver correctly rejects this payload. All four repository Pine helpers now escape backslashes, quotes and line feeds without that replacement. Ingestion validation is unchanged.

The fixture in tests/fixtures/bdi-tv-corrupt-quote.json contains only the public market payload, with no envelope or authentication credential. A regression verifies that the real malformed payload is rejected and its diagnostic reconstruction passes schema validation while retaining unknown source freshness. This is a local reconstruction, not a successful TradingView delivery or Pine compilation test.

## Verification and remaining work

- Local suite: 147/147 PASS.
- TradingView private scripts: update/compilation NOT VERIFIED. Safari's accessibility tree identifies FreightPulse BDI Sandbox Telemetry, but the actual page renders blank and editor actions fail. Chrome can read the chart but input commands time out. An attempted ZIM edit earlier is also unverified.
- Existing alerts retain their frozen script revision. All eight must be recreated from verified repaired scripts, then old alerts paused, before waiting for genuine closed-daily deliveries.
- Do not relax receiver validation, invent source timestamps, or report synthetic/reconstructed payloads as actual receipt.
- Production, paid checkout, customer alerts and the daily 09:00 digest remain disabled/unmodified.
