# Worker liveness — sandbox v25

Successful queue sweeps now persist a separate mode/account-scoped checkpoint,
even if no jobs are due. Failed scans cannot refresh it. CAS retries preserve
the latest completion timestamp across workers. Health reports worker age and
worker_not_recent if no valid checkpoint exists or age reaches30 minutes. It
continues to report manual-review and stale-task conditions independently.
This is health data, not an automatically delivered alert or SLA.

Tests184/184 pass, including restart, stale heartbeat, failed-sweep preservation
and recovery. Deployed isolated Edge version25 ACTIVE; Production unchanged.
Authenticated queue-only request543 returned200/processed0. Read-only health
request544 returned200 with lastCompletedAt2026-11-03T16:40:35.390Z and
workerAgeMs16534. No worker_not_recent reason; the sole attention reason remained
the deliberately retained manual-review fixture. EmailsSent0.

Read-only cron inventory: savepulse-tax-document-sandbox-retry active, schedule
*/15 * * * *. Latest4 cron job executions succeeded at15:45,16:00,16:15,16:30Z.
These cron SQL-success rows prove scheduling, not HTTP outcome. Separately,
recent retained worker HTTP response540 was200 with webhookQueue.processed0.
The new v25 heartbeat was established by explicit request543; a post-v25 cron
heartbeat was not yet observed, so do not conflate these sources.

No Production enablement, new payment or email send occurred. Before Render
queue rollout, arrange authenticated external scheduling/health observation:
the Free instance's in-process timer can sleep. Sandbox monitoring uses existing
cron and is isolated from Production. The Live tax/checkout release remains a
separate approval/readiness concern.
