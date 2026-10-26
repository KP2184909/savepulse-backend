# BDI sandbox rebound rule — approved 2026-10-26

The owner explicitly approved reusing the CS rebound/next-four-bars/lower-close-restart mechanics for BDI, replacing the previous BDI-rules-pending decision for sandbox work only. This does not approve a live feed, sales, customer email delivery, commercial data rights, rollover handling, or restart after ordinary expiry.

`pine/freightpulse/bdi-next4-sandbox.pine` applies only to standard INDEX:BDI daily charts. It excludes the rebound confirmation bar, counts the next four data-bearing bars, ends an active window on a lower close, and uses that lower-close bar as the waiting baseline for another rebound. It preserves unknown source freshness. Script version: `freightpulse.bulk.next4.transport.v1`; rule version: `freightpulse.bdi.rebound-next-4.lower-close-restart.v1`.

BDI remains dry-bulk context, with an observation window rather than a claim about container-route booking prices. ZIM rules and the existing six CS alerts are unchanged. Customer-facing assessments remain disabled pending actual feed/freshness verification.

The sandbox receiver was deployed as Edge function version 3. All 140 local tests passed. Four isolated public endpoint checks passed: accepted BDI window (200), identical duplicate (200, duplicate true), day five rejected (422), and mismatched rule rejected (422). Synthetic rows were deleted afterward; zero actual chart receipts were present.

TradingView private script `FreightPulse BDI Sandbox Telemetry` was updated to indicator `FreightPulse BDI Sandbox Feed v1.0`. Its Inputs were prepared with sandbox output enabled and review date 2026-10-26. The user entered and submitted the sandbox credential. Inputs were verified without exposing its value: output enabled, review date 2026-10-26. Alert `FreightPulse Sandbox BDI Dry Bulk 1D v1` was created with Any alert() function call, 1D, and the dedicated Supabase sandbox webhook URL; its status was verified Active. The CS-only indicator was removed from BDI using Object Tree. The layout was saved with CS11 / CS41 / BDI / CS31 and no RE10142 errors. Actual TradingView delivery remains unverified: zero BDI chart receipts at verification.
