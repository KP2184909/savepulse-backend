# Revised price sandbox QA — 10 November 2026

The revised-price billing lifecycle was verified in the isolated Stripe sandbox. This file does not approve Live sales, data-use rights or e-Tax issuance.

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
- Retried that same invoice with the original successful test payment method: paid3900, inclusive VAT255 cents, net3645. Browser refresh confirmed Plus/active through 2027-02-10. Customer Portal showed card management and paid invoice history, accepted cancellation effective 2027-02-10; advancing only the test clock past that date produced canceled/Free in the browser. Cancellation used cancel_at, not merely cancel_at_period_end. No additional renewal invoice was charged at cancellation.

## Pro actual sandbox observations

- Hosted Checkout cs_test_a1bjJbTMmgZuh7MaGapR0AkQOrIEQopsLwa2brTHS2KcKv5Wjps9zfavmm completed with public test card. Subscription sub_1Ua6LT0su7h1AsZTS66x70JE; initial invoice in_1Ua6LR0su7h1AsZTd3cpvVbP paid4900 cents.
- Clock clock_1Ua6EB0su7h1AsZTM3moxEJg, customer cus_VbIpiPC3PYrXRX. Browser returned Pro/active and retained it after reload.
- Renewal invoice in_1Ua6M70su7h1AsZTFufQoUuL paid4900; browser refresh extended access through 2027-01-10.
- Next invoice in_1Ua6Mp0su7h1AsZTdz2f27oG declined (paid0/due4900), status past_due; browser showed Free and retained only the previously paid period.
- Retried the same invoice with the original successful test payment method: paid4900, net4579, inclusive VAT321 cents. Browser returned Pro/active through 2027-02-10.
- Set cancel_at_period_end=true through the Stripe sandbox API, confirmed cancel_at=1802232010, then advanced only this test clock past the paid period. Stripe and browser both confirmed canceled/Free, with no additional renewal invoice. Portal cancellation itself was verified separately with Plus.

## Business actual sandbox observations

- Hosted Checkout cs_test_a1G8i7Y2ELqw3bg7FfPoBF7nSmRiCLe6iF7i1BTOhEhKolpCem7oH9yi6M completed with public test card. Subscription sub_1Ua6Ps0su7h1AsZTVdVFb7I0; initial invoice in_1Ua6Pq0su7h1AsZTCoFTQSLm paid6900 cents.
- Clock clock_1Ua6ED0su7h1AsZTEQneEIWc, customer cus_VbIpQENdVo41Su. Browser confirmed Business/active after returning and reloading.
- Renewal invoice in_1Ua6Qa0su7h1AsZTQPFdpv4t paid6900; browser refresh extended access through 2027-01-10.
- Next invoice in_1Ua6RN0su7h1AsZTfWOF71B3 declined (paid0/due6900), status past_due; browser confirmed Free with no paid-period extension.
- Retried that same invoice with the original successful test payment method: paid6900, net6449, inclusive VAT451 cents. Browser confirmed Business/active through 2027-02-10.
- Set cancel_at_period_end=true using the Stripe sandbox API, confirmed cancel_at=1802232013, then advanced only this test clock past that date. Stripe and browser confirmed canceled/Free. Latest invoice remained the recovered invoice; no new renewal charge was created. A concurrent webhook worker briefly returned the retryable membership-action message; retry after the worker finished returned authoritative canceled/Free.

## Result matrix and procedure

Test UI: https://deploy-preview-10--astounding-fenglisu-0ff097.netlify.app/membership/

For each plan: verify the authorized test email, submit fake Thailand billing details, complete hosted Stripe Checkout with its public test card, reload the app, advance only its bound Stripe test clock past the renewal date, simulate a declined card, refresh after API completion, retry the same invoice, then cancel renewal and advance beyond the paid period. No real customer dates or clocks were modified.

| Check | Plus39 | Pro49 | Business69 |
|---|---|---|---|
| Hosted signup / correct monthly USD total | PASS | PASS | PASS |
| Entitlement after return and reload | PASS | PASS | PASS |
| Monthly renewal paid at revised price | PASS | PASS | PASS |
| App paid-period extension after renewal | NOT VERIFIED separately | PASS | PASS |
| Failed renewal: no payment / app Free | PASS | PASS | PASS |
| Same invoice recovery / app access restored | PASS | PASS | PASS |
| End-of-period cancellation / app Free | PASS (Portal) | PASS (API) | PASS (API) |

Portal card management and invoice history were inspected during Plus cancellation. No claim is made that a card was changed through Portal. Subscription entitlement here verifies billing status; it does not establish that Business procurement features are commercially ready.

Screenshots were saved locally under /tmp/savepulse-revised-price-qa/ (active, renewal, failure, recovery and expiration states). They contain only the authorized QA identity and fake billing details; credentials were not captured or committed.

Production read-only check: https://savepulse.cloud/api/v1/billing/catalog returned HTTP200, enabled=false and plans=[] on 2026-11-10. Production frontend/backend and Live Stripe configuration were not deployed or modified by this QA run.

## Webhook processing and cleanup

All 48 webhook inbox entries for these three subscriptions (16 each) reached processed. The worker uses verified signatures, durable event-ID deduplication, leases and authoritative subscription reconciliation. Duplicate-delivery and ordering protection are covered by automated tests; provider-triggered duplicate delivery was not separately exercised in this run.

The sandbox still retains an intentional older manual-review failure fixture (evt_queue_failure_qa_20261103 / sub_queue_missing_qa_20261103, 20 attempts), so the full historical sandbox queue must not be described as globally healthy. It is unrelated to these three completed subscriptions.

After the final subscription was confirmed canceled, the authenticated worker finishClockScenario operation returned HTTP200, simulation=false, emailsSent=0. Test clocks and invoices remain as audit evidence. Tax document generation and email delivery were disabled for simulated future invoices, and the production clock was never modified.

## Local verification

198 automated tests pass including price revisions, old-member preservation, lost-response/open-checkout handling, source-mode isolation, request-local clock context and resubscription reconciliation. Generated ESM modules build successfully. These are local tests, distinct from provider/browser evidence above.
