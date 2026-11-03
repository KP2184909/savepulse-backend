"use strict";
const AMOUNTS = Object.freeze({ plus: 500, pro: 1500, business: 5900 });
const REQUIRED_EVENTS = Object.freeze([
  "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed", "invoice.payment_action_required",
  "charge.refunded", "charge.dispute.created", "radar.early_fraud_warning.created"
]);
const keyMode = key => /^(sk|rk)_live_/.test(key || "") ? "live" : "other";

function createLivePreflightReader(env = process.env, fetchImpl = globalThis.fetch) {
  return async (route, parameters = {}) => {
    if (!/^\/(account|prices\/price_\w+|tax_rates\/txr_\w+|webhook_endpoints|billing_portal\/configurations)$/.test(route)) throw Error("read_not_allowed");
    const query = new URLSearchParams(parameters);
    const response = await fetchImpl(`https://api.stripe.com/v1${route}${query.size ? `?${query}` : ""}`, {
      method: "GET", signal: AbortSignal.timeout(12000),
      headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY || env.STRIPE_API_KEY}`, "Stripe-Version": "2026-08-26.dahlia" }
    });
    if (!response.ok) throw Error("provider_read_failed");
    return response.json();
  };
}

// Read-only provider inspection. A PASS here is configuration evidence, not
// authorization to open sales or proof of Production payment/fulfillment QA.
async function inspectLiveBilling({ env, get, now = Date.now() }) {
  const checks = [];
  const record = (name, pass) => checks.push({ name, result: pass ? "PASS" : "FAIL" });
  const configured = keyMode(env.STRIPE_SECRET_KEY || env.STRIPE_API_KEY) === "live" &&
    /^acct_\w+$/.test(env.STRIPE_EXPECTED_ACCOUNT_ID || "") && env.APP_BASE_URL === "https://savepulse.cloud";
  record("live_account_configuration", configured);
  if (!configured) return { ready: false, scope: "configuration_only", checks };
  async function check(name, fn) {
    try { record(name, await fn()); }
    catch { checks.push({ name, result: "NOT_VERIFIED", reason: "provider_read_failed" }); }
  }
  // Stop immediately on account mismatch: do not inspect a different merchant.
  await check("merchant_account", async () => {
    const account = await get("/account");
    return account.id === env.STRIPE_EXPECTED_ACCOUNT_ID && account.charges_enabled === true && account.details_submitted === true;
  });
  if (checks.at(-1).result !== "PASS") return { ready: false, scope: "configuration_only", checks };
  for (const [plan, amount] of Object.entries(AMOUNTS)) await check(`price_${plan}`, async () => {
    const priceId = env[`STRIPE_PRICE_${plan.toUpperCase()}`];
    if (!/^price_\w+$/.test(priceId || "")) return false;
    const p = await get(`/prices/${priceId}`);
    return p.active === true && p.livemode === true && p.currency === "usd" && p.unit_amount === amount &&
      p.type === "recurring" && p.recurring?.interval === "month" && p.recurring.interval_count === 1;
  });
  await check("domestic_inclusive_vat", async () => {
    if (env.BILLING_DOMESTIC_VAT_ENABLED !== "true" || !/^txr_\w+$/.test(env.STRIPE_MANUAL_TAX_RATE || "") || now >= Date.parse("2027-10-01T00:00:00+07:00")) return false;
    const r = await get(`/tax_rates/${env.STRIPE_MANUAL_TAX_RATE}`);
    return r.active === true && r.livemode === true && r.inclusive === true && Number(r.percentage) === 7 && r.country === "TH";
  });
  async function list(route) {
    const out = []; let cursor;
    for (let page = 0; page < 10; page++) {
      const result = await get(route, { limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
      if (!Array.isArray(result.data)) throw Error("invalid_list");
      out.push(...result.data);
      if (!result.has_more) return out;
      const next = result.data.at(-1)?.id;
      if (!next || next === cursor) throw Error("invalid_cursor");
      cursor = next;
    }
    throw Error("list_limit");
  }
  await check("signed_lifecycle_webhook", async () => {
    if (!(env.STRIPE_WEBHOOK_SECRET || env.STRIPE_SIGNING_SECRET)) return false;
    const endpoints = await list("/webhook_endpoints");
    return endpoints.some(w => w.livemode === true && w.status === "enabled" &&
      w.url === "https://savepulse-backend.onrender.com/api/v1/billing/webhook" &&
      REQUIRED_EVENTS.every(event => w.enabled_events?.includes(event) || w.enabled_events?.includes("*")));
  });
  await check("customer_portal", async () => {
    const configs = await list("/billing_portal/configurations");
    return configs.some(p => p.is_default === true && p.active === true && p.livemode === true &&
      p.features?.invoice_history?.enabled === true && p.features?.payment_method_update?.enabled === true &&
      p.features?.subscription_cancel?.enabled === true && p.features.subscription_cancel.mode === "at_period_end");
  });
  return { ready: checks.every(c => c.result === "PASS"), scope: "configuration_only", checks };
}
module.exports = { inspectLiveBilling, createLivePreflightReader, REQUIRED_EVENTS };
