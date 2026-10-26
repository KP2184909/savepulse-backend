# ZIM SavePulse adapter — sandbox only

The owner supplied the complete SavePulse Daily Feed Engine EMA14/60 source on 2026-10-26. The adapter's core indicator/state-engine block is preserved verbatim; a regression test pins its SHA-256. The new private indicator is `FreightPulse ZIM SavePulse Context Sandbox v1.0`, source `pine/freightpulse/zim-savepulse-context-sandbox.pine`.

## Meaning and limits

- `STRONG_BUY` or `BUY_ZONE`: positive shipping-equity context (`pressure_up`).
- `SELL_ZONE`, or EMA14 below EMA60: weakening shipping-equity context (`easing`). In the latter case the original engine action remains WAIT_ZONE; the context describes the EMA condition rather than interpreting WAIT as an instruction to delay a booking.
- Otherwise: unclear equity context.

These are not container booking instructions or a composite freight score. The original five-bar SavePulse event window stays in the calculation but is not exposed as a CS rate-locking window. The transport has inactive/null window fields. End of the original event window does not automatically mean easing.

The approved configuration is EMA14/60 and five bars; other settings fail the sandbox guard. Standard 1D NYSE:ZIM and BATS:ZIM charts are supported. Canonical instrument is NYSE:ZIM; the `source` field retains the actual chart provider. BATS data is not represented as a full NYSE feed. No verified source-update timestamp is available, so freshness remains unknown and the backend does not display a current assessment.

## Transport and validation

Script version `freightpulse.zim.savepulse-context.v1`; rule version `freightpulse.zim.savepulse-ema14-60-window5.v1`. Emits only confirmed realtime daily bars, with the dedicated sandbox token in the authenticated envelope, safely escaped JSON, and no credentials in persisted payloads. Original SavePulse Production source and receiver are unchanged.

Receiver `freightpulse-tv-sandbox` version 4 is deployed on the isolated Supabase sandbox. All 141 local tests passed. Public endpoint checks passed: valid ZIM accepted (200, current false), identical duplicate acknowledged (200), wrong rule rejected (422), container-style window rejected (422). Synthetic QA records were removed afterward. These checks do not prove delivery from TradingView.

The new Pine indicator was saved separately and added to the user's ZIM chart without a reported compiler/runtime error. The owner entered and submitted the dedicated sandbox token. Inputs were verified without displaying the value: token present and output enabled. Replacement Alert `FreightPulse Sandbox ZIM Equity Context 1D v1` uses Any alert() function call on 1D and the isolated Supabase sandbox URL, with app/email notifications off. After saving the layout and reloading TradingView, the new Alert was verified Active and the legacy SavePulse ZIM Alert was verified Stopped manually. Actual TradingView delivery remains unverified; no real chart event had been received at final verification.
