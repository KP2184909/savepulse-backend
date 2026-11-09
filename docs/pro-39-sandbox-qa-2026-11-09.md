# Pro USD39 sandbox QA — 9 November 2026

Scope: existing SavePulse organization, FreightPulse Sandbox project sktzydyiwqylpstxjicf, SavePulse billing only. Production checkout remains closed. No FreightPulse feed was enabled.

Created Stripe test Price price_1UZjiH0su7h1AsZTh9nUMnSi on existing Pro Product prod_Ub7N0mTSdmJ3dm. Verified account acct_1TbuPE0su7h1AsZT, livemode=false, USD3900 cents, monthly interval_count1, tax_behavior=inclusive. No test subscription or payment was created at this preparation stage. Old USD15 Price remains recognized for existing sandbox memberships.

Fixed the ESM packager to include and convert billingPriceRevision, introduced by PR15. Package build and generated module syntax checks pass. Local regression suite:187/187 PASS.

Deployed savepulse-billing-sandbox version27 ACTIVE, retaining verify_jwt=false and the existing independent identity/worker/signature checks. The project/test-key guard and single allowed QA mailbox remain unchanged. v26 briefly used Preview15 as return URL; inspection showed membership sandbox routing is explicitly limited to Preview10, so v27 restored Preview10 before starting checkout.

| Check | Result | Evidence |
|---|---|---|
| Local shared lifecycle regression | PASS |187 tests; includes failed renewal, cancellation, legacy USD15 access, exact merchant price binding |
| ESM package | PASS |build command and node syntax checks for lifecycle/revision modules |
| Deployed readiness | PASS |HTTP200; mode=test, isolated=true, configured=true, webhookConfigured=true, liveSales=false |
| Deployed catalog | PASS |HTTP200; Plus5 / Pro39 / Business59; domestic billing details required |
| Preview10 UI after API completion | PASS |Pro USD39/month; sandbox demonstration; Test Pro checkout disabled pending identity |
| Fresh email verification | IN PROGRESS |One code requested only for savepulse.cloud@gmail.com; owner must enter OTP in the browser |
| New USD39 sandbox payment/renewal/failure/cancel | NOT VERIFIED |No new payment completed yet; prior USD15 evidence/local fixtures do not establish this |
| USD39 test tax document/email | NOT VERIFIED |Must verify actual source invoice, FX policy and delivery after test payment |
| Production paid purchase | NOT VERIFIED / not attempted |No real money authorized for QA; sales gates remain closed |

No secrets, OTPs, private bindings or customer lists are included here. The only email requested during preparation was the authorized mailbox verification code. No marketing or customer email batch was sent.
