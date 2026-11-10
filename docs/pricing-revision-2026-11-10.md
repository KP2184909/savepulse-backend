# USD 39 / 49 / 69 revision — 10 November 2026

Owner-approved monthly VAT-inclusive totals for new signup: Plus USD39, Pro USD49, Business USD69. Existing subscribers must not be repriced. This branch is preparation, not a Production launch or permission to sell market data.

## Code changes and validation

- Public plan metadata and verified checkout catalog expect USD3900/4900/6900 cents.
- New explicit configuration: STRIPE_PRICE_PLUS_39, STRIPE_PRICE_PRO_49, STRIPE_PRICE_BUSINESS_69. These are public Stripe Price IDs, not API keys. Stripe account, mode, amount, USD currency and monthly interval checks remain in force.
- Generic STRIPE_PRICE_PLUS/PRO/BUSINESS may remain on old IDs while the explicit revised IDs are introduced. If replacing generic values, preserve old IDs in STRIPE_PRICE_PLUS_PREVIOUS / STRIPE_PRICE_PRO_PREVIOUS / STRIPE_PRICE_BUSINESS_PREVIOUS. The expected old amounts are USD5/39/59. The existing merchant-scoped Pro USD15 and USD39 known IDs remain recognized for reconciliations only.
- No subscription update API is called. Existing bound subscriptions still reconcile through payment, portal and cancellation. New checkout cannot use a previous amount.
- An old open checkout is expired before a new-price replacement. If an old checkout's creation response was lost, request review rather than replaying an old-price payment opportunity blindly.
- USD tax calculations remain inclusive; legacy THB catalog values are not converted or changed. Current domestic tax restrictions and Live gates remain closed.
- 191 local automated tests passed, including HTTP checkout/webhook/reload, old membership lifecycle and checkout price revision races. This branch does not include the separate source-freshness PR18 or sandbox-clock PR16 tests.

## Deployment order still required

1. Create NEW recurring monthly inclusive-tax Price objects in the correct Stripe sandbox; never edit, delete or deactivate existing subscription Prices for this change.
2. Configure explicit revised IDs and preserved old IDs in the isolated backend. Review any outstanding checkouts before switching. Do not expose keys in logs or repository.
3. Run actual sandbox USD39/49/69 signup, signed webhook, reload, renewal, failed payment, recovery and portal cancellation. Verify tax documents against actual paid totals and roundings. Prior Pro USD39 evidence does not prove the new Pro USD49.
4. Coordinate frontend and backend deployment so public price metadata matches the configured billing catalog. Homepage normal rendering reads /api/v1/plans; stale fallback copy and the draft scope page in PR17 must also be updated before release.
5. Independently resolve source-data permissions, calendar-aware freshness, service delivery scope, e-Tax activation/issuance and Live preflight before opening paid sales. These changes do not make Business features complete.

No real customer payments, email, Stripe settings, database records or Production deployments were changed for this branch.
