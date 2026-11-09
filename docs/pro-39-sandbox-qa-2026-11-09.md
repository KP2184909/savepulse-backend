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
| USD39 monthly renewal | PASS |Dedicated clock clock_1UZudl0su7h1AsZTc4yPfKN8; customer cus_Vb6rpnHG3fNEWx; subscription sub_1UZuh80su7h1AsZToObZM15H. Renewal invoice in_1UZui90su7h1AsZTcMu9zmHK: subscription_cycle, amount_paid3900. Server paidUntil advanced to1799509069. |
| USD39 failed renewal | PASS |Invoice in_1UZujx0su7h1AsZTqhqS5L1A: attempted=true, amount_due3900, amount_paid0; Stripe past_due. Signed queue processed4; server paidUntil remained1799509069; Preview10 free/past_due. |
| Recovery after failed payment | PASS |Same failed invoice paid using a successful predefined test card; amount_paid3900. Server active/paidUntil1802187469; Preview10 pro/active through9February2027. |
| End of canceled period | PASS |Stripe Dashboard simulation advanced this QA customer to 2026-12-09 15:06 UTC; subscription canceled. Signed event processed by sandbox queue (HTTP200, processed1, emailsSent0). Preview10 shows free/canceled. No Production time or real customer expiry changed. |
| USD39 portal cancellation | PASS |Portal cancellation accepted; webhook queue processed; Preview10 shows Renewal off (cancellation scheduled), Pro retained through 9 December. Stripe may use cancel_at rather than cancel_at_period_end; UI handles both. |
| USD39 test tax document | PASS |TEST-SP-TI-202611-000001, source invoice above; BOT 2026-11-06 USD/THB33.3142; THB1214.25 net +85.00 VAT =1299.25; TEST ONLY |
| Test tax email | PASS |Gmail authorized mailbox INBOX contains subject [TEST] SavePulse tax document TEST-SP-TI-202611-000001, received 2026-11-09 04:09:17 UTC |
| Repeated tax-document request | PASS |Second browser request returned the same TEST-SP-TI-202611-000001; source job remains one issued entry; Gmail exact-subject search still returns only one message |
| Production paid purchase | NOT VERIFIED / not attempted |No real money authorized for QA; sales gates remain closed |

No secrets, OTPs, private bindings or customer lists are included here. The only email requested during preparation was the authorized mailbox verification code. No marketing or customer email batch was sent.

Browser proof captured locally: pro-active-after-reload.png, tax-document-39.png, cancellation-confirmed.png in /tmp/savepulse-sandbox39-qa. Manual queue-only drain returned HTTP200 processed1 and emailsSent0. A prior attempt used pg_net default5s and timed out; bounded60s invocation succeeded.

## Controlled renewal simulation

Added test-only clock adapter using AsyncLocalStorage so overlapping requests cannot share the wrong clock. It checks exact Supabase project, Stripe account, test key, authorized QA email, customer-to-clock binding, ready state and a bounded time range. Production does not import the adapter and provider clock routes default off. Explicit opt-in still rejects Live keys, other projects and DELETE routes. Existing membership/binding history is retained.

Preparation uses a protected existing worker endpoint. Clock-aware Checkout substitutes only its verified test customer, preserves server session bindings and uses customer_update name/address=auto for Stripe Tax ID collection. Failed HTTP400 pre-execution checkout was inspected and corrected before retrying. No real payment, card, credential or Production clock was used.

Simulation invoices cannot generate tax documents/email. Automatic tax recovery skips test-clock subscriptions, and manual/ledger paths reject simulated invoices. During clock advancement the application fails closed until Stripe says ready. A final cancellation was scheduled and the clock advanced to10February2027; Stripe confirmed canceled. Cleanup completed: queued deletion reconciled, membership canceled, worker finish returned HTTP200/simulation=false/emailsSent0 and persisted enabled=false, retaining audit identifiers. Deployed sandbox function version31 ACTIVE. Production was not deployed by this work.

Validation:193/193 local tests PASS, including project/Live guards, request concurrency, customer isolation, provider route opt-in and suspension. Actual sandbox results above are separate from those local fixtures. Production paid checkout remains disabled; no claim of Live lifecycle QA.

References: https://docs.stripe.com/billing/testing and https://docs.stripe.com/testing (test clocks, full lifecycle versus synthetic events, predefined test cards).
