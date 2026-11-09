# Approved pricing revision — 9 November 2026

Owner approved USD5 / USD39 / USD59 per month, retaining VAT-inclusive displayed totals and existing sales gates. This is a price change only, not a new feature entitlement or approval to open Live sales. The no-card 14-day trial remains separate and never automatically bills.

Live Pro Product: prod_Ub7N0mTSdmJ3dm.
New USD39 monthly Price: price_1UZjaa1NzGcGzIigiGeqlDMS.
Lookup key: savepulse_pro_usd_39_monthly_20261109.
The old USD15 Price price_1UXMsa1NzGcGzIigw2Yn8Rqb remains available for existing subscriptions. No subscription was migrated, paid, or canceled. Existing manual inclusive tax handling remains required; creation of the Price alone does not configure tax collection or prove tax compliance.

The server's public-ID revision adapter upgrades only the exact old Pro price configuration on the verified SavePulse Live merchant. Other merchants, fixture prices, and future explicit Price IDs are unchanged. Legacy USD15 is accepted for previously bound subscription status/events only, not for new checkout. This keeps the deployed environment compatible without touching any credential.

Validation: 187 tests pass, including exact merchant scoping, protection for a future explicit price, authenticated checkout lifecycle and legacy USD15 paid access. Homepage EN/TH fallback copy and server plan metadata use USD39. USD5 and USD59 are unchanged; legacy THB price objects are unchanged.

Historical documentation describes earlier price revisions and is not rewritten. The isolated deployed billing sandbox remains a separate test environment; do not describe mock tests as a new completed Stripe sandbox payment or Production purchase.
