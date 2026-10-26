"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  createFreightService,
  validateSignal,
  signalView,
  PRICE,
  SYMBOLS,
} = require("../src/freightpulse");
const { createFreightStripe } = require("../src/freightStripe");
const NOW = Date.parse("2026-10-25T12:00:00Z"),
  DAY = 86400000;
function memory() {
  const rows = new Map();
  return {
    rows,
    get: async (k) => structuredClone(rows.get(k) || null),
    insert: async (k, v) => {
      if (rows.has(k)) return false;
      rows.set(k, structuredClone(v));
      return true;
    },
    cas: async (k, ver, v) => {
      if (rows.get(k)?.version !== ver) return false;
      rows.set(k, structuredClone(v));
      return true;
    },
    listCompanies: async () =>
      [...rows]
        .filter(([k]) => k.startsWith("freight:company:"))
        .map(([, v]) => structuredClone(v)),
  };
}
const rules = {
  versions: Object.fromEntries(SYMBOLS.map((s) => [s, ["test-v1"]])),
  maxAgeSeconds: Object.fromEntries(SYMBOLS.map((s) => [s, 36 * 3600])),
};
function signal(changes = {}) {
  const value = {
    contractVersion: "freightpulse.draft.v2",
    ruleVersion: "freightpulse.cs.rebound-next-4.v1",
    confirmationBarTime: new Date(NOW - 3 * DAY).toISOString(),
    sourceFreshness: "known",
    windowState: "active",
    scriptVersion: "test-v1",
    eventId: "test_1",
    symbol: "CS11!",
    family: "container",
    route: "FBX01",
    timeframe: "1D",
    barTime: new Date(NOW - DAY).toISOString(),
    barCloseTime: new Date(NOW - 3600000).toISOString(),
    barClosed: true,
    signalStatus: "pressure_up",
    windowDay: 2,
    windowStart: new Date(NOW - 2 * DAY).toISOString(),
    sourceUpdatedAt: new Date(NOW - 3600000).toISOString(),
    source: "test-fixture",
    dataMode: "test",
    ...changes,
  };
  if (value.family !== "container") {
    delete value.ruleVersion;
    delete value.confirmationBarTime;
    if (!changes.contractVersion) {
      value.contractVersion = "freightpulse.draft.v1";
      delete value.sourceFreshness;
      delete value.windowState;
    }
  } else if (changes.windowDay === null && !changes.windowState)
    value.windowState = "inactive";
  return value;
}
function setup() {
  let time = NOW;
  const store = memory(),
    mail = [];
  let snapshot = {
    verified: true,
    mode: "test",
    customerId: "cus_freight",
    subscriptionId: "sub_freight",
    status: "active",
    invoicePaid: true,
    periodEnd: new Date(NOW + 30 * DAY).toISOString(),
    cancelAtPeriodEnd: false,
  };
  let failMail = false;
  const stripe = {
    ensureCustomer: async () => ({ id: "cus_freight", livemode: false }),
    checkout: async () => ({
      url: "https://checkout.stripe.com/test_fixture",
      mode: "test",
    }),
    portal: async () => ({
      url: "https://billing.stripe.com/test_fixture",
      mode: "test",
    }),
    snapshot: async () => ({ ...snapshot }),
  };
  const identity = async (token) => {
    if (token !== "verified")
      throw Object.assign(Error("authentication_required"), { status: 401 });
    return "savepulse.cloud@gmail.com";
  };
  const build = () =>
    createFreightService({
      store,
      identity,
      stripe,
      send: async (m) => {
        if (failMail) throw Error("provider unavailable");
        mail.push(m);
        return "test-email-id";
      },
      now: () => time,
      rules,
      enabled: true,
      mailEnabled: true,
    });
  return {
    store,
    mail,
    stripe,
    service: build(),
    build,
    setTime: (t) => (time = t),
    setBilling: (b) => Object.assign(snapshot, b),
    failMail: (b) => (failMail = b),
  };
}
const event = (
  id = "evt_1",
  type = "checkout.session.completed",
  object = { customer: "cus_freight" },
) => ({ id, type, livemode: false, data: { object } });
async function activate(h) {
  await h.service.createCompany("verified", "Test Company");
  await h.service.checkout("verified");
  await h.service.billingEvent(event());
}
test("company membership is independent from verified identity and SavePulse records", async () => {
  const h = setup();
  await h.store.insert("savepulse-subscriber", { version: 1, plan: "pro" });
  await assert.rejects(
    () => h.service.createCompany("email-only", "Test"),
    /authentication_required/,
  );
  const c = await h.service.createCompany("verified", "Test Company");
  assert.equal(c.access, false);
  assert.equal(c.teamPolicy, "pending");
  await assert.rejects(
    () => h.service.report("verified"),
    /freight_membership_required/,
  );
  await activate(h);
  assert.equal((await h.service.account("verified")).access, true);
  assert.deepEqual(await h.store.get("savepulse-subscriber"), {
    version: 1,
    plan: "pro",
  });
  assert.equal(PRICE.amount, 9900);
  assert.equal(PRICE.trialDays, null);
  assert.equal(PRICE.seats, null);
});
test("renewal, failure, recovery and cancel-at-period-end use verified backend state", async () => {
  const h = setup();
  await activate(h);
  const end = NOW + 60 * DAY;
  h.setBilling({ periodEnd: new Date(end).toISOString() });
  await h.service.billingEvent(event("evt_renew", "invoice.paid"));
  assert.equal(
    Date.parse((await h.service.account("verified")).billing.periodEnd),
    end,
  );
  h.setBilling({ status: "past_due", invoicePaid: false });
  await h.service.billingEvent(event("evt_fail", "invoice.payment_failed"));
  await assert.rejects(
    () => h.service.report("verified"),
    /freight_membership_required/,
  );
  h.setBilling({
    status: "active",
    invoicePaid: true,
    cancelAtPeriodEnd: true,
  });
  await h.service.billingEvent(
    event("evt_cancel", "customer.subscription.updated"),
  );
  assert.equal((await h.service.account("verified")).access, true);
  h.setTime(end + 1);
  assert.equal((await h.service.account("verified")).access, false);
  h.setBilling({ status: "canceled" });
  await h.service.billingEvent(
    event("evt_end", "customer.subscription.deleted"),
  );
  assert.equal((await h.service.account("verified")).access, false);
});
test("durable event dedup survives service restart and ignores metadata email/plan", async () => {
  const h = setup();
  await activate(h);
  assert.deepEqual(await h.build().billingEvent(event()), { duplicate: true });
  assert.deepEqual(
    await h.service.billingEvent(
      event("evt_wrong", "checkout.session.completed", {
        customer: "cus_savepulse",
        metadata: {
          service: "freightpulse",
          plan: "business",
          email: "savepulse.cloud@gmail.com",
        },
      }),
    ),
    { ignored: true, reason: "unknown_freight_customer" },
  );
  await assert.rejects(
    () =>
      h.service.billingEvent({ ...event(), id: "evt_live", livemode: true }),
    /test_event_required/,
  );
});
test("failed webhook reconciliation can retry; historical events reconcile current provider snapshot", async () => {
  const h = setup();
  await activate(h);
  const original = h.stripe.snapshot;
  h.stripe.snapshot = async () => {
    throw Error("outage");
  };
  await assert.rejects(
    () => h.service.billingEvent(event("evt_retry")),
    /outage/,
  );
  h.stripe.snapshot = original;
  assert.equal(
    (await h.service.billingEvent(event("evt_retry"))).processed,
    true,
  );
  h.setBilling({ status: "canceled" });
  await h.service.billingEvent(
    event("evt_old", "customer.subscription.created"),
  );
  assert.equal((await h.service.account("verified")).access, false);
});
test("concurrent copies of billing events serialize without duplicate activation", async () => {
  const h = setup();
  await h.service.createCompany("verified", "Test Company");
  await h.service.checkout("verified");
  let release;
  h.stripe.snapshot = () =>
    new Promise((r) => {
      release = () =>
        r({
          verified: true,
          mode: "test",
          customerId: "cus_freight",
          status: "active",
          invoicePaid: true,
          periodEnd: new Date(NOW + DAY).toISOString(),
        });
    });
  const first = h.service.billingEvent(event("evt_race"));
  while (!release) await new Promise((r) => setImmediate(r));
  await assert.rejects(
    () => h.service.billingEvent(event("evt_race")),
    /billing_reconciliation_busy/,
  );
  release();
  await first;
  assert.equal(
    (await h.service.billingEvent(event("evt_race"))).duplicate,
    true,
  );
});
test("container, BDI and ZIM contracts stay distinct and cannot ingest real/unconfirmed bars", () => {
  assert.equal(validateSignal(signal(), NOW, rules).windowDay, 2);
  for (const symbol of ["BDI", "ZIM"]) {
    assert.equal(
      validateSignal(
        signal({
          symbol,
          route: symbol,
          family: symbol === "BDI" ? "bulk" : "context",
          signalStatus: "unclear",
          windowDay: null,
          windowStart: null,
        }),
        NOW,
        rules,
      ).symbol,
      symbol,
    );
  }
  for (const change of [
    { barClosed: false },
    { timeframe: "1h" },
    { symbol: "XAUUSD" },
    { scriptVersion: "unapproved" },
    { sourceUpdatedAt: new Date(NOW + 1).toISOString() },
    { dataMode: "live" },
    { windowDay: 6 },
    { secret_key: "not-allowed" },
  ])
    assert.throws(() => validateSignal(signal(change), NOW, rules));
});
test("simultaneous ingestion, duplicate event IDs and equivalent timezone timestamps cannot overwrite a bar", async () => {
  const h = setup();
  const results = await Promise.all([
    h.service.ingest(signal()),
    h.service.ingest(signal({ eventId: "test_other" })),
  ]);
  assert.equal(results.filter((r) => r.accepted).length, 1);
  assert.equal(
    (
      await h.service.ingest(
        signal({ eventId: "new", barTime: "2026-10-24T12:00:00+00:00" }),
      )
    ).duplicate,
    true,
  );
  await assert.rejects(
    () =>
      h.service.ingest(
        signal({
          eventId: "conflict",
          signalStatus: "easing",
          windowDay: null,
          windowStart: null,
        }),
      ),
    /conflicting_bar/,
  );
  await assert.rejects(
    () =>
      h.service.ingest(
        signal({
          barTime: new Date(NOW - 2 * DAY).toISOString(),
          windowStart: new Date(NOW - 3 * DAY).toISOString(),
          confirmationBarTime: new Date(NOW - 4 * DAY).toISOString(),
        }),
      ),
    /out_of_order_bar/,
  );
});
test("fresh receipt never revives stale source; stale and missing SLA hide signal/window", async () => {
  const h = setup();
  await activate(h);
  await h.service.ingest(
    signal({
      barTime: new Date(NOW - 6 * DAY).toISOString(),
      barCloseTime: new Date(NOW - 5 * DAY).toISOString(),
      sourceUpdatedAt: new Date(NOW - 5 * DAY).toISOString(),
      windowStart: new Date(NOW - 7 * DAY).toISOString(),
      confirmationBarTime: new Date(NOW - 8 * DAY).toISOString(),
    }),
  );
  const row = (await h.service.report("verified")).routes[0];
  assert.equal(row.dataStatus, "stale");
  assert.equal(row.signalStatus, null);
  assert.equal(row.windowDay, null);
  assert.equal(Date.parse(row.receivedAt), NOW);
  assert.equal(
    signalView(signal(), NOW).dataStatus,
    "freshness_policy_pending",
  );
  assert.equal(signalView(null, NOW, 36 * 3600).dataStatus, "missing");
});
test("demo stream never appears as paid test data", async () => {
  const h = setup();
  await activate(h);
  await h.service.ingest(signal({ dataMode: "demo" }));
  assert.equal(
    (await h.service.report("verified")).routes[0].dataStatus,
    "missing",
  );
});
test("preferences, email retry, durable duplicate prevention and stable provider key", async () => {
  const h = setup();
  await activate(h);
  await h.service.ingest(signal());
  h.store.rows.get("freight:signal:test:CS11!").ruleVersion =
    "legacy-worker-fixture-only";
  await h.service.preferences("verified", { routes: ["CS11!"], email: true });
  h.failMail(true);
  assert.deepEqual(await h.service.notifications(), { sent: 0, failed: 1 });
  h.failMail(false);
  assert.equal((await h.service.notifications()).sent, 0);
  h.setTime(NOW + 900001);
  assert.equal((await h.service.notifications()).sent, 1);
  assert.equal((await h.build().notifications()).sent, 0);
  assert.equal(h.mail.length, 1);
  assert.equal(h.mail[0].email, "savepulse.cloud@gmail.com");
  assert.match(h.mail[0].subject, /\[TEST\]/);
  assert.match(h.mail[0].idempotencyKey, /^freight-/);
  assert.equal((await h.service.report("verified")).history.length, 1);
  await h.service.preferences("verified", { routes: [], email: false });
  assert.equal((await h.service.notifications()).sent, 0);
});
test("ambiguous send older than provider idempotency retention requires review", async () => {
  const h = setup();
  await activate(h);
  await h.service.ingest(signal());
  h.store.rows.get("freight:signal:test:CS11!").ruleVersion =
    "legacy-worker-fixture-only";
  await h.service.preferences("verified", { routes: ["CS11!"], email: true });
  h.failMail(true);
  await h.service.notifications();
  h.setTime(NOW + 24 * 3600000);
  h.failMail(false);
  assert.equal((await h.service.notifications()).sent, 0);
  assert.equal(h.mail.length, 0);
  assert.equal(
    [...h.store.rows].find(([k]) => k.startsWith("freight:mail:"))[1].status,
    "needs_review",
  );
});
test("disabled service and live Stripe configuration fail closed", async () => {
  const h = setup();
  const disabled = createFreightService({
    store: h.store,
    identity: async () => "",
  });
  await assert.rejects(
    () => disabled.account("verified"),
    /freight_sandbox_disabled/,
  );
  assert.equal(
    createFreightStripe({
      env: { FREIGHT_STRIPE_SECRET_KEY: "sk_live_fixture" },
    }),
    null,
  );
});
test("another verified company cannot borrow FreightPulse access, portal or settings", async () => {
  const h = setup();
  await activate(h);
  const other = createFreightService({
    store: h.store,
    identity: async () => "another@example.invalid",
    stripe: h.stripe,
    enabled: true,
    rules,
    now: () => NOW,
  });
  assert.equal(await other.account("other-verified"), null);
  await other.createCompany("other-verified", "Another Company");
  await assert.rejects(
    () => other.report("other-verified"),
    /freight_membership_required/,
  );
  await assert.rejects(
    () => other.portal("other-verified"),
    /billing_not_configured/,
  );
  await other.preferences("other-verified", { routes: ["CS21!"], email: true });
  assert.deepEqual((await h.service.account("verified")).preferences, {
    routes: [],
    email: false,
  });
});
function stripeFixture() {
  const calls = [];
  let amount = 9900,
    paid = true;
  const config = {
    livemode: false,
    active: true,
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: { enabled: false },
    },
  };
  const sub = {
    id: "sub_1",
    customer: "cus_1",
    livemode: false,
    status: "active",
    items: {
      data: [
        {
          price: { id: "price_1" },
          quantity: 1,
          current_period_end: (NOW + DAY) / 1000,
        },
      ],
    },
    latest_invoice: { status: "paid" },
    cancel_at_period_end: false,
  };
  const client = {
    prices: {
      retrieve: async () => ({
        livemode: false,
        active: true,
        currency: "usd",
        unit_amount: amount,
        recurring: {
          interval: "month",
          interval_count: 1,
          usage_type: "licensed",
        },
        product: "prod_1",
      }),
    },
    products: {
      retrieve: async () => ({
        livemode: false,
        active: true,
        metadata: { service: "freightpulse" },
      }),
    },
    customers: {
      create: async (...args) => {
        calls.push(["customer", ...args]);
        return { id: "cus_1", livemode: false };
      },
      retrieve: async () => ({
        livemode: false,
        metadata: { service: "freightpulse" },
      }),
    },
    checkout: {
      sessions: {
        list: async () => ({ data: [] }),
        create: async (p, options) => {
          calls.push(["checkout", p, options]);
          return { url: "https://checkout.stripe.com/test_fixture" };
        },
      },
    },
    billingPortal: {
      configurations: { retrieve: async () => config },
      sessions: {
        create: async (p) => {
          calls.push(["portal", p]);
          return { url: "https://billing.stripe.com/test_fixture" };
        },
      },
    },
    subscriptions: {
      list: async () => ({ data: [sub] }),
      retrieve: async () => ({
        ...sub,
        latest_invoice: { status: paid ? "paid" : "open" },
      }),
    },
  };
  const env = {
    FREIGHT_STRIPE_SECRET_KEY: "sk_test_fixture",
    FREIGHT_STRIPE_PRICE_ID: "price_1",
    FREIGHT_STRIPE_PRODUCT_ID: "prod_1",
    FREIGHT_STRIPE_PORTAL_CONFIG_ID: "bpc_1",
    FREIGHT_APP_BASE_URL: "http://127.0.0.1:3000",
  };
  return {
    adapter: createFreightStripe({ env, client }),
    calls,
    config,
    amount: (v) => (amount = v),
    paid: (v) => (paid = v),
    client,
    env,
  };
}
test("Stripe adapter validates separate USD 99 product/price before hosted sandbox checkout", async () => {
  const s = stripeFixture();
  const company = {
    id: "co_test",
    ownerEmail: "savepulse.cloud@gmail.com",
    name: "Test Co",
    customerId: "cus_1",
    checkoutAttempt: { id: "attempt-1", tag: "abcdefgh" },
  };
  await s.adapter.checkout(company);
  const params = s.calls.find((x) => x[0] === "checkout")[1];
  assert.deepEqual(params.line_items, [{ price: "price_1", quantity: 1 }]);
  assert.equal(params.subscription_data.trial_period_days, undefined);
  assert.equal(params.allow_promotion_codes, undefined);
  assert.equal(params.payment_method_types, undefined);
  assert.equal(params.metadata.service, "freightpulse");
  assert.equal(
    s.calls.find((x) => x[0] === "checkout")[2].idempotencyKey,
    "freight-checkout-attempt-1",
  );
  assert.match(params.custom_text.submit.message, /Tax policy/);
  await s.adapter.portal(company);
  assert.equal(s.calls.find((x) => x[0] === "portal")[1].customer, "cus_1");
  s.amount(5900);
  await assert.rejects(
    () => s.adapter.checkout(company),
    /freight_price_mismatch/,
  );
});
test("Stripe adapter uses current invoice state and fixed portal cancellation configuration", async () => {
  const s = stripeFixture();
  assert.equal(
    (await s.adapter.snapshot("cus_1", { object: "subscription", id: "sub_1" }))
      .invoicePaid,
    true,
  );
  s.paid(false);
  assert.equal(
    (
      await s.adapter.snapshot("cus_1", {
        object: "invoice",
        subscription: "sub_1",
      })
    ).invoicePaid,
    false,
  );
  s.config.features.subscription_cancel.mode = "immediately";
  await assert.rejects(
    () => s.adapter.portal({ customerId: "cus_1" }),
    /freight_portal_configuration_mismatch/,
  );
});

test("concurrent checkout requests share a persisted idempotency attempt", async () => {
  const h = setup();
  await h.service.createCompany("verified", "Test Company");
  const attempts = [];
  h.stripe.checkout = async (c) => {
    attempts.push(c.checkoutAttempt.id);
    return { url: "https://checkout.stripe.com/test_fixture", mode: "test" };
  };
  await Promise.all([
    h.service.checkout("verified"),
    h.service.checkout("verified"),
  ]);
  assert.equal(new Set(attempts).size, 1);
  await h.build().checkout("verified");
  assert.equal(new Set(attempts).size, 1);
});

test("existing open checkout is rechecked against the FreightPulse price before redirect", async () => {
  const s = stripeFixture();
  s.client.checkout.sessions.list = async () => ({
    data: [
      {
        id: "cs_test",
        livemode: false,
        url: "https://checkout.stripe.com/test_fixture",
        metadata: { service: "freightpulse", company_id: "co_test" },
      },
    ],
  });
  s.client.checkout.sessions.listLineItems = async () => ({
    data: [{ price: { id: "price_wrong" }, quantity: 1 }],
  });
  await assert.rejects(
    () => s.adapter.checkout({ id: "co_test", customerId: "cus_1" }),
    /freight_checkout_price_mismatch/,
  );
});

test("container route metadata preserves the six directional FBX benchmarks", () => {
  const routes = require("../public/freightpulse/routes");
  assert.deepEqual(
    Object.values(routes).map((r) => r.benchmark),
    ["FBX01", "FBX02", "FBX03", "FBX11", "FBX12", "FBX13"],
  );
  assert.equal(routes["CS21!"].name, "U.S. West Coast → China / East Asia");
  assert.equal(routes["CS51!"].name, "North Europe → China / East Asia");
  assert.equal(routes.BDI, undefined);
  assert.equal(routes.ZIM, undefined);
});

function signalV2(changes = {}) {
  return signal({
    contractVersion: "freightpulse.draft.v2",
    symbol: "NYMEX:CS11!",
    route: "FBX01",
    sourceFreshness: "known",
    windowState: "active",
    ...changes,
  });
}
test("v2 accepts unknown publisher freshness without granting current status", async () => {
  const s = validateSignal(
    signalV2({ sourceUpdatedAt: null, sourceFreshness: "unknown" }),
    NOW,
    rules,
  );
  assert.equal(s.symbol, "CS11!");
  const view = signalView(s, NOW, 36 * 3600);
  assert.equal(view.dataStatus, "source_freshness_unknown");
  assert.equal(view.current, false);
  assert.equal(view.signalStatus, null);
  assert.equal(view.windowDay, null);
  const h = setup();
  await activate(h);
  await h.service.preferences("verified", { routes: ["CS11!"], email: true });
  await h.service.ingest(
    signalV2({ sourceUpdatedAt: null, sourceFreshness: "unknown" }),
  );
  assert.deepEqual(await h.service.notifications(), { sent: 0, failed: 0 });
  assert.equal(h.mail.length, 0);
  assert.equal(
    (
      await h.service.ingest(
        signalV2({
          eventId: "another-id",
          sourceUpdatedAt: null,
          sourceFreshness: "unknown",
        }),
      )
    ).duplicate,
    true,
  );
});
test("publisher time can precede daily bar close and expiry does not imply easing", () => {
  const s = validateSignal(
    signalV2({
      sourceUpdatedAt: new Date(NOW - 2 * 3600000).toISOString(),
      windowState: "expired",
      windowDay: null,
      windowStart: null,
    }),
    NOW,
    rules,
  );
  assert.equal(signalView(s, NOW, 36 * 3600).signalStatus, "pressure_up");
  assert.equal(s.windowState, "expired");
  assert.equal(s.windowDay, null);
});
test("v2 rejects wrong exchange, wrong route, future source and invalid windows", () => {
  for (const changes of [
    { symbol: "FAKE:CS11!" },
    { route: "FBX02" },
    { sourceFreshness: "unknown" },
    { sourceUpdatedAt: null, sourceFreshness: "known" },
    { sourceUpdatedAt: new Date(NOW + 1).toISOString() },
    { windowState: "expired" },
    { windowState: "active", windowDay: 6 },
  ])
    assert.throws(() => validateSignal(signalV2(changes), NOW, rules));
  const bdi = validateSignal(
    signalV2({
      symbol: "INDEX:BDI",
      route: null,
      family: "bulk",
      windowState: "inactive",
      windowDay: null,
      windowStart: null,
    }),
    NOW,
    rules,
  );
  assert.equal(bdi.symbol, "BDI");
});

test("new CS window accepts days 1–4 only and excludes the confirmation bar", () => {
  for (let day = 1; day <= 4; day++) {
    const bar = new Date(NOW - DAY).toISOString();
    const start = new Date(NOW - day * DAY).toISOString();
    const s = validateSignal(
      signal({
        windowDay: day,
        windowStart: start,
        confirmationBarTime: new Date(NOW - (day + 1) * DAY).toISOString(),
        barTime: bar,
      }),
      NOW,
      rules,
    );
    assert.equal(s.windowDay, day);
  }
  for (const change of [
    { windowDay: 5 },
    { ruleVersion: "old-five-bar-rule" },
    { contractVersion: "freightpulse.draft.v1" },
    { confirmationBarTime: new Date(NOW - 2 * DAY).toISOString() },
    { windowDay: 1 },
  ])
    assert.throws(() => validateSignal(signal(change), NOW, rules));
});
test("single-cycle reference waits through flat bars and starts next available daily bar", () => {
  const { firstCsWindow } = require("../src/freightCsDemoRule");
  const offsets = [0, 1, 2, 5, 6, 9, 10, 11, 14, 15, 16];
  const closes = [100, 99, 99, 98, 100, 99, 98, 101, 102, 90, 110];
  const bars = offsets.map((n, i) => ({
    time: new Date(NOW + n * DAY).toISOString(),
    close: closes[i],
    closed: true,
  }));
  const rows = firstCsWindow(bars);
  assert.equal(rows[4].confirmationBarTime, bars[4].time);
  assert.equal(rows[4].windowDay, null);
  assert.deepEqual(
    rows.slice(5, 9).map((x) => x.windowDay),
    [1, 2, 3, 4],
  );
  assert.equal(rows[5].windowStart, bars[5].time);
  assert.equal(rows[9].windowState, "expired");
  assert.equal(rows[10].windowState, "expired"); // restart remains undecided
  assert.throws(() => firstCsWindow([{ ...bars[0], closed: false }]));
  assert.throws(() => firstCsWindow([bars[1], bars[0]]));
});
test("approved CS wording is shared with notification previews and never sends actual email", async () => {
  const { csWindowCopy } = require("../public/freightpulse/cs-window-copy");
  for (let day = 1; day <= 4; day++) {
    const copy = csWindowCopy(signal({ windowDay: day }));
    assert.equal(copy.en, `Favourable Rate-Locking Window — Day ${day} of 4`);
    assert.match(copy.th, new RegExp(`${day}/4$`));
  }
  const ended = csWindowCopy(
    signal({ windowState: "expired", windowDay: null, windowStart: null }),
  );
  assert.equal(ended.en, "Rate-Locking Window Ended");
  const h = setup();
  await activate(h);
  await h.service.preferences("verified", { routes: ["CS11!"], email: true });
  await h.service.ingest(signal());
  assert.deepEqual(await h.service.notifications(), { sent: 0, failed: 0 });
  assert.equal(h.mail.length, 0);
  assert.equal(csWindowCopy({ ruleVersion: "old" }), null);
});

test("demo includes next-four active and ended windows while BDI/ZIM remain context fixtures", () => {
  const report = require("../src/freightDemo").demoReport(NOW);
  assert.equal(report.routes[0].windowDay, 2);
  assert.equal(
    report.routes[0].ruleVersion,
    "freightpulse.cs.rebound-next-4.v1",
  );
  assert.ok(
    Date.parse(report.routes[0].confirmationBarTime) <
      Date.parse(report.routes[0].windowStart),
  );
  assert.equal(report.routes[3].windowState, "expired");
  assert.equal(report.routes[3].signalStatus, "pressure_up");
  assert.equal(report.routes[3].windowDay, null);
  assert.equal(report.notificationPreview.sent, false);
  assert.equal(
    report.notificationPreview.en,
    "Favourable Rate-Locking Window — Day 2 of 4",
  );
  assert.deepEqual(
    report.context.map((x) => x.symbol),
    ["BDI", "ZIM"],
  );
  assert.ok(
    report.context.every(
      (x) => x.ruleVersion === undefined && x.windowDay === null,
    ),
  );
});

test("BDI and ZIM have distinct bilingual context copy without CS windows", () => {
  const {
    contextCopy,
    contextView,
  } = require("../public/freightpulse/context-copy");
  const expected = {
    BDI: [
      "Dry Bulk Market Strengthening",
      "Dry Bulk Market Softening",
      "Dry Bulk Market Direction Unclear",
    ],
    ZIM: [
      "Positive Shipping Equity Signal",
      "Weakening Shipping Equity Signal",
      "Shipping Equity Signal Unclear",
    ],
  };
  for (const symbol of ["BDI", "ZIM"]) {
    ["pressure_up", "easing", "unclear"].forEach((signalStatus, i) => {
      const row = {
        symbol,
        dataMode: "demo",
        current: true,
        dataStatus: "current",
        signalStatus,
        windowDay: 2,
        windowState: "active",
        windowStart: "invalid-context-window",
      };
      assert.equal(contextCopy(row).statusEn, expected[symbol][i]);
      const view = contextView(row);
      assert.equal(view.windowDay, null);
      assert.equal(view.windowState, null);
      assert.equal(view.windowStart, null);
      const raw = contextView({ ...row, dataMode: "test" });
      assert.equal(raw.current, false);
      assert.equal(raw.signalStatus, null);
      assert.equal(raw.dataStatus, "assessment_pending");
      assert.equal(contextCopy({ ...row, dataMode: "test" }).statusTh, null);
    });
    for (const dataStatus of [
      "stale",
      "missing",
      "source_freshness_unknown",
      "freshness_policy_pending",
    ]) {
      const row = {
        symbol,
        dataMode: "demo",
        current: false,
        dataStatus,
        signalStatus: null,
      };
      assert.equal(contextCopy(row).statusEn, null);
      assert.equal(
        contextView({ ...row, dataMode: "test" }).dataStatus,
        dataStatus,
      );
    }
    for (const signalStatus of ["BUY", "SELL"]) {
      assert.equal(
        contextView({
          symbol,
          dataMode: "demo",
          current: true,
          dataStatus: "current",
          signalStatus,
        }).current,
        false,
      );
      assert.equal(
        contextCopy({ symbol, dataMode: "demo", current: true, signalStatus })
          .statusTh,
        null,
      );
    }
  }
  const cs = { symbol: "CS11!", current: true, windowDay: 2 };
  assert.deepEqual(contextView(cs), cs);
});
test("member report never publishes unapproved BDI/ZIM assessments even with fresh test inputs", async () => {
  const h = setup();
  await activate(h);
  for (const symbol of ["BDI", "ZIM"])
    await h.service.ingest(
      signal({
        symbol,
        route: symbol,
        family: symbol === "BDI" ? "bulk" : "context",
        signalStatus: "pressure_up",
        windowDay: null,
        windowStart: null,
      }),
    );
  const rows = (await h.service.report("verified")).context;
  assert.ok(
    rows.every(
      (x) =>
        x.current === false &&
        x.signalStatus === null &&
        x.windowDay === null &&
        x.assessmentStatus === "not_enabled",
    ),
  );
});

test("confirmed lower-close stop retains the falling day highlight but invalidates its closing payload", () => {
  const { firstCsWindow } = require("../src/freightCsDemoRule");
  const bars = [100, 99, 101, 100, 105, 110].map((close, i) => ({
    time: new Date(NOW + i * DAY).toISOString(),
    close,
    closed: true,
  }));
  const rows = firstCsWindow(bars, { stopOnLowerClose: true });
  assert.equal(rows[2].windowDay, null); // confirmation excluded
  assert.equal(rows[3].highlightDay, 1);
  assert.equal(rows[3].windowState, "invalidated");
  assert.equal(rows[3].windowDay, null);
  assert.equal(rows[4].windowState, "invalidated"); // no inferred restart
  const payload = signal({
    ruleVersion: rows[3].ruleVersion,
    windowState: "invalidated",
    windowDay: null,
    windowStart: null,
  });
  assert.equal(validateSignal(payload, NOW, rules).windowState, "invalidated");
});

test("approved restart waits from the invalidating lower close and excludes each new confirmation", () => {
  const { firstCsWindow } = require("../src/freightCsDemoRule");
  const closes = [100, 99, 101, 100, 100, 98, 102, 103, 102, 104, 105];
  const bars = closes.map((close, i) => ({
    time: new Date(NOW + i * DAY).toISOString(),
    close,
    closed: true,
  }));
  const rows = firstCsWindow(bars, {
    stopOnLowerClose: true,
    restartAfterInvalidation: true,
  });
  assert.equal(rows[3].windowState, "invalidated");
  assert.equal(rows[3].highlightDay, 1);
  assert.equal(rows[4].confirmationBarTime, null); // flat close: keep waiting
  assert.equal(rows[5].confirmationBarTime, null); // further decline: keep waiting
  assert.equal(rows[6].confirmationBarTime, bars[6].time);
  assert.equal(rows[6].windowDay, null);
  assert.equal(rows[7].windowDay, 1);
  assert.equal(rows[7].windowStart, bars[7].time);
  assert.equal(rows[8].windowState, "invalidated");
  assert.equal(rows[8].highlightDay, 2);
  assert.equal(rows[9].confirmationBarTime, bars[9].time);
  assert.equal(rows[9].windowDay, null);
  assert.equal(rows[10].windowDay, 1);
  assert.equal(
    rows[10].ruleVersion,
    "freightpulse.cs.rebound-next-4.lower-close-restart.v1",
  );
  assert.equal(
    validateSignal(signal({ ruleVersion: rows[10].ruleVersion }), NOW, rules)
      .ruleVersion,
    rows[10].ruleVersion,
  );
});
test("restart approval does not invent a new cycle after normal expiry", () => {
  const { firstCsWindow } = require("../src/freightCsDemoRule");
  const rows = firstCsWindow(
    [100, 99, 101, 102, 103, 104, 105, 106, 100, 110].map((close, i) => ({
      time: new Date(NOW + i * DAY).toISOString(),
      close,
      closed: true,
    })),
    { stopOnLowerClose: true, restartAfterInvalidation: true },
  );
  assert.deepEqual(
    rows.slice(3, 7).map((x) => x.windowDay),
    [1, 2, 3, 4],
  );
  assert.ok(
    rows
      .slice(7)
      .every((x) => x.windowState === "expired" && x.windowDay === null),
  );
});
