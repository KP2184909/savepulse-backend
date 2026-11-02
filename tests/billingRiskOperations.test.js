"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { createBillingRiskOperations } = require("../src/billingRiskOperations");
const { createTrialStore } = require("../src/trialLifecycle");
test("risk worker resumes persisted tasks, isolates failures and exposes only review status", async () => {
  const rows = new Map(); let reads = 0;
  const store = {
    insert: async (key, value) => { if (rows.has(key)) return false; rows.set(key, value); return true; },
    get: async key => rows.get(key),
    cas: async (key, version, value) => { if (rows.get(key).version !== version) return false; rows.set(key, value); return true; },
    billingRiskRows: async () => [...rows].map(([key, value]) => ({ key, ...value }))
  };
  const env = { BILLING_V2_ENABLED: "true", STRIPE_SECRET_KEY: "rk_test_fixture", STRIPE_EXPECTED_ACCOUNT_ID: "acct_fixture" };
  const stripe = async (method, route) => {
    assert.equal(method, "GET"); reads++;
    if (route === "/account") return { id: "acct_fixture" };
    if (route === "/charges/ch_fixture") return { id: "ch_fixture", livemode: false, customer: "cus_private", payment_intent: "pi_fixture" };
    if (route === "/invoice_payments") return { data: [{ status: "paid", payment: { type: "payment_intent", payment_intent: "pi_fixture" }, invoice: "in_fixture" }], has_more: false };
    throw Error("private provider error");
  };
  const options = { store, stripe, env, invoiceSource: async () => ({ payment: { id: "in_fixture", livemode: false, status: "paid", customer: "cus_private", amount_paid: 500, currency: "usd", parent: { type: "subscription_details" } } }) };
  const first = createBillingRiskOperations(options);
  await first.receive({ id: "evt_fixture", type: "charge.refunded", livemode: false, data: { object: { id: "ch_fixture" } } });
  const restarted = createBillingRiskOperations(options);
  assert.equal((await restarted.tick()).processed, 1);
  assert.equal((await restarted.tick()).processed, 0);
  const report = await restarted.summary();
  assert.equal(report.tasks[0].state, "verified_review_required");
  assert.equal(report.tasks[0].entitlementChanged, false);
  assert.equal(report.tasks[0].creditNoteCreated, false);
  assert.ok(!JSON.stringify(report).includes("private"));
  assert.equal(reads, 3);
  assert.equal(createBillingRiskOperations({ ...options, env: { ...env, BILLING_V2_ENABLED: "false" } }), null);
});
test("database query bounds pending risk work and excludes future retries from the batch", async () => {
  const queries = [];
  const store = createTrialStore({ SUPABASE_URL: "https://db.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture" }, async url => {
    queries.push(new URL(url)); return Response.json([]);
  });
  await store.billingRiskRows("live", "acct_fixture", true);
  const query = queries[0].searchParams;
  assert.equal(query.get("key"), "like.billing-risk:v1:live:acct_fixture:*");
  assert.equal(query.get("value->>state"), "eq.pending_review");
  assert.match(query.get("or"), /nextAttemptAt\.is\.null.*nextAttemptAt\.lte\.\d+/);
  assert.equal(query.get("limit"), "10");
  await store.billingRiskRows("live", "acct_fixture", false);
  assert.equal(queries[1].searchParams.get("limit"), "100");
  await assert.rejects(store.billingRiskRows("live", "acct_bad:*", true), /configuration_invalid/);
  assert.equal(queries.length, 2);
});
