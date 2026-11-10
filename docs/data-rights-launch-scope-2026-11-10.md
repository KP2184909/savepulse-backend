# SavePulse commercial data scope — 10 November 2026

Decision: no current TradingView-fed paid tier is cleared by this audit. This is a missing-permission finding, not a conclusion that all exchange-rate facts are copyrighted or that licensing is impossible. Do not enable Live sales from this document.

## Evidence and limits

- Current checkout/pricing branch: `test/revised-prices-sandbox`, pricing parent `fix/approved-39-49-69-pricing`. USD39/49/69 is approved for preparation; the actual Production paid catalogue returned enabled=false on 10 November.
- Read `src/plans.js`, `src/dailyDigestEmail.js`, `src/signalEngine.js`, `public/for-business/index.html`, `docs/commodities-rollout.md`, and launch/trial documentation. Configuration is not evidence of a working customer feature or a data license.
- Focused search of the connected SavePulse QA mailbox for TradingView/market-data licensing, redistribution and derived-data agreements returned no messages. Only that mailbox/query was checked; absence there does not prove that no agreement exists elsewhere.
- Official terms reviewed: https://www.tradingview.com/policies/ , sections 3, 4 and 6, retrieved 10 November 2026. Section 3 restricts commercial redistribution and processing, expressly including alerts/webhooks and derived services; separate permission may be needed from TradingView and relevant data providers. Section 4 permits certain attributed chart snapshots, which does not establish authorization for this automated paid feed. Exact source contracts and any separately negotiated agreement still control the applicable scope.

## Actual configured scope, not a marketing promise

| Tier | Configured asset entitlement | Delivery/feature finding | Release decision |
|---|---|---|---|
| Free | USDTHB, JPYTHB, EURTHB, USDJPY, EURUSD | Existing daily template selects USDTHB only | Free delivery is not itself a data-rights exemption; audit source/use before expanding |
| Plus USD39 | Same five FX symbols | Active premium template previously selected three FX assets; candidate patch now covers all five (legacy renderer aligned too) | Hold paid data delivery; align promised daily coverage before launch |
| Pro USD49 | Five FX symbols plus XAUTHB, BTCTHB, XAUUSD, BTCUSD | Active premium template previously selected seven assets; candidate patch now covers all nine; watchlist/channel declarations still need independent E2E proof | Hold until source/use permission and operational scope are verified |
| Business USD69 | Same nine symbols as Pro | Invoice routes exist; public business page is a local manual-input scenario calculator/printable brief and research preview | Not a commodity-data package; no release based on entitlement flags or billing QA alone |

`alertChannels` declarations include LINE/Telegram/team_email in some plans. They must not be advertised as tested delivery integrations merely because listed in `plans.js`. A 100-item watchlist limit is not proof of 100 licensed instruments, team seats or multi-user access.

Seven commodity reference feeds remain outside all configured paid asset universes:

| Canonical symbol | Documented chart | Unit |
|---|---|---|
| COPPERUSD | COMEX:HG1! | USD/pound |
| BRENTUSD | ICEEUR:BRN1! | USD/barrel |
| WTIUSD | NYMEX:CL1! | USD/barrel |
| NGUSD | NYMEX:NG1! | USD/MMBtu |
| ALUMINUMUSD | COMEX:ALI1! | USD/metric tonne |
| SUGARUSD | ICEUS:SB1! | US cents/pound |
| FCPO | MYX:FCPO1! | MYR/metric tonne |

These are continuous-futures benchmarks, not supplier quotes. FreightPulse CS/BDI/ZIM remains paused and outside this release.

## Source identity still required

Canonical names such as EURUSD or BTCUSD do not identify a vendor, broker, exchange, index owner or license. Record the exact `syminfo.tickerid`, vendor, real-time/delayed/EOD status and source-update timestamp for every saved alert. Current ingestion accepts legacy payloads without `source_ticker`; therefore a valid override alone cannot prove provenance. The commodity chart mapping above is documented configuration, not independent proof of every live alert snapshot.

Follow-up: exact saved alert chart symbols were retrieved through the connected TradingView API on 10 November; see `docs/offer-readiness-2026-11-10.md`. Permission remains unverified for all nine; saved chart identity is not proof of a license, payload source identity, feed freshness or delivery success. Do not infer FX or crypto exemption, or infer ownership of a synthetic THB cross. If a cross is computed, document both component feeds, conversion method and rights for the resulting output.

## Written permission checklist

Obtain a response or contract identifying:

1. The licensed company (The Connector Co., Ltd., operating SavePulse), exact sources/instruments, permitted territories, intended paid B2B/B2C audience and channels (website and customer email).
2. Permission to ingest/store/process daily prices and signals, calculate derived indicators and publish plain-language derived outputs. Explicitly ask about outputs with no raw quote/chart: changing wording alone does not establish permission.
3. Display, external redistribution, derived-data and non-display permissions as applicable; who separately authorizes the source content; internal versus external recipients and any per-user/company reporting obligations.
4. Retention/history, attribution, delay/freshness restrictions, export/PDF/email limits, audit/reporting requirements and termination handling.
5. A written price quotation: setup, minimum monthly, instrument/source fees, per-user/company fees, derived-output/email fees and taxes. **No verified license quotation is available.** A TradingView subscription or chart-data add-on must not be represented as that quotation.

Do not attach secrets or real customer lists. No licensing request was sent, contract accepted, or paid service purchased in this audit.

## Candidate narrower release

A source-independent local calculator using customer-entered assumptions and illustrative data is a candidate for a separate product scope. It cannot silently use TradingView data/signals or imply live licensed prices. It still needs its own feature acceptance, accurate offer, privacy and billing/tax readiness; this audit does not approve charging for it. The existing Business preview supplies a starting point, not a completed paid team workflow.

## Closure criteria

This step is complete only when the actual source inventory and permission evidence cover the intended offer, customer-visible promises match tested features, and a written release matrix names the approved instruments/channels. Until then the review is complete but the licensing gate remains OPEN. e-Tax activation is a separate gate and cannot cure missing data permission.
