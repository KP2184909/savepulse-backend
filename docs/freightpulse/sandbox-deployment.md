# FreightPulse Sandbox receiver — deployed 2026-10-26

Organization: SavePulse (uehsgvokxiuvizsrcyfc), owner-confirmed. Supabase quoted new project cost USD0/month before creation; no plan upgrade or paid service added.

Dedicated project: FreightPulse Sandbox (`sktzydyiwqylpstxjicf`), ap-southeast-1. This is a different project/database from SavePulse Production. No customer/member records were copied.

## URL to use in TradingView

https://sktzydyiwqylpstxjicf.supabase.co/functions/v1/freightpulse-tv-sandbox

POST the existing Pine `{secret_key,payload}` test envelope directly to this URL. It is the Supabase equivalent of the previously proposed Node `/api/v1/freightpulse/tradingview/test` receiver. Do not append that Node path or route through the Netlify preview's Production proxy. GET returns public readiness metadata only, no stored signals or credentials.

Edge Function version2 ACTIVE, verify_jwt=false because the body token is authenticated by the function. Token SHA256 is stored in a service-role-only config row; raw token is never deployed or persisted with signals. The dedicated token is in the owner's local private file, outside the repository, mode0600. The owner must enter/submit it in Pine Inputs themselves. The old SavePulse webhook credential is unchanged.

Existing user Pine script transport.v3 after the delayed-market guard patch is accepted, as is the repository transport.v4; context.telemetry.v1 is accepted for BDI/ZIM diagnostics only. All payloads are test mode. Unknown source freshness never becomes current, and no customer email, Discord, billing or live-sales action exists in this receiver.

Tables: freightpulse_sandbox_config, freightpulse_sandbox_latest, freightpulse_sandbox_events. RLS enabled, anon/authenticated privileges revoked. RPC is SECURITY INVOKER, executable only by service_role. Atomic rate limits: 60 requests/minute and 500/day for authenticated ingestion. Exact canonical replay ignores eventId; same-bar conflicts and older bars return409. Success acknowledges only committed database writes. Request body capped at16KB; no request-body logging. No Supabase service key is sent to TradingView or browser.

## Verified evidence

- Local suite139/139 PASS.
- Public HTTPS tests14/14 PASS after final deployment, including first accepted writes for all8 instruments, duplicate, order/conflict checks, wrong route, live rejection and authentication denial. Slowest sampled response1.893s; this is measured evidence, not a guaranteed latency SLA. Earlier cold health sample1.418s. TradingView's3s deadline still needs actual chart delivery verification.
- Database readback confirmed8 latest rows, no secret_key in payloads, sourceFreshness unknown. Synthetic test rows were then removed (8latest/8events after final run) so historical fixture times cannot block real chart ingestion.
- Security advisor: only3 INFO findings RLS-with-no-policy, intentional for service-role-only tables; no anonymous/user access. https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Actual TradingView alerts/delivery: NOT VERIFIED, awaiting owner credential entry and review-start selection. No alert was enabled by this deployment. SavePulse Production and public site remain unchanged.

Evidence JSON lives outside the repository in freightpulse-qa-evidence/edge-receiver-e2e.json. QA script: tools/qa/check-freight-sandbox-edge.js. Running it writes synthetic rows; clean only its source=isolated-synthetic-qa rows after authorized QA, never actual chart data.
