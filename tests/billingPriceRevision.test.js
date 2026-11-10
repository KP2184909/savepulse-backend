"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { currentPriceId, legacyPrice } = require("../src/billingPriceRevision");
test("new signup uses explicit revised IDs without silently rewriting existing prices", () => {
  const env = { STRIPE_EXPECTED_ACCOUNT_ID: "acct_1TbuP21NzGcGzIig", STRIPE_PRICE_PRO: "price_1UXMsa1NzGcGzIigw2Yn8Rqb" };
  assert.equal(currentPriceId(env, "pro"), env.STRIPE_PRICE_PRO);
  assert.equal(currentPriceId({ ...env, STRIPE_EXPECTED_ACCOUNT_ID: "acct_other" }, "pro"), env.STRIPE_PRICE_PRO);
  assert.equal(currentPriceId({ ...env, STRIPE_PRICE_PRO: "price_explicit_future" }, "pro"), "price_explicit_future");
  for (const [plan, amount] of Object.entries({ plus: 39, pro: 49, business: 69 })) {
    assert.equal(currentPriceId({ ...env, [`STRIPE_PRICE_${plan.toUpperCase()}_${amount}`]: `price_new_${plan}` }, plan), `price_new_${plan}`);
  }
  assert.equal(legacyPrice(env, env.STRIPE_PRICE_PRO, 1500), "pro");
  assert.equal(legacyPrice(env, "price_1UZjaa1NzGcGzIigiGeqlDMS", 3900), "pro");
  assert.equal(legacyPrice({ ...env, STRIPE_EXPECTED_ACCOUNT_ID: "acct_other" }, "price_1UZjaa1NzGcGzIigiGeqlDMS", 3900), null);
  assert.equal(legacyPrice(env, env.STRIPE_PRICE_PRO, 1), null);
});
