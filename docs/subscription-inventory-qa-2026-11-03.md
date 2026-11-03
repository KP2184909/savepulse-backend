# Subscription inventory QA — 2026-11-03

## Verified

- PR13 merged as `922997cf7f2561d9b7d677cbb4e0a3f6941dcd34`.
  It adds an opt-in GET-only, paginated Stripe subscription inventory command;
  it does not run on startup or change membership/checkout behavior.
- Draft PR10 merged this main commit as `7af27b8`; combined tests:174/174 pass.
- Production `/api/v1/trial/readiness` on both the backend and savepulse.cloud
  reports release922997, ready=true, database=verified, emailConfigured=true,
  autoRenew=false; scheduler timestamp2026-11-03T07:30:52.487Z.
  Configuration readiness does not establish inbox delivery.
- POST `/api/v1/billing/checkout` for Plus on both hosts returns HTTP200 with
  configured=false, provider=disabled, url=null, reason=public_checkout_disabled.
  No Checkout Session or payment was created.
- Read-only aggregate of Production subscribers:5 Free rows, no paid-plan rows.
  This is local-store evidence only, not a Stripe subscription inventory.

## Still unverified

The actual Stripe Live inventory command has NOT run. Render Settings and the
dashboard root render blank in native Chrome, including after one reload.
No Build Command was changed in this attempt. Do not infer total0 from Stripe's
onboarding UI or the local subscriber aggregate.

Next: run `node tools/check-live-subscriptions.js` inside the trusted Render
environment, inspect complete=true and count/status output, and restore any
temporary build command to `npm install`. Nonempty or incomplete results require
migration review before replacing the Production webhook receiver. PR10 remains
a draft; this audit does not approve Live sales or legal tax issuance.
