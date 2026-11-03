# Read-only Live billing preflight release

This release adds only an administrator-authorized, no-store configuration
inspection endpoint and a GET-only Stripe reader. It does not replace the
payment webhook, create checkout sessions, enable sales, alter member access,
modify tax settings or send emails. The larger billing implementation remains
in draft PR10 and is not part of this release.

GET /api/v1/admin/billing/live-preflight uses the existing server-side admin
key. Never place that key in URLs or commit/paste environment values. Results
contain only PASS/FAIL/NOT_VERIFIED checks, not provider objects or credentials.
The CLI alternative is node tools/check-billing-live.js inside the trusted
server environment.

Provider reads require an explicitly configured Live key, expected account ID
and exact production application URL. Account mismatch stops further reads.
The checks cover USD5/15/59 monthly Prices, inclusive domestic TH7% manual VAT,
13 lifecycle/risk webhook events and saved Portal options. Configuration PASS
is not Production E2E, signing-secret verification or permission to open sales.
Do not subscribe risk events until their receiver and worker are deployed.

Validation before release:104/104 tests, including unauthenticated denial,
no-store responses, safe disabled/unconfigured response, account mismatch,
provider failure sanitization and bounded read-only route restrictions.
Existing main tests remain passing. No public/frontend files are changed.
