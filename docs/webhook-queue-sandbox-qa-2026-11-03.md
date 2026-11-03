# Queue sandbox deployment and actual delivery

Deployed only savepulse-billing-sandbox in sktzydyiwqylpstxjicf as version23,
ACTIVE. Packager now includes billingWebhookInbox; the Edge webhook retains
signature/project/test-mode checks and queues lifecycle references. Existing
authenticated tax-worker now drains up to10 due queue jobs; queueOnly=true
returns after queue processing without running email delivery. Existing15-minute
cron also reaches this worker. Risk review remains its separate durable path.

Node regression suite181/181 passed before deployment; public readiness still
reports mode=test, isolated=true, configured=true, webhookConfigured=true,
liveSales=false. Own webhook/worker authentication remains enabled inside the
function; platform verify_jwt remains false as before.

Actual Stripe Dashboard Resend of cancellation evt_1UW5i90su7h1AsZTlZ2Tg09K
created exactly1 pending queue row (attempts0). Supabase function logs confirm
version23, HTTP200,2037ms at2026-11-03T16:24:27.975Z. The previously captured
Dashboard detail remained selected on the earlier delivery and still displayed
duplicate_event; that screenshot is NOT evidence of the new queue response.
New receipt is established by the signed-only ingress, new durable queue row
and version23 invocation log.

Authenticated queue-only worker request536 returned HTTP200,
webhookQueue.processed=1, emailsSent=0. Durable state became processed,
attempts0, processedAt2026-11-03T16:24:57.930Z. The existing membership remained
canceled and its processed lifecycle event count remained16. No new charge,
subscription or email was created. Worker credential stayed server-side.

Latest single receipt2037ms vs earlier synchronous receipt4746ms is a sample,
not a latency benchmark/SLA. Deployed failure-injection retry and operational
manual-review monitoring still need acceptance before Production queue rollout.
Render code/queue flag and public paid checkout remain unchanged/disabled.
