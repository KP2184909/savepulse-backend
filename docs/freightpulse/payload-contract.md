# Draft Pine contract — NOT approved for real integration

Route names and semantics must be agreed with the FreightPulse chat. No messages have been sent there without owner authorization. Do not deploy this contract as a live feed until approved.

Sandbox ingestion: `POST /api/v1/freightpulse/signals/test`, authenticated by a separate `FREIGHT_TEST_FEED_SECRET` bearer header. Never reuse SavePulse's feed secret, paste it into examples, or save raw request bodies/credentials. Real feed endpoint returns 503 regardless of configuration.

```json
{
  "contractVersion": "freightpulse.draft.v1",
  "scriptVersion": "container-test-v1",
  "eventId": "test-CS11-2026-10-23",
  "symbol": "CS11!",
  "family": "container",
  "route": "CS11!",
  "timeframe": "1D",
  "barTime": "2026-10-23T00:00:00Z",
  "barCloseTime": "2026-10-24T00:00:00Z",
  "barClosed": true,
  "signalStatus": "pressure_up",
  "windowDay": 2,
  "windowStart": "2026-10-22T00:00:00Z",
  "sourceUpdatedAt": "2026-10-24T00:00:00Z",
  "source": "test-fixture",
  "dataMode": "test"
}
```

- Families: container (`CS11!`, `CS21!`, `CS31!`, `CS41!`, `CS51!`, `CS61!`); bulk (`BDI`); context (`ZIM`). No assumed geographic route mappings. Each source/script has an explicit version allowlist.
- Status enum is a DRAFT: `pressure_up`, `easing`, `unclear`. For container pressure_up only, windowDay must be integer 1–5 and windowStart must be a valid time no later than barTime. Others require both fields null. BDI and ZIM do not inherit container windows.
- All timestamps are RFC3339/UTC strings. barTime is opening time; barCloseTime is the actual end time of the confirmed bar. sourceUpdatedAt must be the market-data update time, NOT timenow/webhook send time. Provider/script must establish what this represents before agreement. If unavailable, withhold the current signal; do not fabricate now.
- Closed 1D bars only. Future timestamps and source-update times older than barCloseTime are rejected in this draft convention (review with Pine author).
- Canonical timestamp comparisons reject older bars and conflicting same-bar updates. Exact same-bar replays are idempotent even with a different eventId. receivedAt is assigned by server and does not affect freshness.
- Freshness SLA must be configured per symbol. Missing SLA means no current status. Both source update and bar close must be recent; receipt time cannot revive old data. Stale cards hide signalStatus/window and retain timestamps/source for inspection.
- CS five-bar prototype is not calculated or copied from SavePulse here. No implied consecutive rises, EMA14 prerequisite, restart or cancellation rule. These remain Pine-author decisions with fixtures required.
- No CS/BDI/ZIM signal is used as an actual booking quote. Rollover, data delay, source licensing and market calendars remain explicit review gates.
