# SavePulse Live configuration verification — 2026-11-03

Chrome native control recovered after resetting the computer-use session. The
IAB adapter failure did not require rotating credentials or reconnecting Stripe.

Verified Render service `srv-d7u3efpj2pic739fm8kg`, repository
KP2184909/savepulse-backend, branch main, release37a8f71. Applied non-secret
mapping from ops/savepulse-live-prepared.env.example: expected merchant, manual
TH VAT rate, approved USD Price IDs, and explicitly disabled V2/live approval,
tax-policy approval, Business and public-checkout switches. No secret changed.

First server-side preflight found old THB Price IDs were still saved: entering
replacement values while the existing fields were masked did not replace them.
Revealed only the non-secret Price ID values, replaced them, read back each exact
USD ID before saving, and verified all three against Stripe from Render.

The Portal UI's previously displayed checked defaults had not produced a saved
configuration. Saved invoice history, payment-method updates and cancellation
at period end. Created Live configuration
`bpc_1UXamz1NzGcGzIigha7yZWLp`; public Portal login link remains inactive.
Server-side GET validation subsequently passed. Prior UI-only statements about
saved Portal readiness were insufficient and are superseded by this evidence.

To run the existing read-only preflight with credentials kept inside Render,
temporarily used build command:
`npm install && (node tools/check-billing-live.js || true)`.
The subshell allows an incomplete readiness report without masking npm install
failure. No charge, subscription, Checkout Session, secret export or paid
service was created. Original build command `npm install` was restored after
the checks. The only deployed code remains read-only PR11 release37a8f71;
draft PR10's replacement payment/risk/tax handlers remain undeployed.

Actual Live GET report in Render build logs, 2026-11-03 13:03:29 Bangkok:

| Check | Result |
|---|---|
| Live account configuration | PASS |
| Merchant account identity and enabled charges | PASS |
| Plus USD5/month | PASS |
| Pro USD15/month | PASS |
| Business USD59/month | PASS (resource only; sales remain disabled) |
| Domestic TH7% inclusive manual VAT | PASS |
| Default Portal invoice/card/cancel-at-period-end settings | PASS |
| Required13 webhook events | FAIL — Live has10 lifecycle events; risk receiver not deployed |

Report ready=false, scope=configuration_only is the correct outcome. It does
not verify the secret by a signed Live delivery, legal tax issuance, FX
exceptions, customer fulfillment or Production paid E2E. Do not add the3 risk
subscriptions before deploying and verifying the intended receiver/worker.

Post-config public checks: trial/readiness returns ready=true,
database=verified, emailConfigured=true, release37a8f71, autoRenew=false.
Pro checkout for the authorized test mailbox returns configured=false,
provider=disabled, url=null, reason=public_checkout_disabled. No customer email
was sent. The existing build log reports one high-severity dependency advisory;
it is not a passed dependency security audit and needs triage before launch.

Next: review the closed-sales replacement-billing rollout and existing-member
migration, deploy/test risk operations before adding event coverage, resolve
tax issuance/FX special cases, and run full membership/Portal acceptance QA.
RD approval remains pending as last reported by the owner. Foreign/mixed-use
checkout and Business procurement sales remain closed.
