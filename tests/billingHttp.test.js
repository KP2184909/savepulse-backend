"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const rows = new Map(), mail = [], sessions = new Map();
const originalFetch = global.fetch;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "savepulse-billing-http-"));
const secret = "whsec_local_test";
let subscription;
Object.assign(process.env, { PORT: "0", HOST: "127.0.0.1", DATA_DIR: dir, SUPABASE_URL: "https://database.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture", RESEND_API_KEY: "fixture", FROM_EMAIL: "test@example.invalid", BILLING_V2_ENABLED: "true", PUBLIC_CHECKOUT_ENABLED: "true", STRIPE_SECRET_KEY: "rk_test_fixture", STRIPE_EXPECTED_ACCOUNT_ID: "acct_fixture", STRIPE_PRICE_PRO: "price_pro", STRIPE_WEBHOOK_SECRET: secret, APP_BASE_URL: "https://preview.example" });
global.fetch = async (rawUrl, options = {}) => {
  const url = new URL(rawUrl);
  if (url.hostname === "api.resend.com") { mail.push(JSON.parse(options.body)); return Response.json({ id: "test-provider" }); }
  if (url.hostname === "api.stripe.com") {
    if (url.pathname === "/v1/account") return Response.json({ id: "acct_fixture" });
    if (url.pathname === "/v1/prices/price_pro") return Response.json({ id: "price_pro", active: true, livemode: false, currency: "usd", unit_amount: 1500, type: "recurring", recurring: { interval: "month", interval_count: 1 } });
    if (url.pathname === "/v1/checkout/sessions") {
      const data = new URLSearchParams(options.body);
      const session = { id: "cs_test_http", mode: "subscription", livemode: false, status: "open", payment_status: "unpaid", metadata: { service: data.get("metadata[service]"), billing_account: data.get("metadata[billing_account]"), billing_attempt: data.get("metadata[billing_attempt]") }, url: "https://checkout.stripe.com/c/pay/cs_test_http" };
      sessions.set(session.id, session); return Response.json(session);
    }
    if (url.pathname === "/v1/checkout/sessions/cs_test_http") return Response.json(sessions.get("cs_test_http"));
    if (url.pathname === "/v1/subscriptions/sub_http") return Response.json(subscription);
    if (url.pathname === "/v1/billing_portal/sessions") return Response.json({ url: "https://billing.stripe.com/p/session/test_http" });
    return Response.json({}, { status: 500 });
  }
  if (url.hostname !== "database.invalid") return originalFetch(rawUrl, options);
  if (url.pathname.endsWith("/subscribers")) return Response.json([]);
  const key = url.searchParams.get("key")?.replace(/^eq\./, "");
  if (options.method === "POST") {
    const record = JSON.parse(options.body);
    if (rows.has(record.key)) return Response.json([]);
    rows.set(record.key, record.value); return Response.json([record]);
  }
  if (options.method === "PATCH") {
    const version = Number(url.searchParams.get("value->>version")?.replace(/^eq\./, ""));
    if (rows.get(key)?.version !== version) return Response.json([]);
    rows.set(key, JSON.parse(options.body).value); return Response.json([{ key, value: rows.get(key) }]);
  }
  return Response.json(rows.has(key) ? [{ key, value: rows.get(key) }] : []);
};
const { server, resolveBillingSubscriber } = require("../server");
let base, token;
test.before(async () => { if (!server.listening) await once(server, "listening"); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { await new Promise(resolve => server.close(resolve)); global.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }); });
async function api(route, body, auth = token) {
  const response = await originalFetch(base + route, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
async function webhook(event, signatureValid = true) {
  const body = JSON.stringify(event), timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", signatureValid ? secret : "wrong").update(`${timestamp}.${body}`).digest("hex");
  const response = await originalFetch(base + "/api/v1/billing/webhook", { method: "POST", headers: { "stripe-signature": `t=${timestamp},v1=${signature}` }, body });
  return { status: response.status, data: await response.json() };
}
test("verified HTTP checkout, signed webhook, reload entitlement, portal, cancellation and delivery gate", async () => {
  assert.equal((await api("/api/v1/billing/catalog")).data.plans[0].amount, 15);
  assert.equal((await api("/api/v1/billing/checkout", { email: "savepulse.cloud@gmail.com", plan: "pro" })).status, 401);
  await api("/api/v1/trial/code", { email: "savepulse.cloud@gmail.com" });
  const auth = await api("/api/v1/trial/verify", { email: "savepulse.cloud@gmail.com", code: mail.at(-1).text.match(/code is (\d{6})/)[1] });
  token = auth.data.token;
  assert.equal((await api("/api/v1/billing/checkout", { email: "other@example.com", plan: "pro" })).status, 403);
  const checkout = await api("/api/v1/billing/checkout", { email: "savepulse.cloud@gmail.com", plan: "pro" });
  assert.equal(checkout.status, 200); assert.equal(checkout.data.checkout.mode, "test");
  assert.equal((await api("/api/v1/trial/status")).data.plan, "free");
  const session = sessions.get("cs_test_http");
  Object.assign(session, { status: "complete", payment_status: "paid", customer: "cus_http", subscription: "sub_http" });
  const time = Math.floor(Date.now() / 1000), end = time + 30 * 86400;
  subscription = { id: "sub_http", livemode: false, metadata: session.metadata, customer: "cus_http", status: "active", items: { data: [{ quantity: 1, current_period_end: end, price: { id: "price_pro", unit_amount: 1500, currency: "usd" } }] }, latest_invoice: { id: "in_http", livemode: false, customer: "cus_http", status: "paid", parent: { subscription_details: { subscription: "sub_http" } }, lines: { data: [{ pricing: { price_details: { price: "price_pro" } }, period: { start: time, end } }] } } };
  const event = { id: "evt_http", livemode: false, type: "checkout.session.completed", data: { object: session } };
  assert.equal((await webhook(event, false)).status, 400);
  assert.equal((await webhook(event)).data.result.updated, true);
  assert.equal((await webhook(event)).data.result.reason, "duplicate_event");
  const status = await api("/api/v1/billing/status");
  assert.equal(status.data.plan, "pro"); assert.equal(status.headers.get("cache-control"), "no-store");
  assert.equal((await api("/api/v1/trial/status")).data.plan, "pro");
  assert.equal((await api("/api/v1/trial/status")).data.trial.status, "not_started");
  assert.equal((await api("/api/v1/status?symbol=XAUUSD")).status, 200);
  assert.ok((await api("/api/v1/billing/portal", {})).data.url.startsWith("https://billing.stripe.com/"));
  subscription.status = "canceled";
  await webhook({ ...event, id: "evt_cancel", type: "customer.subscription.deleted", data: { object: subscription } });
  assert.equal((await api("/api/v1/status?symbol=XAUUSD")).status, 403);
  assert.equal((await resolveBillingSubscriber({ email: "savepulse.cloud@gmail.com", plan: "pro" })).plan, "free");
  await assert.rejects(resolveBillingSubscriber({ email: "real-customer@example.com", plan: "pro" }), /billing_test_mailbox_required/);
});

test("tax invoice drafts reject a member session without separate administrator authorization", async () => {
  const result = await api("/api/v1/admin/billing/tax-invoice-draft", { invoiceId: "in_http" });
  assert.equal(result.status,401);
  assert.equal(result.headers.get("cache-control"),"no-store");
});
