"use strict";
// Public Stripe IDs only. Applies solely to the verified SavePulse Live merchant.
// Keep the old Price available for existing paid subscriptions; never mutate it.
const ACCOUNT = "acct_1TbuP21NzGcGzIig";
const LEGACY_PRO = "price_1UXMsa1NzGcGzIigw2Yn8Rqb";
const CURRENT_PRO = "price_1UZjaa1NzGcGzIigiGeqlDMS";
function currentPriceId(env, plan) {
  const configured = env[`STRIPE_PRICE_${plan.toUpperCase()}`];
  return plan === "pro" && env.STRIPE_EXPECTED_ACCOUNT_ID === ACCOUNT && configured === LEGACY_PRO ? CURRENT_PRO : configured;
}
function legacyProPriceId(env) {
  return env.STRIPE_EXPECTED_ACCOUNT_ID === ACCOUNT ? LEGACY_PRO : env.STRIPE_PRICE_PRO_LEGACY;
}
module.exports = { currentPriceId, legacyProPriceId };
