"use strict";
// Public Stripe IDs only. Applies solely to the verified SavePulse Live merchant.
// Keep the old Price available for existing paid subscriptions; never mutate it.
const ACCOUNT = "acct_1TbuP21NzGcGzIig";
const LEGACY_PRO = "price_1UXMsa1NzGcGzIigw2Yn8Rqb";
const CURRENT_PRO = "price_1UZjaa1NzGcGzIigiGeqlDMS";
function currentPriceId(env, plan) {
  const revision = { plus: 39, pro: 49, business: 69 }[plan];
  if (revision && env[`STRIPE_PRICE_${plan.toUpperCase()}_${revision}`]) return env[`STRIPE_PRICE_${plan.toUpperCase()}_${revision}`];
  const configured = env[`STRIPE_PRICE_${plan.toUpperCase()}`];
  // Old generic IDs are never silently repriced. Checkout validates amount.
  return configured;
}
function legacyProPriceId(env) {
  return env.STRIPE_EXPECTED_ACCOUNT_ID === ACCOUNT ? LEGACY_PRO : env.STRIPE_PRICE_PRO_LEGACY;
}
function legacyPrice(env, priceId, amount) {
  const priorAmounts = { plus: 500, pro: 3900, business: 5900 };
  for (const [plan, previousAmount] of Object.entries(priorAmounts)) {
    const configured = env[`STRIPE_PRICE_${plan.toUpperCase()}_PREVIOUS`] || env[`STRIPE_PRICE_${plan.toUpperCase()}`];
    if (configured && configured === priceId && amount === previousAmount) return plan;
  }
  if (priceId && priceId === legacyProPriceId(env) && amount === 1500) return "pro";
  if (env.STRIPE_EXPECTED_ACCOUNT_ID === ACCOUNT && priceId === CURRENT_PRO && amount === 3900) return "pro";
  return null;
}
module.exports = { currentPriceId, legacyProPriceId, legacyPrice };
