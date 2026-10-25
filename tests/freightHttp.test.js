"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  http = require("node:http");
const { once } = require("node:events");
const StripeClient = require("stripe");
const { createFreightHttp } = require("../src/freightHttp");
const { createFreightStripe } = require("../src/freightStripe");
const { demoReport } = require("../src/freightDemo");
const env = {
  FREIGHTPULSE_SANDBOX_ENABLED: "true",
  FREIGHT_TEST_FEED_SECRET: "test-feed-only",
  FREIGHT_JOB_SECRET: "test-job-only",
  FREIGHT_STRIPE_SECRET_KEY: "sk_test_fixture",
  FREIGHT_STRIPE_PRICE_ID: "price_fixture",
  FREIGHT_STRIPE_PRODUCT_ID: "prod_fixture",
  FREIGHT_STRIPE_PORTAL_CONFIG_ID: "bpc_fixture",
  FREIGHT_STRIPE_WEBHOOK_SECRET: "whsec_test_fixture",
  FREIGHT_APP_BASE_URL: "http://127.0.0.1:3000",
};
const raw = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1048576) {
        reject(Error("too_large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(Buffer.from(data)));
  });
let calls = 0;
const service = {
  account: async (token) => {
    if (token !== "verified-test-token")
      throw Object.assign(Error("authentication_required"), { status: 401 });
    return { id: "co_test" };
  },
  billingEvent: async (e) => {
    assert.equal(e.livemode, false);
    calls++;
    return { processed: true };
  },
  ingest: async (p) => ({ accepted: true, symbol: p.symbol }),
  notifications: async () => ({ sent: 0 }),
};
const stripe = createFreightStripe({ env });
const handler = createFreightHttp({
  service,
  stripe,
  env,
  parseBody: async (req) => JSON.parse(await raw(req)),
  readRawBody: raw,
  sendJson: (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  },
  demo: demoReport,
});
const server = http.createServer(async (req, res) => {
  try {
    await handler(req, res, new URL(req.url, "http://localhost"));
  } catch (e) {
    res.writeHead(e.status || 400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
});
let base;
test.before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}/api/v1/freightpulse/`;
});
test.after(() => server.close());
test("HTTP identity is mandatory and browser catalog/demo never grants paid access", async () => {
  const demo = await (await fetch(base + "demo")).json();
  assert.equal(demo.mode, "demo");
  assert.equal(demo.routes.length, 6);
  assert.equal(demo.context.length, 2);
  const denied = await fetch(base + "account");
  assert.equal(denied.status, 401);
  const ok = await fetch(base + "account", {
    headers: { authorization: "Bearer verified-test-token" },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const c = await (await fetch(base + "catalog")).json();
  assert.equal(c.price.amount, 9900);
  assert.equal(c.liveSales, false);
});
test("HTTP signed Stripe event accepts authentic raw bytes and rejects tamper/replay timestamp", async () => {
  const rawBody = JSON.stringify({
    id: "evt_test",
    type: "invoice.paid",
    livemode: false,
    data: { object: {} },
  });
  const helper = new StripeClient("sk_test_fixture").webhooks;
  const signature = helper.generateTestHeaderString({
    payload: rawBody,
    secret: env.FREIGHT_STRIPE_WEBHOOK_SECRET,
  });
  const send = (body, signature) =>
    fetch(base + "billing/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": signature,
        "content-type": "application/json",
      },
      body,
    });
  assert.equal((await send(rawBody, signature)).status, 200);
  assert.equal(calls, 1);
  assert.equal((await send(rawBody + " ", signature)).status, 400);
  const expired = helper.generateTestHeaderString({
    payload: rawBody,
    secret: env.FREIGHT_STRIPE_WEBHOOK_SECRET,
    timestamp: Math.floor(Date.now() / 1000) - 1000,
  });
  assert.equal((await send(rawBody, expired)).status, 400);
  assert.equal(calls, 1);
});
test("feed/job authentication are separate; real ingestion is closed", async () => {
  const req = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ symbol: "CS11!" }),
  };
  assert.equal((await fetch(base + "signals/test", req)).status, 401);
  assert.equal(
    (
      await fetch(base + "signals/test", {
        ...req,
        headers: { ...req.headers, authorization: "Bearer test-feed-only" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(base + "notifications/tick", {
        ...req,
        headers: { ...req.headers, authorization: "Bearer test-feed-only" },
      })
    ).status,
    401,
  );
  assert.equal((await fetch(base + "signals/live", req)).status, 503);
});
