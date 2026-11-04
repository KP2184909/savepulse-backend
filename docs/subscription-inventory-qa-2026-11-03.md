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

## Live inventory completed (supersedes the earlier UI blocker)

Render loaded on retry. Verified repository/main/release922997 before temporarily
running `npm install && (node tools/check-live-subscriptions.js || true)`.
Deploy `dep-dbkt2q7f3r2c73frlm50`, at2026-11-03 19:20:04 Asia/Bangkok,
reported scope=subscription_inventory_only, complete=true, total=0, statuses={},
migrationReviewRequired=false. The reader verifies the expected merchant before
listing status=all with pagination; this is actual Live API evidence, not a
deduction from Stripe's onboarding UI. No subscriptions were modified.
The same build reported audited2 packages and found0 vulnerabilities.
Screenshot: `/tmp/savepulse-live-qa/live-subscription-inventory.png`.

The Production local store aggregate remains5 Free rows and no paid-plan rows.
Together these checks found no existing paid subscriptions to migrate at audit
time. This does not prove future webhook delivery, lifecycle correctness or
tax issuance. PR10 remains a draft and new Live sales remain disabled.

Restored Build Command to `npm install`. Final deploy
`dep-dbkt3jjncjis73f980j0` visibly reports Deploy succeeded | Live; its logs
confirm the restored command,0 vulnerabilities, Supabase bootstrap completed,
and service live at19:22:05 Asia/Bangkok. Readiness on both public hosts still
returns ready=true/release922997/autoRenew=false; scheduler last observed
12:23:55.114Z. Plus checkout remains disabled on both hosts.
Final deploy screenshot: `/tmp/savepulse-live-qa/inventory-build-restored.png`.
