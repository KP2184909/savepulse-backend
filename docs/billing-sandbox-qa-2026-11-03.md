# SavePulse billing sandbox deployment — 2026-11-03

Project verified: `sktzydyiwqylpstxjicf`, FreightPulse Sandbox, existing SavePulse
organization. Only the SavePulse billing function was replaced. FreightPulse's
functions and SavePulse Production were not changed.

Deployed `savepulse-billing-sandbox` version20, ACTIVE. Its worker and webhook
now use the same billingRiskOperations module as the main server. Existing
project guard, test-key requirement, signed webhook verification, worker-token
authentication and single test mailbox restriction remain in effect. Deployment
retains verify_jwt=false because the handler provides its own authentication.
No credentials were printed, replaced or committed.

| Check | Result | Evidence |
|---|---|---|
| Local regression | PASS |166/166 tests; ESM packaging and git diff checks pass |
| Deployed readiness | PASS | GET `/functions/v1/savepulse-billing-sandbox/readiness`: test, isolated, configured=true, webhookConfigured=true, liveSales=false |
| Worker without authentication | PASS | POST `/tax-worker` returns authentication_required |
| Authenticated worker, no pending work | PASS | pg_net request484: HTTP200, risksVerified=0, accepted emails=0, failed=0 |
| Real database and Stripe ownership resolution | PASS (injected fixture) | request486: HTTP200, risksVerified=1, accepted emails=0, failed=0 |
| Production trial health | PASS (readiness only) | `/api/v1/trial/readiness`: ready=true, database=verified, emailConfigured=true; release25cb7ef unchanged; scheduler 2026-11-03T04:28:29.424Z |
| Production paid checkout and tax issuance | NOT VERIFIED | No Production deployment or real charge performed |

Ownership test explicitly inserted a new test-only review task referencing the
previously verified sandbox refund charge, not a new payment/refund. Event ID
`evt_savepulse_operations_qa_20261103`, testCase
`injected_worker_fixture_not_webhook_delivery`, task hash
`752ecbdbe11a46b1e93529527adfc5e03392edfb968017cfd605ca08dbcb5ebc`.
The deployed worker resolved the Stripe payment graph and persisted
state=verified_review_required, ownershipVerified=true, entitlementChanged=false,
creditNoteCreated=false. This proves worker/database/provider integration for
that sandbox task; it is not evidence of a new signed Stripe webhook delivery,
dispute/fraud event, legal credit note or Production payment.

Existing review tasks were not reset or rewritten. The fixture remains clearly
labelled for audit. No email was sent during these worker runs. Main server risk
operations still require deployment and operational review procedures before
the three additional Live risk-event subscriptions are enabled. No paid launch
approval is implied.

## Production storage audit and readiness consistency

Read-only inspection of SavePulse Production `knkimiyxcmkslxemcynp` confirmed
RLS enabled on public.scheduler_state, subscribers and stripe_events. No policies
on these tables grant anon/authenticated/public browser-role access. The
scheduler_state key has a valid unique index. This is scoped schema evidence,
not a full database security audit; no customer rows, secrets or schema were
changed. The public billing catalog still returned404, consistent with the
un-deployed PR rather than a working paid signup flow.

The legacy administrator readiness response now uses the same13 required events
as Live preflight, instead of its stale6-event list. Its response explicitly
labels scope=configuration_presence_only and launchReady=false, provides the
provider preflight route, and exposes only boolean setup/approval indicators.
It does not claim to verify Stripe resources or lawful tax issuance. Regression
suite remains166/166 after this change; this response change is not deployed.

Still executable before e-Tax approval: review and deploy a closed-sales backend
release, apply the non-secret Live resource mapping, run authenticated provider
preflight, verify deployed risk receipt/worker operations before subscribing
the3 risk events, and complete frontend/mobile membership QA. These are not
blocked solely by RD approval. However, the current combined draft also contains
incomplete tax FX exception/issuance operations: do not treat its local PASS as
approval to open checkout. Overseas/mixed-use checkout remains unsupported and
must remain blocked. A confirmed lawful issuance/delivery workflow is needed
before taking real customer payments; pending e-Tax enrollment alone does not
establish that workflow.

## Closed-sales Production preflight release

PR11 extracted only the read-only administrator preflight from the larger billing
draft. It passed104/104 tests on main and was merged/deployed as
`37a8f71baefc57c8bd6a6c9ba178faf3bdc395cd`. No frontend, checkout, webhook,
membership or tax-issuance behavior was changed in this release. PR10 was then
merged with main and its full regression suite passed167/167.

Verified over Production HTTP after deployment:

- Render `/api/v1/trial/readiness`: ready=true, database=verified,
  emailConfigured=true, release37a8f71, autoRenew=false. Scheduler timestamp
  2026-11-03T05:29:29.568Z.
- Backend and savepulse.cloud `/api/v1/admin/billing/live-preflight`:
  HTTP401 unauthorized_admin_billing without admin credentials; public-domain
  response has Cache-Control:no-store.
- Public `/api/v1/billing/checkout` with approved test mailbox and Plus plan:
  configured=false, provider=disabled, url=null,
  reason=public_checkout_disabled. No checkout or payment was created.

The authenticated Live provider report has NOT been run from Production, and
the non-secret resource mapping has not been applied. Both IAB tab binding and
WebMCP acquisition currently fail with a browser adapter capability error,
despite the Stripe tab being present in inventory. This is not a Mac lock or
an owner login failure. No credentials were exported to bypass browser access.
The separate closed-sales release makes the next server-side checks possible
without prematurely deploying PR10's replacement payment handler.
