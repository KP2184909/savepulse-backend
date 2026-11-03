# Webhook boundary QA — 2026-11-03

Draft PR10 HTTP receiver tests now exercise stale and future timestamps, missing
signatures, raw-body tampering, signed malformed JSON, durable-store failure and
concurrent replay. Rejected requests produce no durable writes. A simulated
database503 yields HTTP503; retry succeeds, and5 concurrent deliveries create
exactly1 durable review task with4 duplicate acknowledgements. No external
Stripe writes or email sends occur: provider and database use local fixtures.

Combined regression suite:176/176 pass. Existing tests also cover verified
identity, paid access after refresh, subscription cancellation, mode isolation,
fresh provider reconciliation and risk events that never change access.
This is local HTTP/fixture evidence, not actual Stripe delivery to the new
Production receiver. No runtime implementation change was required by these
additional cases; the replacement is still draft/undeployed.

Production negative checks against both savepulse.cloud and the direct Render
host `/api/v1/billing/webhook`: missing signature ->400
invalid_stripe_signature_header; old timestamp ->400
stripe_signature_timestamp_outside_tolerance; current timestamp with an invalid
HMAC ->400 invalid_stripe_signature. No signing secret was read or used, and
the invalid requests cannot create membership or payments. These checks prove
the existing deployed receiver rejects invalid requests; they do not prove a
valid Stripe signature, configured signing-secret match or lifecycle delivery.

Remaining before Live sales: staged acceptance of the replacement receiver,
actual signed provider delivery/retry verification, risk-event coverage, and
the separate lawful tax-document/FX workflow. Empty Live subscription inventory
has cleared the existing-paid-member migration concern at the audit time only.
