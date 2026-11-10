# Revised price sandbox QA — 10 November 2026

In progress. This file does not approve Live sales, data-use rights or e-Tax issuance.

Stripe account verified through connector: acct_1TbuPE0su7h1AsZT, SavePulse sandbox, livemode=false. Supabase isolated project: sktzydyiwqylpstxjicf. Backend savepulse-billing-sandbox v33; Production unchanged.

## New recurring monthly inclusive-tax Prices

| Plan | USD gross | Price |
|---|---:|---|
|Plus|39|price_1Ua66o0su7h1AsZTRjXvF6DR|
|Pro|49|price_1Ua66p0su7h1AsZTCWae8nkJ|
|Business|69|price_1Ua66q0su7h1AsZTrHBnCxBd|

Old Prices remain active. No subscription migration, price mutation or Live setting change.

## Plus actual sandbox observations

- Hosted checkout cs_test_a1JfiFTL61JHo8SllrX2r7cgxN9O194HnVc8oVq9SIJ0B1zg55UKB0XrZr completed using Stripe public test card; subscription sub_1Ua6B80su7h1AsZTQXrlcxKI; initial invoice in_1Ua6B60su7h1AsZTOUQsJGRH paid3900 cents.
- Bound clock clock_1Ua68f0su7h1AsZTlQjQGtMs and customer cus_VbIkB2LeiQIyve are test only. Only savepulse.cloud@gmail.com used.
- Browser returned Plus/active and preserved it after reload. Found and fixed reconciliation of a new completed checkout after a previously canceled membership, so status refresh need not wait for webhook processing.
- Clock monthly renewal invoice in_1Ua6D70su7h1AsZThVQuMPYK: subscription_cycle, paid3900 cents. Stripe payment verified; the app was not refreshed between this renewal and the next failure, so do not claim separate post-renewal UI proof.
- Stripe test decline source produced next invoice in_1Ua6E00su7h1AsZTRGmHOIz2 open, amount_paid0, subscription past_due. Browser correctly showed Free/past_due without paid-period extension.
- Retried that same invoice with the original successful test payment method: paid3900, inclusive VAT255 cents, net3645. Recovery UI and cancellation still pending at this checkpoint.

## Local verification

198 automated tests pass including price revisions, old-member preservation, lost-response/open-checkout handling, source-mode isolation, request-local clock context and resubscription reconciliation. Generated ESM modules build successfully. These are local tests, distinct from provider/browser evidence above.
