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

test("sandbox auth never forwards arbitrary customer email to the shared identity provider", async () => {
  const r = await fetch(base + "auth/code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "customer@example.invalid" }),
  });
  assert.equal(r.status, 403);
  const t = await fetch(base + "auth/code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "savepulse.cloud@gmail.com" }),
  });
  assert.equal(t.status, 503);
  assert.equal(
    (await (await fetch(base + "catalog")).json()).sandboxEnabled,
    true,
  );
});

test("TradingView test endpoint strips the scoped token and cannot access jobs, live or customer APIs", async () => {
  env.FREIGHT_TV_TEST_ENABLED = "true";
  env.FREIGHT_TV_TEST_SECRET = "test-only-scoped-token-123456789";
  const original = service.ingest;
  let received;
  service.ingest = async (payload) => {
    received = payload;
    return { accepted: true };
  };
  const send = (body) =>
    fetch(base + "tradingview/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await send({ secret_key: "wrong", payload: { dataMode: "test" } }))
        .status,
      401,
    );
    const envelope = {
      secret_key: env.FREIGHT_TV_TEST_SECRET,
      payload: { dataMode: "test", symbol: "CS11!" },
    };
    const response = await send(envelope);
    assert.equal(response.status, 200);
    assert.deepEqual(received, envelope.payload);
    assert.ok(!JSON.stringify(received).includes(env.FREIGHT_TV_TEST_SECRET));
    assert.ok(!(await response.text()).includes(env.FREIGHT_TV_TEST_SECRET));
    assert.equal(
      (await send({ ...envelope, payload: { dataMode: "live" } })).status,
      422,
    );
    assert.equal(
      (await send({ ...envelope, extra: "unexpected" })).status,
      422,
    );
    assert.equal(
      (await send({ secret_key: env.FREIGHT_TV_TEST_SECRET, payload: [] }))
        .status,
      422,
    );
    env.FREIGHT_TV_TEST_ENABLED = "false";
    assert.equal((await send(envelope)).status, 503);
    env.FREIGHT_TV_TEST_ENABLED = "true";
    env.FREIGHT_TV_TEST_SECRET = env.FREIGHT_TEST_FEED_SECRET;
    assert.equal((await send(envelope)).status, 503);
  } finally {
    service.ingest = original;
    delete env.FREIGHT_TV_TEST_ENABLED;
    delete env.FREIGHT_TV_TEST_SECRET;
  }
});

test("TradingView envelopes for all eight instruments validate, deduplicate and persist without credentials", async () => {
  const { createFreightService, SYMBOLS } = require("../src/freightpulse");
  const { firstCsWindow } = require("../src/freightCsDemoRule");
  const rows = new Map();
  const store = {
    get: async (k) => structuredClone(rows.get(k) || null),
    insert: async (k, v) => {
      if (rows.has(k)) return false;
      rows.set(k, structuredClone(v));
      return true;
    },
    cas: async (k, version, v) => {
      if (rows.get(k)?.version !== version) return false;
      rows.set(k, structuredClone(v));
      return true;
    },
    listCompanies: async () => [],
  };
  const now = Date.parse("2026-10-26T12:00:00Z");
  const scriptCs = "freightpulse.container.next4.transport.v2",
    scriptContext = "freightpulse.context.telemetry.v1";
  const rules = {
    versions: Object.fromEntries(
      SYMBOLS.map((s) => [s, [s.startsWith("CS") ? scriptCs : scriptContext]]),
    ),
  };
  const build = () =>
    createFreightService({
      store,
      identity: async () => {
        throw Error("not used");
      },
      rules,
      enabled: true,
      now: () => now,
    });
  const original = service.ingest;
  const real = build();
  service.ingest = real.ingest;
  env.FREIGHT_TV_TEST_ENABLED = "true";
  env.FREIGHT_TV_TEST_SECRET = "isolated-transport-test-token-012345";
  const send = (payload) =>
    fetch(base + "tradingview/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret_key: env.FREIGHT_TV_TEST_SECRET, payload }),
    });
  try {
    const bar = new Date(now - 86400000).toISOString();
    const window = firstCsWindow(
      [100, 99, 101, 102].map((close, i) => ({
        time: new Date(now - (4 - i) * 86400000).toISOString(),
        close,
        closed: true,
      })),
      { stopOnLowerClose: true },
    )[3];
    const payloads = SYMBOLS.map((symbol, index) => {
      const cs = symbol.startsWith("CS");
      return {
        contractVersion: "freightpulse.draft.v2",
        scriptVersion: cs ? scriptCs : scriptContext,
        eventId: "fixture-" + symbol,
        symbol:
          (cs ? "NYMEX:" : symbol === "BDI" ? "INDEX:" : "NYSE:") + symbol,
        family: cs ? "container" : symbol === "BDI" ? "bulk" : "context",
        route: cs
          ? ["FBX01", "FBX02", "FBX03", "FBX11", "FBX12", "FBX13"][index]
          : null,
        timeframe: "1D",
        barTime: bar,
        barCloseTime: new Date(now - 3600000).toISOString(),
        barClosed: true,
        signalStatus: cs ? "pressure_up" : "unclear",
        windowState: cs ? window.windowState : "inactive",
        windowDay: cs ? window.windowDay : null,
        windowStart: cs ? window.windowStart : null,
        ...(cs
          ? {
              ruleVersion: window.ruleVersion,
              confirmationBarTime: window.confirmationBarTime,
            }
          : {}),
        sourceUpdatedAt: null,
        sourceFreshness: "unknown",
        source: "test-fixture",
        dataMode: "test",
      };
    });
    for (const payload of payloads) {
      const response = await send(payload);
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal((await response.json()).accepted, true);
    }
    assert.equal(rows.size, 8);
    assert.ok(
      !JSON.stringify([...rows.values()]).includes(env.FREIGHT_TV_TEST_SECRET),
    );
    service.ingest = build().ingest;
    assert.equal(
      (
        await (
          await send({ ...payloads[0], eventId: "new-id-same-bar" })
        ).json()
      ).duplicate,
      true,
    );
    const old = {
      ...payloads[6],
      barTime: new Date(now - 3 * 86400000).toISOString(),
      barCloseTime: new Date(now - 2 * 86400000).toISOString(),
    };
    assert.equal((await send(old)).status, 409);
    assert.equal((await send({ ...payloads[0], route: "FBX02" })).status, 422);
    assert.equal(rows.size, 8);
  } finally {
    service.ingest = original;
    delete env.FREIGHT_TV_TEST_ENABLED;
    delete env.FREIGHT_TV_TEST_SECRET;
  }
});
