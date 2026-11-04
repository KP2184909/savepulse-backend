# Queue health reporting — sandbox v24

Added summary-only queue health: pending/working/manual-review counts, oldest
unfinished age, expired worker leases and needsAttention/reason codes. At most
100 unfinished rows are counted, requesting101 to detect truncation. Truncated
counts are explicitly lower bounds and require attention, not a complete total.
Unknown/future received timestamps also require attention. No event IDs, raw
payloads, provider errors, customer details or credentials are returned.

Render GET /api/v1/admin/billing/webhook-queue is no-store, requires existing
administrator authorization, and returns503 if the queue feature is disabled.
It is still draft, not deployed to Production. Sandbox's existing authenticated
worker supports queueStatusOnly=true; this path is read-only and does not drain
the queue, ensure tax rates, call Stripe or send mail.

Combined tests183/183 pass: empty health, old work, unknown age, expired lease,
manual review, privacy, bounded counts and unauthorized HTTP/no-store behavior.
Packaged and deployed isolated function version24 ACTIVE. Actual authenticated
status request542 returned200, pending0/working0/manual_review_required1,
needsAttention=true, reason manual_review_required, truncated=false, emailsSent0.
That review item is the deliberately retained failure fixture from prior QA.
Unauthenticated POST returned401 authentication_required with no health data.

This is a protected health-reporting interface, not an automatic notification
service or an always-on external monitor. No alert recipient/schedule was
created. Production queue and paid checkout remain disabled. Next rollout work
must address scheduled worker liveness and operational review ownership before
claiming unattended Production queue monitoring.
