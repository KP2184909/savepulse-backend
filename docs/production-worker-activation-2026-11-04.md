# Production queue worker activation — sales closed

Owner securely submitted BILLING_WORKER_KEY in Render. No credential was read,
printed or changed by the agent. Deploy dep-dblarqqjnfac73feg8r0 went Live with
release5b55c51. Public unauthenticated worker changed from configuration503 to
authentication401; private Vault call passed authentication and reached the
still-disabled queue (503), confirming the binding before flag activation.

Changed only non-secret flags BILLING_V2_ENABLED=true and
BILLING_WEBHOOK_QUEUE_ENABLED=true in Render. Read back edited boolean values
before saving. New deploy went Live at11:08:49 Asia/Bangkok, normal npm install,
audit0 vulnerabilities. Existing sales/tax/Business flags stayed closed.

Private Production worker probe returned HTTP200/ok=true at
2026-11-04T04:09:17.2946Z. Durable live-mode heartbeat1793765356424 exists,
queue task count0. Enabled cron job1 savepulse-billing-webhook-live-worker,
*/5 * * * *, using the private synchronous HTTP function and Vault reference.
No token-bearing pg_net queue exists on Production.

Public checks after enabling queue: trial/readiness200 ready=true,
database=verified,emailConfigured=true,release5b55c51,autoRenew=false;
billing/catalog200 enabled=false/plans[]; Plus checkout200 with
configured=false/provider=disabled/url=null/public_checkout_disabled.
No new Checkout, subscription, customer email or actual payment created.

This establishes authenticated worker processing of an empty queue, not valid
Live Stripe webhook delivery, receipt of lifecycle events or legal tax issuance.
An automatic cron invocation is verified separately after the first due time.
The scheduler can wake Render; cold starts may exceed its55-second timeout and
will be recorded as a generic worker failure for retry at the next run.
