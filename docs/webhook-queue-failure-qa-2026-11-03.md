# Deployed queue failure acceptance — isolated sandbox v23

Injected two explicitly labeled queue fixtures in sktzydyiwqylpstxjicf only.
These are NOT signed Stripe deliveries; actual signed ingress is evidenced
separately in webhook-queue-sandbox-qa-2026-11-03.md. No production rows, clocks,
expiration dates or credentials were changed.

1. Missing test subscription reference: queue row9533e33d… was pending with
   attempts0. Authenticated queue-only worker request538 returned200 and left
   this row pending/attempts1, lastError=billing_event_processing_retry, with a
   future nextAttemptAt. No provider payload leaked into its error field.
2. Immediate worker request539 returned processed0, attempts stayed1, proving
   the deployed due-row query respects backoff.
3. On this labeled fixture only, set attempts19 and nextAttemptAt0 to test the
   final-attempt boundary without20 provider calls. Request541 made the next
   real failed provider lookup and persisted attempts20/manual_review_required.
   This is a boundary setup, not evidence of20 actual provider attempts.
4. An expired-working fixture82533d3d… referencing the authorized mailbox's
   canceled test subscription was recovered and marked processed by request538.
   Membership stayed canceled. The fixture added only its test event ID to the
   sandbox lifecycle ledger; no charge/subscription creation or email delivery.

All inspected worker responses were HTTP200/emailsSent0. Initial malformed SQL
insert failed atomically and created no fixture; request537 before successful
insertion was not counted as failure QA. Subsequent insertion and readback
confirmed both fixtures before testing. Retained the labeled fixture records
for audit; the failed one is intentionally in manual review, not silently lost.

This verifies deployed failure retention/backoff/review and crash recovery.
Automatic queue health reporting/alerts and the separate Render rollout remain
outstanding. Production queue and paid checkout are still disabled. Existing
automated suite remains181/181; no code changes were made in this QA step.
