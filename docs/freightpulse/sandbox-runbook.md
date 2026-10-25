# FreightPulse sandbox runbook

Never run against SavePulse Production for this review. No production deployment or real data ingestion is authorized by the FreightPulse development request. Never copy secrets into this document, a PR, terminal output or browser screenshots.

## Local Demo (no credentials, no email, no payments)

```
PORT=3091 HOST=127.0.0.1 DATA_DIR=/tmp/freightpulse-development-preview node server.js
```

Open http://127.0.0.1:3091/freightpulse/. Demo data and empty/stale cards are explicitly labeled. A static demo.json fixture keeps the review preview usable without pointing a new backend at Production; its fixed example dates are intentional. Authenticated test features are disabled by default. No AI provider is connected; explanations are transparent templates.

## Isolated integration sandbox

- Reauthenticate Stripe connector and select the existing SavePulse sandbox account. Do not infer an account from a matching display name. Separate Product/Price and customer records are mandatory; no modification to SavePulse prices or customers.
- Provision only in that selected sandbox with `tools/provision-freight-sandbox.js`. It requires server-side `FREIGHT_STRIPE_SECRET_KEY` (sk_test only) and an explicit `FREIGHT_STRIPE_ACCOUNT_ID`, refuses a different account, and prints only catalog IDs. Prefer a restricted test key with the required API permissions; no live key is accepted.
- Set returned `FREIGHT_STRIPE_PRODUCT_ID`, `FREIGHT_STRIPE_PRICE_ID`, `FREIGHT_STRIPE_PORTAL_CONFIG_ID`, plus `FREIGHT_APP_BASE_URL` for the isolated preview.
- Use a separate staging Supabase database with the existing scheduler_state structure and RLS enabled; privileged credentials stay server-side. Confirm insert, CAS and restart persistence there. This implementation adds freight:* keys, not SavePulse subscriber plan columns; it has no file fallback for entitlements.
- Set `FREIGHTPULSE_SANDBOX_ENABLED=true` only in the isolated environment. Enable verified identity via the existing email flow; do not click Start SavePulse trial. No FreightPulse trial is configured. Company identity comes from the verified session; body email/customer/company IDs never determine access.
- Register a separate Stripe sandbox destination at `/api/v1/freightpulse/billing/webhook` for checkout.session.completed, checkout.session.async_payment_succeeded, customer.subscription.created/updated/deleted, invoice.paid and invoice.payment_failed. Enter `FREIGHT_STRIPE_WEBHOOK_SECRET` securely. Signature verification uses original raw bytes with 300s tolerance; canonical customer/subscription/current invoice state is retrieved from Stripe.
- Dedicated FreightPulse Stripe customers keep the hosted portal from exposing SavePulse subscriptions. Portal must enable payment-method updates, invoice history and cancellation at period end, with subscription/quantity updates disabled. The canonical Product/Price is rechecked as active, sandbox, USD 9900, monthly, quantity 1.
- No trial/coupon/automatic_tax assumptions are added. Sandbox checkout clearly states tax and seats are unresolved. Establish applicable registrations, locations and inclusive/exclusive tax treatment before any live checkout. Live keys and events fail closed regardless of flags.

## Feed fixtures (not real TradingView)

- Set independent `FREIGHT_TEST_FEED_SECRET` and `FREIGHT_JOB_SECRET` securely. Never reuse SavePulse's webhook secret.
- Configure `FREIGHT_TEST_RULES_JSON` with `versions` (per-symbol allowed script versions) and `maxAgeSeconds` (per-symbol sandbox SLA). Example fixture settings use 36 hours only to exercise freshness behavior; that is not an approved market SLA. Empty config withholds current signals.
- Send `dataMode:test` payloads matching payload-contract.md to `/api/v1/freightpulse/signals/test`; exact repeats are accepted idempotently, conflicts/old bars return 409. Real route `/signals/live` returns 503 until separately implemented/approved.
- Customer preferences select CS routes only. BDI and ZIM remain distinct context panels.
- Email is off by default. To run test delivery, set `FREIGHT_TEST_EMAIL_ENABLED=true` and invoke authenticated `/notifications/tick`. It sends only to the exact authorized test mailbox savepulse.cloud@gmail.com. It does not register cron jobs, change existing campaigns, or consume any invitation quota. Use the shared verified email provider, but a separate stable freight-* idempotency key and queue namespace. Failed sends retry after 15 minutes; ambiguous sends older than 23 hours require review rather than risking a duplicate.
- Discord has no sender or credential path in this patch.

## Provider QA required before declaring integration complete

Use sandbox test payment methods only. Do not enter a real card or buy a live subscription. Exercise initial successful Checkout, pending payment, failed payment, invoice.paid renewal (Stripe test clock), invoice.payment_failed, recovery, cancel-at-period-end and final cancellation. Verify current-period-end access, invoice receipts, portal card changes, duplicate events, out-of-order delivery and retry after a database/provider outage. Same owner with both services must retain the independent SavePulse plan.

## Known development limits

- Company owner workflow only; no team invitations/seats/ownership transfer until policy is agreed. No seat limit is advertised or enforced as a commercial plan.
- Conservative sandbox access: active subscription + latest paid invoice + unexpired paid period; dunning/grace and re-subscription after cancellation require explicit product decisions before launch.
- Financial event ledger is retained in the atomic company document for prototype reliability. Before commercial scale, migrate to normalized company/membership/subscription/event tables with unique constraints, company-scoped RLS, transactional reconciliation and bounded query sizes. No such migration has run in Production.
- Email queue delivery records and company history are separate CAS records; staging fault-injection/recovery review remains required before operational notifications are enabled commercially.
- No rate limiting added for verified owner/company creation beyond the existing OTP limits; sandbox-only scope must remain enforced pending an API abuse review.
- Public copy, real route names, commercial data rights and CS/BDI Pine semantics remain launch gates. No automated cold email or CRM changes.
