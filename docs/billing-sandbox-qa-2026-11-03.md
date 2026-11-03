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
