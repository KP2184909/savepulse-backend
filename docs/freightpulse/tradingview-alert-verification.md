# TradingView sandbox alert verification — 2026-10-26

Verified in the user's TradingView FreightPulse layout after reloading the page.

| Alert | Interval | Verified status |
| --- | --- | --- |
| FreightPulse Sandbox CS11 FBX01 1D v2 | 1D | Active |
| FreightPulse Sandbox CS21 FBX02 1D v2 | 1D | Active |
| FreightPulse Sandbox CS31 FBX03 1D v2 | 1D | Active |
| FreightPulse Sandbox CS41 FBX11 1D v2 | 1D | Active |
| FreightPulse Sandbox CS51 FBX12 1D v2 | 1D | Active |
| FreightPulse Sandbox CS61 FBX13 1D v2 | 1D | Active |
| FreightPulse Sandbox CS21 FBX02 1D (superseded) | 1D | Stopped manually |

Each new alert uses `FreightPulse CS Sandbox Feed v1.2` with **Any alert() function call**. The deployed receiver accepts this transport version. The configured chart instance, with its user-entered sandbox token and 2026-10-26 review start, was reused by changing the chart symbol before creating each independent alert. No token was added to source code or to this report.

The webhook URL was checked on each new alert creation form:

`https://sktzydyiwqylpstxjicf.supabase.co/functions/v1/freightpulse-tv-sandbox`

This is the isolated sandbox receiver, not a Production endpoint. Account membership, billing, live signals, customer notifications, and SavePulse Production were not changed by this alert setup.

## Delivery remains unverified

The sandbox event table contained **0 received chart bars**, with no latest receipt, at the end of this setup. An Active alert proves that TradingView saved it; it does not prove webhook delivery, successful authentication, or acceptance by the backend. The script emits on confirmed realtime daily bars, not historical replay.

After a genuine daily-bar delivery, inspect the TradingView delivery result and the sandbox events/latest tables. Confirm the matching symbol/route, script/rule versions, closed-bar timestamp, window state/day, and deduplication behavior. A receipt must retain unknown source freshness when the source update timestamp is not independently verified. Do not promote delayed/old data to a current customer signal.

Existing automated evidence remains separate: 139 local tests and 14 synthetic public-endpoint checks passed before this UI setup. Those checks are not evidence of actual TradingView delivery. No customer-facing live feed or sale is enabled by this report.
