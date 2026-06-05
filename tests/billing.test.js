"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "savepulse-billing-"));

process.env.PORT = "0";
process.env.HOST = "127.0.0.1";
process.env.DATA_DIR = tempDataDir;
process.env.WEBHOOK_SECRET = "test-master-secret";
process.env.ADMIN_READINESS_KEY = "test-admin-readiness-key";

const {
  applyStripeEvent,
  billingReadinessSnapshot,
  checkoutPayload,
  checkoutPriceIdForPlan,
  latestSignalsSnapshot,
  safeStripeEventSummary,
  server,
  verifyStripeWebhookSignature
} = require("../server");

test.after(() => {
  server.close();
  fs.rmSync(tempDataDir, { recursive: true, force: true });
});

test("checkout price IDs can be configured with Stripe env aliases", () => {
  assert.equal(
    checkoutPriceIdForPlan("plus", {
      STRIPE_PLUS_PRICE_ID: "price_plus_alias"
    }),
    "price_plus_alias"
  );
  assert.equal(
    checkoutPriceIdForPlan("pro", {
      STRIPE_PRICE_PRO: "price_pro"
    }),
    "price_pro"
  );
});

test("checkout payload reports missing Stripe configuration without failing", async () => {
  const payload = await checkoutPayload(
    "pro",
    { email: "member@example.com" },
    {
      PUBLIC_URL: "https://savepulse.example"
    }
  );

  assert.equal(payload.configured, false);
  assert.deepEqual(payload.missing, ["STRIPE_SECRET_KEY", "STRIPE_PRICE_PRO"]);
});

test("Stripe webhook signature verification accepts a matching v1 signature", () => {
  const secret = "whsec_test_secret";
  const rawBody = Buffer.from(JSON.stringify({ id: "evt_test", type: "checkout.session.completed" }));
  const timestamp = 1_777_777_777;
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

  assert.equal(
    verifyStripeWebhookSignature(rawBody, `t=${timestamp},v1=${signature}`, secret, timestamp * 1000),
    true
  );
});

test("checkout completion upgrades the subscriber plan from Stripe metadata", () => {
  const result = applyStripeEvent({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        customer: "cus_test",
        subscription: "sub_test",
        payment_status: "paid",
        customer_email: "vip@example.com",
        metadata: { plan: "pro", email: "vip@example.com" }
      }
    }
  });

  assert.equal(result.updated, true);
  assert.equal(result.subscriber.plan, "pro");
  assert.equal(result.subscriber.billing.provider, "stripe");
  assert.equal(result.subscriber.billing.status, "paid");
});

test("billing readiness snapshot reports live readiness without exposing secrets", () => {
  const snapshot = billingReadinessSnapshot({
    APP_BASE_URL: "https://savepulse.cloud",
    STRIPE_SECRET_KEY: "sk_live_do_not_leak",
    STRIPE_WEBHOOK_SECRET: "whsec_do_not_leak",
    STRIPE_PRICE_PLUS: "price_live_plus",
    STRIPE_PRICE_PRO: "price_live_pro",
    STRIPE_PRICE_BUSINESS: "price_live_business",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service_role_do_not_leak",
    ADMIN_READINESS_KEY: "admin_key_do_not_leak"
  });
  const serialized = JSON.stringify(snapshot);

  assert.equal(snapshot.endpoints.stripeWebhook, "https://savepulse.cloud/api/v1/billing/webhook");
  assert.equal(snapshot.stripe.mode, "live");
  assert.equal(snapshot.stripe.secretKeyConfigured, true);
  assert.equal(snapshot.stripe.webhookSecretConfigured, true);
  assert.deepEqual(snapshot.stripe.priceIdsConfigured, {
    plus: true,
    pro: true,
    business: true
  });
  assert.equal(snapshot.supabase.configured, true);
  assert.equal(snapshot.adminProtection.adminReadinessKeyConfigured, true);
  assert.equal(snapshot.adminProtection.protected, true);
  assert.equal(snapshot.safety.secretsExposed, false);
  assert.equal(serialized.includes("sk_live_do_not_leak"), false);
  assert.equal(serialized.includes("whsec_do_not_leak"), false);
  assert.equal(serialized.includes("service_role_do_not_leak"), false);
  assert.equal(serialized.includes("admin_key_do_not_leak"), false);
});

test("admin billing readiness endpoint requires the separate admin key when configured", async () => {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const unauthorized = await fetch(`${baseUrl}/api/v1/admin/billing-readiness`);
  assert.equal(unauthorized.status, 401);

  const webhookSecretAttempt = await fetch(`${baseUrl}/api/v1/admin/billing-readiness`, {
    headers: { "x-savepulse-secret": "test-master-secret" }
  });
  assert.equal(webhookSecretAttempt.status, 401);

  const authorized = await fetch(`${baseUrl}/api/v1/admin/billing-readiness`, {
    headers: { "x-savepulse-admin-key": "test-admin-readiness-key" }
  });
  const payload = await authorized.json();
  const serialized = JSON.stringify(payload);

  assert.equal(authorized.status, 200);
  assert.equal(payload.adminProtection.adminReadinessKeyConfigured, true);
  assert.equal(payload.adminProtection.protected, true);
  assert.equal(serialized.includes("test-admin-readiness-key"), false);
  assert.equal(serialized.includes("test-master-secret"), false);
});

test("status endpoint returns a default direction-aware signal before TradingView data arrives", async () => {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/api/v1/status?symbol=JPYTHB&from=THB&to=JPY`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.signal.symbol, "JPYTHB");
  assert.equal(payload.signal.action, "WAIT_ZONE");
  assert.equal(payload.signal.source, "default");
  assert.equal(payload.userFacing.direction, "inverted");
  assert.equal(payload.userFacing.label.th, "ยังไม่ต้องรีบ");
});

test("admin latest signals endpoint is protected and shows normalized Pine fields", async () => {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const unauthorized = await fetch(`${baseUrl}/api/v1/admin/latest-signals`);
  assert.equal(unauthorized.status, 401);

  const webhook = await fetch(`${baseUrl}/api/v1/webhook/tradingview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret_key: "test-master-secret",
      symbol: "JPYTHB",
      action: "BUY_ZONE",
      price: 0.2029,
      timeframe: "1D",
      detail: "Daily bar closed in the watch window.",
      days_in_window: 2,
      ema_fast: 0.203,
      ema_slow: 0.201,
      bar_time: "2026-06-05T00:00:00.000Z"
    })
  });
  assert.equal(webhook.status, 202);

  const authorized = await fetch(`${baseUrl}/api/v1/admin/latest-signals`, {
    headers: { "x-savepulse-admin-key": "test-admin-readiness-key" }
  });
  const payload = await authorized.json();
  const serialized = JSON.stringify(payload);
  const jpythb = payload.signals.find((signal) => signal.symbol === "JPYTHB");

  assert.equal(authorized.status, 200);
  assert.equal(payload.count, 9);
  assert.equal(payload.signals.length, 9);
  assert.equal(jpythb.action, "BUY_ZONE");
  assert.deepEqual(jpythb.pine, {
    detail: "Daily bar closed in the watch window.",
    daysInWindow: 2,
    emaFast: 0.203,
    emaSlow: 0.201,
    barTime: "2026-06-05T00:00:00.000Z"
  });
  assert.equal(serialized.includes("test-master-secret"), false);
  assert.equal(serialized.includes("test-admin-readiness-key"), false);
});

test("latest signals snapshot includes the full tracked universe", () => {
  const snapshot = latestSignalsSnapshot();

  assert.equal(snapshot.count, 9);
  assert.deepEqual(
    snapshot.signals.map((signal) => signal.symbol),
    ["USDTHB", "JPYTHB", "EURTHB", "XAUTHB", "BTCTHB", "USDJPY", "EURUSD", "XAUUSD", "BTCUSD"]
  );
  assert.equal(JSON.stringify(snapshot).includes("test-master-secret"), false);
});

test("safe Stripe event summaries keep customer and subscription IDs hidden", () => {
  const summary = safeStripeEventSummary(
    {
      id: "evt_live_123",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_live_secret",
          customer: "cus_secret",
          subscription: "sub_secret",
          mode: "subscription",
          payment_status: "paid",
          customer_email: "member@example.com"
        }
      }
    },
    {
      updated: true,
      subscriber: {
        email: "member@example.com",
        plan: "plus",
        billing: {
          provider: "stripe",
          status: "paid",
          plan: "plus",
          updatedAt: "2026-06-04T00:00:00.000Z"
        }
      }
    },
    "2026-06-04T00:00:00.000Z"
  );
  const serialized = JSON.stringify(summary);

  assert.equal(summary.object.hasCustomer, true);
  assert.equal(summary.object.hasSubscription, true);
  assert.equal(summary.result.subscriber.plan, "plus");
  assert.equal(serialized.includes("cus_secret"), false);
  assert.equal(serialized.includes("sub_secret"), false);
  assert.equal(serialized.includes("cs_live_secret"), false);
});
