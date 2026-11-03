"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { inspectLiveBilling, REQUIRED_EVENTS } = require("../src/billingLivePreflight");
const EVENTS = REQUIRED_EVENTS.slice(0,10), AMOUNTS = { plus:500, pro:1500, business:5900 };
function fixture() {
  const env = { STRIPE_SECRET_KEY: "sk_live_fixture", STRIPE_EXPECTED_ACCOUNT_ID: "acct_fixture", APP_BASE_URL: "https://savepulse.cloud", STRIPE_PRICE_PLUS: "price_plus", STRIPE_PRICE_PRO: "price_pro", STRIPE_PRICE_BUSINESS: "price_business", BILLING_DOMESTIC_VAT_ENABLED: "true", STRIPE_MANUAL_TAX_RATE: "txr_fixture", STRIPE_WEBHOOK_SECRET: "fixture" };
  const calls = [], objects = {
    "/account": { id: "acct_fixture", charges_enabled: true, details_submitted: true },
    "/tax_rates/txr_fixture": { active: true, livemode: true, inclusive: true, percentage: 7, country: "TH" },
    "/webhook_endpoints": { data: [{ id: "we_fixture", livemode: true, status: "enabled", url: "https://savepulse-backend.onrender.com/api/v1/billing/webhook", enabled_events: REQUIRED_EVENTS }], has_more: false },
    "/billing_portal/configurations": { data: [{ active: true, is_default: true, livemode: true, features: { invoice_history: { enabled: true }, payment_method_update: { enabled: true }, subscription_cancel: { enabled: true, mode: "at_period_end" } } }], has_more: false }
  };
  for (const [plan, amount] of Object.entries(AMOUNTS)) objects[`/prices/price_${plan}`] = { active: true, livemode: true, currency: "usd", unit_amount: amount, type: "recurring", recurring: { interval: "month", interval_count: 1 } };
  return { env, objects, calls, run: () => inspectLiveBilling({ env, now: Date.parse("2026-11-02"), get: async route => { calls.push(route); if (!objects[route]) throw Error("provider secret must not leak"); return objects[route]; } }) };
}
test("preflight refuses test keys and wrong merchant before further inspection", async () => {
  const f = fixture(); f.env.STRIPE_SECRET_KEY = "sk_test_fixture";
  assert.equal((await f.run()).ready, false); assert.equal(f.calls.length, 0);
  f.env.STRIPE_SECRET_KEY = "sk_live_fixture"; f.objects["/account"].id = "acct_other";
  assert.equal((await f.run()).ready, false); assert.deepEqual(f.calls, ["/account"]);
});
test("preflight distinguishes stale prices, incomplete webhook and unverified reads", async () => {
  const f = fixture(); f.objects["/prices/price_plus"].currency = "thb";
  f.objects["/webhook_endpoints"].data[0].enabled_events = EVENTS.slice(0, 6);
  delete f.objects["/billing_portal/configurations"];
  const report = await f.run(); assert.equal(report.ready, false);
  assert.equal(report.checks.find(c => c.name === "price_plus").result, "FAIL");
  assert.equal(report.checks.find(c => c.name === "signed_lifecycle_webhook").result, "FAIL");
  assert.equal(report.checks.find(c => c.name === "customer_portal").result, "NOT_VERIFIED");
  assert.ok(!JSON.stringify(report).includes("secret"));
  f.objects["/webhook_endpoints"].data[0].enabled_events = EVENTS;
  assert.equal((await f.run()).checks.find(c => c.name === "signed_lifecycle_webhook").result, "FAIL");
});
test("complete configuration is not represented as launch approval or payment QA", async () => {
  const f = fixture(), report = await f.run(); assert.equal(report.ready, true);
  assert.equal(report.scope, "configuration_only"); assert.equal(report.checks.length, 8);
  f.objects["/tax_rates/txr_fixture"].inclusive = false;
  assert.equal((await f.run()).ready, false);
});

test("preflight transport cannot request arbitrary paths or expose provider failure details", async () => {
  const { createLivePreflightReader } = require("../src/billingLivePreflight");
  const requests = [];
  const get = createLivePreflightReader({ STRIPE_SECRET_KEY: "rk_live_fixture" }, async (url, options) => {
    requests.push({ url, options }); return new Response("private provider details", { status: 403 });
  });
  for (const route of ["/customers", "/account/../customers", "/prices/price_fixture?expand[]=customer", "https://other.invalid/account"]) {
    await assert.rejects(get(route), /read_not_allowed/);
  }
  assert.equal(requests.length, 0);
  await assert.rejects(get("/account"), /provider_read_failed/);
  assert.equal(requests[0].options.method, "GET");
  assert.equal(new URL(requests[0].url).origin, "https://api.stripe.com");
});
