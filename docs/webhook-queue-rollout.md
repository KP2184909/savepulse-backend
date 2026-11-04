# Durable webhook queue — prepared, disabled

Draft PR10 adds opt-in BILLING_WEBHOOK_QUEUE_ENABLED=true to the Render HTTP
receiver. Default is off; no Production or sandbox configuration was changed.
This flag does not enable billing, paid checkout or tax issuance.

After raw-body signature verification, risk events retain their existing durable
review path. Supported membership lifecycle events are reduced to event/type/
mode/object/subscription identifiers and uniquely inserted in scheduler_state.
Only a successful insert or existing durable row gets200. Storage failure gets
a retryable non-2xx response. No provider call or entitlement grant occurs at
ingress. The queue never stores raw webhook metadata/customer payloads.

The one-minute server worker scans at most10 due rows in the exact mode/account
namespace. It claims each with CAS and a120-second lease, calls the existing
fresh-provider/bound-account lifecycle, updates the recipient mirror, then marks
processed. Errors retain the task with exponential backoff (max1 hour); after20
attempts it requires manual review. A crash after membership sync is replay-safe
through the existing event ledger. A stale worker cannot overwrite a newer
claim. Workers do not depend on trial email configuration to run.

Validation:181/181 combined tests. New local HTTP test verifies durable failure
returns503, successful receipt returns event_queued, replay acknowledges a
duplicate, and Stripe is never called during ingress. Module tests cover5-way
duplicate ingress, minimal data retention, wrong mode, restart/backoff/review,
concurrent workers and expired-lease fencing. Existing lifecycle recovery tests
cover cancellation-safe retry. These are fixtures, not deployed queue evidence.

Before enabling: wire the same queue into the isolated Edge wrapper and its
authenticated scheduled worker, test actual signed queued receipt and completed
processing, prove retry after an injected test-only failure, and expose pending/
manual-review counts operationally. Only then consider the Render flag. The
current Edge v22 continues synchronous lifecycle processing; it has NOT gained
this queue merely because its shared source exists in the draft.

Free Render instances can sleep. The in-process timer is not an always-running
scheduler, so delayed processing remains possible; retain authenticated status
reconciliation and provide an external authenticated scheduled worker before
claiming an operational processing SLA. Database writes can also be slow: queue
ingress removes provider latency but does not guarantee zero timeouts.

No new schema/public grants are required: existing service-role-only
scheduler_state holds rows. Example read-only operational inspection (never
include entire values or auth tokens in output):

```sql
select value->>'state' as state, count(*)
from public.scheduler_state
where key like 'billing-webhook:v1:test:acct_1TbuPE0su7h1AsZT:%'
group by value->>'state';
```
