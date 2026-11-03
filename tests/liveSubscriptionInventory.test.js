"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { inspectLiveSubscriptions, createInventoryReader } = require("../src/liveSubscriptionInventory");
const env = { STRIPE_SECRET_KEY: "rk_live_fixture", STRIPE_EXPECTED_ACCOUNT_ID: "acct_fixture", APP_BASE_URL: "https://savepulse.cloud" };
test("only a completed empty provider list proves zero subscriptions", async () => {
  const report = await inspectLiveSubscriptions({ env, get: async route => route === "/account" ? { id: "acct_fixture" } : { data: [], has_more: false } });
  assert.equal(report.complete, true); assert.equal(report.total, 0); assert.equal(report.migrationReviewRequired, false);
  assert.equal(report.scope, "subscription_inventory_only");
});
test("inventory verifies Live merchant before reading subscriptions", async () => {
  let calls = 0;
  const get = async () => { calls++; return { id: "acct_other" }; };
  assert.equal((await inspectLiveSubscriptions({ env: { ...env, STRIPE_SECRET_KEY: "rk_test_fixture" }, get })).complete, false);
  assert.equal(calls, 0);
  assert.equal((await inspectLiveSubscriptions({ env, get })).reason, "merchant_account_mismatch");
  assert.equal(calls, 1);
});
test("inventory reads all statuses and pages but emits only counts", async () => {
  const queries = [];
  const report = await inspectLiveSubscriptions({ env, get: async (route, query) => {
    if (route === "/account") return { id: "acct_fixture" };
    queries.push(query); assert.equal(query.status, "all");
    return query.starting_after ? { data: [{ id: "sub_two", livemode: true, status: "canceled", customer: "private" }], has_more: false } :
      { data: [{ id: "sub_one", livemode: true, status: "active", customer_email: "private@example.invalid" }], has_more: true };
  } });
  assert.equal(queries[1].starting_after, "sub_one");
  assert.deepEqual(report.statuses, { active: 1, canceled: 1 });
  assert.equal(report.complete, true); assert.equal(report.total, 2); assert.equal(report.migrationReviewRequired, true);
  assert.ok(!JSON.stringify(report).includes("private")); assert.ok(!JSON.stringify(report).includes("sub_one"));
});
test("incomplete, duplicated or mixed-mode pages never imply zero members", async () => {
  for (const page of [{ data: [], has_more: true }, { data: [{ id: "sub_one", livemode: false }], has_more: false }, { data: [{ id: "sub_one", livemode: true }, { id: "sub_one", livemode: true }], has_more: false }]) {
    const report = await inspectLiveSubscriptions({ env, get: async route => route === "/account" ? { id: "acct_fixture" } : page });
    assert.equal(report.complete, false); assert.equal(report.total, undefined);
  }
  const get = createInventoryReader(env, async () => { throw Error("private provider details"); });
  await assert.rejects(get("/customers"), /read_not_allowed/);
  const report = await inspectLiveSubscriptions({ env, get });
  assert.ok(!JSON.stringify(report).includes("private")); assert.equal(report.complete, false);
});
