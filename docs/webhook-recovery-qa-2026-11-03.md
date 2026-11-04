# Webhook recovery QA — 2026-11-03

Added a deterministic multi-worker lifecycle regression. One webhook is held
inside its account lease while another receives409 billing_busy_retry. Virtual
time advances beyond the90-second lease; a fresh worker processes cancellation.
The stalled worker then resumes but is fenced from writing. Its event is not
marked processed until a successful retry; that retry reads current canceled
provider state, remains Free and is idempotent on subsequent delivery.
No production clock, membership or subscription was changed.

Focused lifecycle tests18/18; complete draft suite177/177 pass. No runtime
behavior was changed: the test establishes recovery behavior of existing lease,
CAS and fresh-provider checks, not that historical Stripe failures disappeared.

Supabase read-only function logs independently corroborate the actual replay
from the preceding audit:2026-11-03T14:46:08.212Z, HTTP200,
execution_time_ms4746, deployed function version22. This resolves the earlier
Dashboard-time ambiguity:21:46:08 Asia/Bangkok. Only status/duration/version were
queried; no request headers, tokens, raw payload or customer details returned.

The older timeout cannot be causally diagnosed from today's24-hour logs.
The latest replay took4.746 seconds; it is one sample, not a latency percentile
or a guarantee against timeout. Historical409 and timeout entries remain
historical failed attempts. Before opening Live sales, verify delivery recovery
under representative provider/database latency and deploy/validate the Render
receiver separately. Production checkout remains closed.
