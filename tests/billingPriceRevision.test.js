"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { currentPriceId } = require("../src/billingPriceRevision");
test("approved Pro price replacement is scoped to the exact merchant and old price", () => {
  const env = { STRIPE_EXPECTED_ACCOUNT_ID: "acct_1TbuP21NzGcGzIig", STRIPE_PRICE_PRO: "price_1UXMsa1NzGcGzIigw2Yn8Rqb" };
  assert.equal(currentPriceId(env, "pro"), "price_1UZjaa1NzGcGzIigiGeqlDMS");
  assert.equal(currentPriceId({ ...env, STRIPE_EXPECTED_ACCOUNT_ID: "acct_other" }, "pro"), env.STRIPE_PRICE_PRO);
  assert.equal(currentPriceId({ ...env, STRIPE_PRICE_PRO: "price_explicit_future" }, "pro"), "price_explicit_future");
});
