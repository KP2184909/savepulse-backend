"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createBillingLifecycle, createStripeApi, keyMode, AMOUNTS } = require("../src/billingLifecycle");
const { createTrialLifecycle, DAY } = require("../src/trialLifecycle");

function fixture() {
  const rows = new Map(), sessions = new Map(), subscriptions = new Map(), requests = [], idem = new Map();
  const env = { BILLING_V2_ENABLED: "true", STRIPE_SECRET_KEY: "rk_test_fixture", STRIPE_EXPECTED_ACCOUNT_ID: "acct_fixture", APP_BASE_URL: "https://preview.example", STRIPE_PRICE_PLUS: "price_plus", STRIPE_PRICE_PRO: "price_pro", STRIPE_PRICE_BUSINESS: "price_business" };
  let time = Date.parse("2026-10-28T00:00:00Z"), count = 0, failWrite = false, failStripe = false;
  const clone = value => value ? structuredClone(value) : null;
  const store = {
    async get(k) { if (failWrite) throw Error("database_unavailable"); return clone(rows.get(k)); },
    async insert(k, v) { if (failWrite) throw Error("database_unavailable"); if (rows.has(k)) return false; rows.set(k, clone(v)); return true; },
    async cas(k, version, v) { if (failWrite) throw Error("database_unavailable"); if (rows.get(k)?.version !== version) return false; rows.set(k, clone(v)); return true; }
  };
  const stripe = async (method, route, values = {}, key) => {
    requests.push({ method, route, values: clone(values), key });
    if (failStripe) throw Error("provider_unavailable");
    if (route === "/account") return { id: "acct_fixture" };
    if (route === "/tax_rates/txr_fixture") return { active:true, livemode:false, inclusive:true, percentage:7, country:"TH" };
    if (route.startsWith("/prices/")) {
      const plan = route.split("price_")[1];
      return { id: `price_${plan}`, active: true, livemode: false, currency: "usd", unit_amount: AMOUNTS[plan], type: "recurring", recurring: { interval: "month", interval_count: 1 } };
    }
    if (method === "POST" && route === "/checkout/sessions") {
      if (idem.has(key)) return clone(idem.get(key));
      const session = { id: `cs_test_${++count}`, mode: "subscription", status: "open", livemode: false, metadata: values.metadata, payment_status: "unpaid", url: "https://checkout.stripe.com/c/pay/cs_test_fixture" };
      sessions.set(session.id, session); idem.set(key, session); return clone(session);
    }
    if (route.endsWith("/expire")) { const session = sessions.get(route.split("/").at(-2)); session.status = "expired"; return clone(session); }
    if (route.startsWith("/checkout/sessions/")) return clone(sessions.get(route.split("/").at(-1)));
    if (route.startsWith("/subscriptions/")) return clone(subscriptions.get(route.split("/").at(-1)));
    if (route.startsWith("/invoices/")) return clone([...subscriptions.values()].find(sub => sub.latest_invoice?.id === route.split("/").at(-1))?.latest_invoice);
    if (route === "/billing_portal/sessions") return { url: "https://billing.stripe.com/p/session/test_fixture" };
    throw Error(`unexpected request ${route}`);
  };
  const identity = async token => { if (token !== "verified-session") throw Object.assign(Error("authentication_required"), { status: 401 }); return "savepulse.cloud@gmail.com"; };
  const options = { store, stripe, identity, env, now: () => time };
  const api = createBillingLifecycle(options);
  async function opened(plan = "pro") { await api.checkout("verified-session", plan); return sessions.get([...sessions.keys()].at(-1)); }
  function settle(session, plan = "pro", subscriptionId = "sub_fixture") {
    Object.assign(session, { status: "complete", payment_status: "paid", customer: "cus_fixture", subscription: subscriptionId });
    const sub = { id: subscriptionId, livemode: false, metadata: session.metadata, customer: session.customer, status: "active", items: { data: [{ quantity: 1, current_period_end: time / 1000 + 30 * 86400, price: { id: `price_${plan}`, currency: "usd", unit_amount: AMOUNTS[plan] } }] }, latest_invoice: { id: "in_fixture", livemode: false, status: "paid", customer: session.customer, parent: { subscription_details: { subscription: subscriptionId } }, lines: { data: [{ pricing: { price_details: { price: `price_${plan}` } }, period: { start: time / 1000, end: time / 1000 + 30 * 86400 } }] } } };
    subscriptions.set(sub.id, sub); return sub;
  }
  const event = (type, object, suffix = "fixture") => ({ id: `evt_${suffix}`, type, livemode: false, data: { object } });
  return { api, options, rows, sessions, subscriptions, requests, store, env, opened, settle, event, advance: ms => time += ms, failDatabase: value => failWrite = value, failProvider: value => failStripe = value };
}

test("checkout requires identity, validates USD catalog, persists binding, and never starts a trial", async () => {
  const f = fixture();
  await assert.rejects(f.api.checkout("email@example.com", "pro"), /authentication_required/);
  await assert.rejects(f.api.checkout("verified-session", "freightpulse"), /billing_plan_unavailable/);
  const result = await f.api.checkout("verified-session", "pro");
  assert.equal(result.mode, "test"); assert.equal(result.configured, true);
  const request = f.requests.find(r => r.method === "POST");
  assert.equal(request.values.customer_email, "savepulse.cloud@gmail.com");
  assert.equal(request.values.line_items[0].price, "price_pro");
  assert.equal(request.values.subscription_data.trial_period_days, undefined);
  assert.equal(request.values.payment_method_types, undefined);
  assert.equal((await f.api.status("verified-session")).plan, "free");
  assert.ok([...f.rows.keys()].every(k => k.startsWith("billing:v2:test:")));
});

test("repeated and concurrent checkout clicks create at most one session", async () => {
  const f = fixture();
  const results = await Promise.allSettled([f.api.checkout("verified-session", "pro"), f.api.checkout("verified-session", "pro")]);
  assert.ok(results.some(r => r.status === "fulfilled"));
  await f.api.checkout("verified-session", "pro");
  assert.equal(f.sessions.size, 1);
  await f.api.checkout("verified-session", "plus");
  assert.equal([...f.sessions.values()].filter(s => s.status === "open").length, 1);
});

test("lost Checkout response retries the persisted provider idempotency key", async () => {
  const f = fixture(); let lost = false;
  const api = createBillingLifecycle({ ...f.options, stripe: async (...args) => {
    const result = await f.options.stripe(...args);
    if (args[0] === "POST" && args[1] === "/checkout/sessions" && !lost) { lost = true; throw Error("connection_lost_after_creation"); }
    return result;
  } });
  await assert.rejects(api.checkout("verified-session", "pro"), /connection_lost_after_creation/);
  await api.checkout("verified-session", "pro");
  assert.equal(f.sessions.size, 1);
  const attempts = f.requests.filter(r => r.method === "POST");
  assert.equal(attempts.length, 2); assert.equal(attempts[0].key, attempts[1].key);
  assert.deepEqual(attempts[0].values, attempts[1].values);
});

test("without a webhook, a completed bound checkout reconciles on status refresh", async () => {
  const f = fixture(), session = await f.opened(); f.settle(session);
  assert.equal((await f.api.status("verified-session")).plan, "pro");
  assert.equal((await f.api.status("verified-session")).portalAvailable, true);
});

test("paid webhook grants durable access, replay is harmless, and another service is ignored", async () => {
  const f = fixture(), session = await f.opened(); f.settle(session);
  const event = f.event("checkout.session.completed", session);
  assert.equal((await f.api.event(event)).membership.plan, "pro");
  assert.equal((await createBillingLifecycle(f.options).status("verified-session")).plan, "pro");
  assert.equal((await f.api.event(event)).reason, "duplicate_event");
  await assert.rejects(f.api.checkout("verified-session", "plus"), /billing_membership_exists_use_portal/);
  assert.ok((await f.api.portal("verified-session")).url.startsWith("https://billing.stripe.com/"));
  const sub = f.subscriptions.get("sub_fixture"); sub.metadata = { service: "freightpulse" };
  assert.equal((await f.api.event(f.event("customer.subscription.updated", sub, "other"))).reason, "unbound_subscription");
});

test("unpaid, trialing, mismatched price, forged email, and wrong mode cannot grant paid access", async () => {
  for (const scenario of ["unpaid", "trialing", "price", "ownership", "mode"]) {
    const f = fixture(), session = await f.opened(), sub = f.settle(session);
    if (scenario === "unpaid") { session.payment_status = "unpaid"; sub.latest_invoice.status = "open"; }
    if (scenario === "trialing") sub.status = "trialing";
    if (scenario === "price") sub.items.data[0].price.unit_amount = 1;
    if (scenario === "ownership") session.customer = "cus_different";
    const event = f.event("checkout.session.completed", session);
    if (scenario === "mode") event.livemode = true;
    await f.api.event(event).catch(() => {});
    if (["price", "ownership"].includes(scenario)) await assert.rejects(f.api.status("verified-session"), /billing_(price|binding)_mismatch/);
    else if (scenario === "mode") assert.equal(f.rows.get(f.api.accountKey("savepulse.cloud@gmail.com")).membership, undefined);
    else assert.equal((await f.api.status("verified-session")).plan, "free", scenario);
  }
});

test("fresh Stripe state defeats old active events after cancellation", async () => {
  const f = fixture(), session = await f.opened(), sub = f.settle(session);
  const old = structuredClone(sub);
  await f.api.event(f.event("checkout.session.completed", session, "paid"));
  sub.cancel_at_period_end = true;
  await f.api.event(f.event("customer.subscription.updated", sub, "scheduled"));
  assert.equal((await f.api.status("verified-session")).plan, "pro");
  assert.equal((await f.api.status("verified-session")).renews, false);
  sub.status = "canceled";
  await f.api.event(f.event("customer.subscription.deleted", sub, "cancelled"));
  await f.api.event(f.event("customer.subscription.updated", old, "old"));
  assert.equal((await f.api.status("verified-session")).plan, "free");
});

test("failed renewal never extends paid time; expiry and successful retry are server checked", async () => {
  const f = fixture(), session = await f.opened(), sub = f.settle(session);
  await f.api.event(f.event("checkout.session.completed", session, "paid"));
  const until = (await f.api.status("verified-session")).paidUntil;
  f.advance(30 * DAY);
  sub.items.data[0].current_period_end += 30 * 86400;
  sub.status = "past_due"; sub.latest_invoice.status = "open";
  await f.api.event(f.event("invoice.payment_failed", { subscription: sub.id }, "failed"));
  const failed = await f.api.status("verified-session");
  assert.equal(failed.plan, "free"); assert.equal(failed.paidUntil, until);
  sub.status = "active"; sub.latest_invoice.status = "paid";
  sub.latest_invoice.lines.data[0].period = { start: Date.parse(until) / 1000, end: sub.items.data[0].current_period_end };
  await f.api.event(f.event("invoice.payment_succeeded", { parent: { subscription_details: { subscription: sub.id } } }, "retry"));
  assert.equal((await f.api.status("verified-session")).plan, "pro");
});

test("an unpaid plan upgrade cannot inherit the higher entitlement from an earlier paid plan", async () => {
  const f = fixture(), session = await f.opened("plus"), sub = f.settle(session, "plus");
  await f.api.event(f.event("checkout.session.completed", session, "plus_paid"));
  sub.items.data[0].price = { id: "price_pro", currency: "usd", unit_amount: 1500 };
  sub.latest_invoice.status = "open";
  await f.api.event(f.event("customer.subscription.updated", sub, "unpaid_upgrade"));
  assert.equal((await f.api.status("verified-session")).plan, "plus");
});

test("lost webhook is reconciled at entitlement read, and outages cannot grant or renew", async () => {
  const f = fixture(), session = await f.opened(), sub = f.settle(session);
  await f.api.event(f.event("checkout.session.completed", session));
  f.advance(5 * 60000); sub.status = "canceled";
  assert.equal((await f.api.status("verified-session")).plan, "free");
  f.failDatabase(true); await assert.rejects(f.api.status("verified-session"), /database_unavailable/);
  f.failDatabase(false); f.advance(5 * 60000); f.failProvider(true);
  await assert.rejects(f.api.status("verified-session"), /provider_unavailable/);
});

test("paid entitlement resolver preserves no-card trial independently", async () => {
  const f = fixture(), trialRows = new Map();
  const token = "a".repeat(64), crypto = require("node:crypto"), key = "trial-session:" + crypto.createHash("sha256").update(token).digest("hex");
  trialRows.set(key, { email: "savepulse.cloud@gmail.com", expiresAt: Date.now() + DAY });
  const trialStore = { ...f.store, get: async k => structuredClone(trialRows.get(k) || null), paidPlan: async email => (await f.api.reconcileEmail(email)).plan };
  const trials = createTrialLifecycle({ store: trialStore, send: async () => {} });
  const session = await f.opened(); f.settle(session); await f.api.event(f.event("checkout.session.completed", session));
  assert.equal((await trials.status(token)).paidPlan, "pro");
  assert.equal((await trials.status(token)).trial.status, "not_started");
});

test("restricted API key modes are recognized and provider errors are sanitized", async () => {
  assert.equal(keyMode("rk_test_fixture"), "test"); assert.equal(keyMode("rk_live_fixture"), "live");
  const api = createStripeApi({ STRIPE_SECRET_KEY: "rk_test_fixture" }, async () => Response.json({ error: { message: "sensitive" } }, { status: 400 }));
  await assert.rejects(api("GET", "/account"), error => error.message === "billing_provider_unavailable");
  await assert.rejects(api("GET", "/customers"), /billing_unavailable/);
});

 test("tax draft source requires a paid invoice bound to this account and matching customer", async () => {
  const f = fixture(), session = await f.opened();
  const sub = f.settle(session);
  Object.assign(sub.latest_invoice, { currency: "usd", amount_paid: 1500 });
  assert.equal((await f.api.paidInvoiceForTaxDraft("in_fixture")).id,"in_fixture");
  sub.latest_invoice.customer="cus_other";
  await assert.rejects(f.api.paidInvoiceForTaxDraft("in_fixture"),/billing_bound_invoice_required/);
  sub.latest_invoice.customer="cus_fixture"; sub.latest_invoice.status="open";
  await assert.rejects(f.api.paidInvoiceForTaxDraft("in_fixture"),/billing_paid_invoice_required/);
  await assert.rejects(f.api.paidInvoiceForTaxDraft("arbitrary"),/billing_invoice_required/);
});

test("domestic VAT checkout requires server-saved details and a verified inclusive tax rate", async () => {
 const f=fixture();f.env.BILLING_DOMESTIC_VAT_ENABLED="true";f.env.STRIPE_MANUAL_TAX_RATE="txr_fixture";
 await assert.rejects(f.api.checkout("verified-session","plus"),/billing_country_not_supported/);
 await assert.rejects(f.api.saveProfile("verified-session",{country:"US"}),/country_not_supported/);
 const profile={name:"Sandbox QA",address:"Test address in Thailand",postalCode:"11130",country:"TH",serviceUseCountry:"TH",domesticUseConfirmed:true,taxId:"0125554006077",branchCode:"00000"};
 await f.api.saveProfile("verified-session",profile);await f.api.checkout("verified-session","plus");
 const request=f.requests.find(r=>r.method==="POST"&&r.route==="/checkout/sessions");
 assert.deepEqual(request.values.subscription_data.default_tax_rates,["txr_fixture"]);assert.equal(request.values.billing_address_collection,"required");
 const row=await f.store.get(f.api.accountKey("savepulse.cloud@gmail.com"));assert.equal(row.bindings[row.pending.attempt].billingProfile.name,"Sandbox QA");
 f.env.STRIPE_MANUAL_TAX_RATE="";await assert.rejects(f.api.checkout("verified-session","plus"),/tax_configuration_required/);
});
