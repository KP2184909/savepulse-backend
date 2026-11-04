# Actual signed sandbox replay — 2026-11-03

Used Stripe SavePulse sandbox acct_1TbuPE0su7h1AsZT, not Live. In Workbench,
verified active destination we_1UVXZx0su7h1AsZTNnTXlvBq targets the isolated
savepulse-billing-sandbox/webhook function in project sktzydyiwqylpstxjicf.
No endpoint URL, signing credential or event selection was changed.

Clicked Resend for existing customer.subscription.deleted event
evt_1UW5i90su7h1AsZTlZ2Tg09K. Stripe's new delivery visibly reports Delivered,
HTTP200, received=true, updated=false, reason=duplicate_event (Dashboard time
Nov3 14:46:08; timezone is the Dashboard display, not asserted Bangkok time).
This is an actual Stripe-signed delivery, not a locally generated signature or
direct database fixture. It creates no new payment/subscription and does not
invoke the invoice-email path.

Read-only database verification after delivery: membership status=canceled,
processed event count remains16, cancellation event present=true. Thus replay
did not resurrect access or duplicate the processed event list.
Screenshot: /tmp/savepulse-live-qa/sandbox-signed-webhook-replay.png

Historical delivery overview showed39 attempts/17 failed before this resend.
Inspected an older failure evt_1UVmkg0su7h1AsZT1IKd5Q5t: HTTP409 with
billing_busy_retry. Another older event evt_1UVk5s0su7h1AsZTSBDcTXkz showed a
timeout. Their Resend controls were disabled at inspection. These historical
failures are not represented as resolved, nor is the success of this single
replay proof of all lifecycle/risk event types. Existing unit/HTTP concurrency
and retry tests remain separate evidence.

Production webhook replacement remains undeployed and new Live sales disabled.
This verifies the shared lifecycle in the deployed isolated Edge wrapper; it
does not prove the Render wrapper's Live signing-secret match or delivery.
