# Commodity feed rollout

This update expands the reference feed universe to 16 symbols. It does not grant commercial data rights, change prices or subscription entitlements, or automatically launch commodity marketing/digests.

| Chart | Backend Symbol Override | Raw quote unit |
|---|---|---|
| ICEEUR:BRN1! | BRENTUSD | USD/barrel |
| NYMEX:CL1! | WTIUSD | USD/barrel |
| NYMEX:NG1! | NGUSD | USD/MMBtu |
| COMEX:HG1! | COPPERUSD | USD/pound |
| COMEX:ALI1! | ALUMINUMUSD | USD/metric tonne |
| ICEUS:SB1! | SUGARUSD | US cents/pound |
| MYX:FCPO1! | FCPO | MYR/metric tonne |

Exchange-prefixed ticker aliases also normalize to these canonical names. SUGARUSD is a canonical identifier: its incoming price remains US cents, not dollars. FCPO remains MYR. Continuous futures are reference series with rollover effects, not physical supplier quotes. They are not put into SYMBOL_MARKETS, so FX-direction inversion does not apply.

## Before enabling the feeds

1. Keep the seven incorrectly configured alerts paused. Inspect each saved alert's script inputs, not just its name. Correct overrides and recreate its Pine alert snapshot on 1D, Any alert() function call, existing webhook endpoint and existing key. A chart input change does not repair an existing snapshot.
2. Recommended subsequent Pine payload enhancement: add source_ticker=syminfo.tickerid. The backend rejects mismatched source/override pairs when this is supplied. Legacy payloads remain accepted; without source_ticker, the server cannot identify a wrong but valid override. This patch does not edit Pine code or current alerts.
3. Before sending customer information, inspect the BTCTHB record previously observed as 4619 following the FCPO alert. Verify provenance from authenticated ingestion history and restore only from trusted records. This code does not overwrite or invent replacement prices.
4. Deploy the tested commit, confirm the admin snapshot contains 16 symbols and confirm each feed updates its own canonical row. Optional SQL placeholders are in supabase/commodities_seed.sql; they have null prices/timestamps and are not fresh observations. No SQL is necessary for normal upsert ingestion.
5. Commodity writes require positive finite price, 1D and valid bar_time within seven days, not more than one hour in the future. Duplicate or older bars do not overwrite the current bar. An alert fire alone is not evidence of successful webhook delivery.
6. Keep commercial commodity delivery pending data-rights review and a separate explicit entitlement/reporting decision. Existing nine-asset daily email readiness, membership universes and digest layouts stay unchanged; missing commodity feeds must not block legacy members.

Source is EMA14/60. An upward EMA cross alone does not prove a cheap purchasing window or cost savings. Commodity responses use neutral reference copy and include Thai/English names, quote currency and unit.

## Validation

Run npm test. Commodity tests cover seven alias-to-canonical ingestions, disk persistence, snapshot and status APIs, source identity mismatch, invalid data, replay ordering, legacy readiness and unchanged memberships. Deployment and actual TradingView deliveries require separate production verification.
