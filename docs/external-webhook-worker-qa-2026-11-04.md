# External queue worker — prepared, Production disabled

Sandbox automatic operation was independently observed after v25 deployment:
cron runs succeeded at2026-11-04 02:30,02:45,03:00Z; retained HTTP responses
584/585/586 were200 with webhookQueue.processed0. Durable checkpoint was
1793761201712 (2026-11-04T03:00:01.712Z), confirming a real sweep completed.
These checks used only time/status/counts; no cron commands or tokens returned.

Prepared POST /api/v1/admin/billing/webhook-worker for external Render wake/drain.
It requires a dedicated64-hex BILLING_WORKER_KEY in x-savepulse-worker-token,
uses constant-time comparison, no-store, and drains at most1 due queue task per
call. It then returns aggregate health and emailsSent0. Missing configuration
returns503; missing/malformed/wrong credentials return401; disabled queue503.
An administrator/readiness/member credential is not a substitute for this key.
Existing account/queue leases still fence overlap with in-process work.

Tests185/185 passed, including HTTP dedicated-token rejection and accepted
worker call. This endpoint and SQL template are NOT deployed or enabled in
Production. No new credential was created, exported or placed in source.
ops/billing-webhook-live-cron.sql.example prepares a5-minute pg_net call using
an existing Vault secret reference, with a missing-credential guard. It was NOT
executed. Confirm Production extensions, dedicated key binding, worker route,
and rollout first; never reuse sandbox credentials or put a token in cron SQL.

One-job-per-call bounds batch size, not individual provider latency. A cold
Render instance may exceed the60-second HTTP timeout. Durable storage and
idempotent retries remain required; monitor both HTTP and heartbeat. This is
not a paid hosting upgrade or a processing-time guarantee. Current Live sales
remain closed and tax-document readiness remains a separate launch condition.
