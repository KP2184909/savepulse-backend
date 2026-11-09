# Pro USD39 sandbox QA — 9 November 2026

Scope: existing SavePulse organization, FreightPulse Sandbox project sktzydyiwqylpstxjicf, SavePulse billing only. Production checkout remains closed. No FreightPulse feed was enabled.

Created Stripe test Price price_1UZjiH0su7h1AsZTh9nUMnSi on existing Pro Product prod_Ub7N0mTSdmJ3dm. Verified account acct_1TbuPE0su7h1AsZT, livemode=false, USD3900 cents, monthly interval_count1, tax_behavior=inclusive. Preparation initially created no payment. Subsequent authorized browser QA completed a Stripe test-card payment for USD39; no real money was charged. Old USD15 Price remains recognized for existing sandbox memberships.

Fixed the ESM packager to include and convert billingPriceRevision, introduced by PR15. Package build and generated module syntax checks pass. Local regression suite:187/187 PASS.

Deployed savepulse-billing-sandbox version27 ACTIVE, retaining verify_jwt=false and the existing independent identity/worker/signature checks. The project/test-key guard and single allowed QA mailbox remain unchanged. v26 briefly used Preview15 as return URL; inspection showed membership sandbox routing is explicitly limited to Preview10, so v27 restored Preview10 before starting checkout.

| Check | Result | Evidence |
|---|---|---|
| Local shared lifecycle regression | PASS |187 tests; includes failed renewal, cancellation, legacy USD15 access, exact merchant price binding |
| ESM package | PASS |build command and node syntax checks for lifecycle/revision modules |
| Deployed readiness | PASS |HTTP200; mode=test, isolated=true, configured=true, webhookConfigured=true, liveSales=false |
| Deployed catalog | PASS |HTTP200; Plus5 / Pro39 / Business59; domestic billing details required |
| Preview10 UI after API completion | PASS |Pro USD39/month; sandbox demonstration; Test Pro checkout disabled pending identity |
| Fresh email verification | PASS |Owner entered OTP in Preview10; authenticated checkout succeeded |
| New USD39 sandbox payment | PASS |Stripe Checkout livemode=false, USD3900 total; invoice in_1UZjs20su7h1AsZTVDyLMWqW paid; subscription sub_1UZjs40su7h1AsZTYfQm1wmA active |
| Pro entitlement after reload | PASS |Preview10 server-confirmed pro/active through 9 December 2026; repeat checkout disabled |
| USD39 renewal/failure | NOT VERIFIED |New price has not yet completed a successful renewal/payment-failure cycle. The completed clock test below establishes cancellation expiry only. |
| End of canceled period | PASS |Stripe Dashboard simulation advanced this QA customer to 2026-12-09 15:06 UTC; subscription canceled. Signed event processed by sandbox queue (HTTP200, processed1, emailsSent0). Preview10 shows free/canceled. No Production time or real customer expiry changed. |
| USD39 portal cancellation | PASS |Portal cancellation accepted; webhook queue processed; Preview10 shows Renewal off (cancellation scheduled), Pro retained through 9 December. Stripe may use cancel_at rather than cancel_at_period_end; UI handles both. |
| USD39 test tax document | PASS |TEST-SP-TI-202611-000001, source invoice above; BOT 2026-11-06 USD/THB33.3142; THB1214.25 net +85.00 VAT =1299.25; TEST ONLY |
| Test tax email | PASS |Gmail authorized mailbox INBOX contains subject [TEST] SavePulse tax document TEST-SP-TI-202611-000001, received 2026-11-09 04:09:17 UTC |
| Repeated tax-document request | PASS |Second browser request returned the same TEST-SP-TI-202611-000001; source job remains one issued entry; Gmail exact-subject search still returns only one message |
| Production paid purchase | NOT VERIFIED / not attempted |No real money authorized for QA; sales gates remain closed |

No secrets, OTPs, private bindings or customer lists are included here. The only email requested during preparation was the authorized mailbox verification code. No marketing or customer email batch was sent.

Browser proof captured locally: pro-active-after-reload.png, tax-document-39.png, cancellation-confirmed.png in /tmp/savepulse-sandbox39-qa. Manual queue-only drain returned HTTP200 processed1 and emailsSent0. A prior attempt used pg_net default5s and timed out; bounded60s invocation succeeded.

## Continuation constraints after the cancellation simulation

Stripe has moved this QA customer's simulated time to 9 December 2026. Do not treat new invoices from that future clock as current-time payments, alter Production clocks, or clear membership/binding history to force a renewal pass. Successful renewal and failed-renewal QA need a separate controlled simulation with the application's injected test time aligned to the verified Stripe test clock. The shared lifecycle already accepts an injected `now`; the deployed sandbox currently uses real wall time, so future invoice period checks must remain strict until that isolated test path is implemented and reviewed.

References: https://docs.stripe.com/billing/testing (test clocks, subscription lifecycle tests, and distinction between synthetic events and full lifecycle).
