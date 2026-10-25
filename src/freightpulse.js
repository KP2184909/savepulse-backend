"use strict";
const crypto = require("node:crypto");
const { createTrialStore } = require("./trialLifecycle");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fail = (code, status = 422) => Object.assign(new Error(code), { status });
const ROUTES = require("../public/freightpulse/routes");
const CONTAINERS = ["CS11!", "CS21!", "CS31!", "CS41!", "CS51!", "CS61!"];
const SYMBOLS = [...CONTAINERS, "BDI", "ZIM"];
const STATES = ["pressure_up", "easing", "unclear"];
const CS_RULE_VERSION = "freightpulse.cs.rebound-next-4.v1";
const PRICE = Object.freeze({
  service: "freightpulse",
  amount: 9900,
  currency: "usd",
  interval: "month",
  unit: "company",
  availability: "sandbox_only",
  seats: null,
  trialDays: null,
  discounts: null,
  tax: "decision_required",
});
function family(symbol) {
  return CONTAINERS.includes(symbol)
    ? "container"
    : symbol === "BDI"
      ? "bulk"
      : "context";
}
function createFreightStore(env = process.env, fetchImpl = globalThis.fetch) {
  const base = createTrialStore(env, fetchImpl);
  return {
    ...base,
    async listCompanies() {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const response = await fetchImpl(
          `${env.SUPABASE_URL}/rest/v1/scheduler_state?key=like.freight:company:*&select=value&order=key&offset=${offset}&limit=1000`,
          {
            signal: AbortSignal.timeout(15000),
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
          },
        );
        if (!response.ok) throw fail("freight_storage_unavailable", 503);
        const page = await response.json();
        rows.push(...page.map((r) => r.value));
        if (page.length < 1000) return rows;
      }
    },
  };
}
function validateSignal(input, now, rules) {
  const v2 = input?.contractVersion === "freightpulse.draft.v2";
  const fields = [
    "contractVersion",
    "scriptVersion",
    "eventId",
    "symbol",
    "family",
    "route",
    "timeframe",
    "barTime",
    "barCloseTime",
    "barClosed",
    "signalStatus",
    "windowDay",
    "windowStart",
    "sourceUpdatedAt",
    "source",
    "dataMode",
    "ruleVersion",
    "confirmationBarTime",
    ...(v2 ? ["sourceFreshness", "windowState"] : []),
  ];
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !fields.includes(k))
  )
    throw fail("invalid_payload_fields");
  if (
    !["freightpulse.draft.v1", "freightpulse.draft.v2"].includes(
      input.contractVersion,
    ) ||
    !["demo", "test"].includes(input.dataMode)
  )
    throw fail("real_feed_contract_not_approved", 503);
  // Normalize only explicitly mapped instruments; never strip arbitrary exchanges.
  const qualified = Object.fromEntries(
    CONTAINERS.map((s) => [`NYMEX:${s}`, s]),
  );
  Object.assign(qualified, { "INDEX:BDI": "BDI", "NYSE:ZIM": "ZIM" });
  if (v2) input = { ...input, symbol: qualified[input.symbol] || input.symbol };
  if (
    !SYMBOLS.includes(input.symbol) ||
    input.family !== family(input.symbol) ||
    input.route !==
      (v2 ? ROUTES[input.symbol]?.benchmark || null : input.symbol)
  )
    throw fail("symbol_route_family_mismatch");
  if (
    typeof input.scriptVersion !== "string" ||
    !rules.versions?.[input.symbol]?.includes(input.scriptVersion)
  )
    throw fail("script_version_not_approved");
  if (input.timeframe !== "1D" || input.barClosed !== true)
    throw fail("closed_daily_bar_required");
  if (
    input.family === "container" &&
    (!v2 || input.ruleVersion !== CS_RULE_VERSION)
  )
    throw fail("cs_rule_version_required");
  for (const k of ["eventId", "source"])
    if (
      typeof input[k] !== "string" ||
      !/^[A-Za-z0-9_:./! -]{1,120}$/.test(input[k])
    )
      throw fail("invalid_signal_identifier");
  const unknownSource =
    v2 && input.sourceUpdatedAt === null && input.sourceFreshness === "unknown";
  if (v2 && !unknownSource && input.sourceFreshness !== "known")
    throw fail("invalid_source_freshness");
  for (const k of [
    "barTime",
    "barCloseTime",
    ...(unknownSource ? [] : ["sourceUpdatedAt"]),
  ])
    if (
      typeof input[k] !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        input[k],
      )
    )
      throw fail("iso_timestamp_required");
  const bar = Date.parse(input.barTime),
    close = Date.parse(input.barCloseTime),
    source = Date.parse(input.sourceUpdatedAt);
  if (
    ![bar, close, ...(unknownSource ? [] : [source])].every(Number.isFinite) ||
    bar >= close ||
    close > now ||
    (!unknownSource && source > now)
  )
    throw fail("invalid_source_or_bar_time");
  if (!STATES.includes(input.signalStatus)) throw fail("invalid_signal_status");
  if (
    v2 &&
    !["inactive", "active", "expired", "invalidated"].includes(
      input.windowState,
    )
  )
    throw fail("invalid_window_state");
  if (v2 && input.family !== "container" && input.windowState !== "inactive")
    throw fail("window_not_applicable");
  const hasWindow =
    input.family === "container" &&
    (v2
      ? input.windowState === "active"
      : input.signalStatus === "pressure_up");
  if (hasWindow) {
    if (
      !Number.isInteger(input.windowDay) ||
      input.windowDay < 1 ||
      input.windowDay > 4 ||
      !Number.isFinite(Date.parse(input.windowStart)) ||
      Date.parse(input.windowStart) > bar ||
      typeof input.confirmationBarTime !== "string" ||
      !Number.isFinite(Date.parse(input.confirmationBarTime)) ||
      Date.parse(input.confirmationBarTime) >= Date.parse(input.windowStart) ||
      (input.windowDay === 1 && Date.parse(input.windowStart) !== bar) ||
      (input.windowDay > 1 && Date.parse(input.windowStart) >= bar)
    )
      throw fail("invalid_window");
  } else if (input.windowDay !== null || input.windowStart !== null)
    throw fail("window_not_applicable");
  const clean = Object.fromEntries(fields.map((k) => [k, input[k]]));
  if (
    input.confirmationBarTime != null &&
    (!Number.isFinite(Date.parse(input.confirmationBarTime)) ||
      Date.parse(input.confirmationBarTime) > bar)
  )
    throw fail("invalid_confirmation_time");
  for (const k of [
    "barTime",
    "barCloseTime",
    "sourceUpdatedAt",
    "windowStart",
    "confirmationBarTime",
  ])
    if (clean[k] != null) clean[k] = new Date(clean[k]).toISOString();
  return clean;
}
function signalView(signal, now, maxAgeSeconds) {
  if (!signal)
    return {
      dataStatus: "missing",
      current: false,
      signalStatus: null,
      windowDay: null,
    };
  const configured = Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0;
  const sourceKnown =
    typeof signal.sourceUpdatedAt === "string" &&
    Number.isFinite(Date.parse(signal.sourceUpdatedAt));
  const age = now - Date.parse(signal.sourceUpdatedAt);
  const current =
    configured &&
    sourceKnown &&
    age >= 0 &&
    age <= maxAgeSeconds * 1000 &&
    now - Date.parse(signal.barCloseTime) <= maxAgeSeconds * 1000;
  return {
    ...signal,
    current,
    dataStatus: !sourceKnown
      ? "source_freshness_unknown"
      : !configured
        ? "freshness_policy_pending"
        : current
          ? "current"
          : "stale",
    signalStatus: current ? signal.signalStatus : null,
    windowState: current ? signal.windowState || null : null,
    windowDay: current ? signal.windowDay : null,
    windowStart: current ? signal.windowStart : null,
  };
}
function hasAccess(company, now) {
  return Boolean(
    company?.billing?.verified &&
    company.billing.mode === "test" &&
    company.billing.status === "active" &&
    company.billing.invoicePaid &&
    Date.parse(company.billing.periodEnd) > now,
  );
}
function createFreightService({
  store,
  identity,
  stripe,
  send,
  now = Date.now,
  rules = {},
  enabled = false,
  mailEnabled = false,
}) {
  async function mutate(key, change) {
    for (let n = 0; n < 12; n++) {
      const old = await store.get(key),
        next = await change(old);
      if (next === null) return old;
      next.version = (old?.version || 0) + 1;
      if (
        old
          ? await store.cas(key, old.version, next)
          : await store.insert(key, next)
      )
        return next;
    }
    throw fail("freight_busy_retry", 409);
  }
  const companyId = (email) => `co_${hash(email.toLowerCase()).slice(0, 32)}`;
  async function owner(token, required = true) {
    if (!enabled) throw fail("freight_sandbox_disabled", 503);
    const email = await identity(token),
      id = companyId(email),
      company = await store.get(`freight:company:${id}`);
    if (required && !company) throw fail("company_setup_required", 409);
    return { email, id, company };
  }
  const accountView = (company) =>
    company
      ? {
          id: company.id,
          name: company.name,
          preferences: company.preferences,
          billing: company.billing
            ? {
                status: company.billing.status,
                periodEnd: company.billing.periodEnd,
                cancelAtPeriodEnd: company.billing.cancelAtPeriodEnd,
              }
            : null,
          access: hasAccess(company, now()),
          mode: "test",
          price: PRICE,
          teamPolicy: "pending",
        }
      : null;
  async function account(token) {
    return accountView((await owner(token, false)).company);
  }
  async function createCompany(token, name) {
    if (typeof name !== "string" || name.trim().length < 2 || name.length > 120)
      throw fail("company_name_required");
    const { email, id } = await owner(token, false);
    const result = await mutate(`freight:company:${id}`, (old) =>
      old
        ? null
        : {
            id,
            name: name.trim(),
            ownerEmail: email,
            preferences: { routes: [], email: false },
            createdAt: new Date(now()).toISOString(),
            billing: null,
            events: [],
          },
    );
    return accountView(result);
  }
  async function preferences(token, input) {
    const { id } = await owner(token);
    if (
      !Array.isArray(input.routes) ||
      input.routes.some((s) => !CONTAINERS.includes(s)) ||
      typeof input.email !== "boolean"
    )
      throw fail("invalid_preferences");
    return accountView(
      await mutate(`freight:company:${id}`, (old) => ({
        ...old,
        preferences: { routes: [...new Set(input.routes)], email: input.email },
      })),
    );
  }
  async function checkout(token) {
    const { company, id } = await owner(token);
    if (!stripe) throw fail("stripe_sandbox_not_configured", 503);
    if (hasAccess(company, now()) || company.billing?.subscriptionId)
      throw fail("use_billing_portal", 409);
    const customer = await stripe.ensureCustomer(company);
    if (!/^cus_[A-Za-z0-9_]+$/.test(customer.id) || customer.livemode !== false)
      throw fail("stripe_test_customer_required", 503);
    await mutate(`freight:company:${id}`, (old) => {
      if (old.customerId && old.customerId !== customer.id)
        throw fail("customer_binding_conflict", 409);
      return { ...old, customerId: customer.id };
    });
    const bound = await mutate(`freight:customer:${customer.id}`, (old) => {
      if (old && old.companyId !== id)
        throw fail("customer_binding_conflict", 409);
      return old ? null : { companyId: id };
    });
    if (bound.companyId !== id) throw fail("customer_binding_conflict", 409);
    const prepared = await mutate(`freight:company:${id}`, (old) => {
      if (hasAccess(old, now()) || old.billing?.subscriptionId)
        throw fail("use_billing_portal", 409);
      if (old.checkoutAttempt) return null;
      return {
        ...old,
        checkoutAttempt: {
          id: crypto.randomUUID(),
          tag: Array.from(crypto.randomBytes(8), (n) =>
            String.fromCharCode(97 + (n % 26)),
          ).join(""),
        },
      };
    });
    return stripe.checkout(prepared);
  }
  async function portal(token) {
    const { company } = await owner(token);
    if (!stripe || !company.customerId)
      throw fail("billing_not_configured", 409);
    return stripe.portal(company);
  }
  async function billingEvent(event) {
    if (!enabled || !stripe) throw fail("stripe_sandbox_not_configured", 503);
    if (event.livemode !== false || !/^evt_[A-Za-z0-9_]+$/.test(event.id || ""))
      throw fail("test_event_required");
    if (
      ![
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "invoice.payment_failed",
      ].includes(event.type)
    )
      return { ignored: true };
    const object = event.data?.object || {},
      customerId =
        typeof object.customer === "string"
          ? object.customer
          : object.customer?.id;
    const binding =
      customerId && (await store.get(`freight:customer:${customerId}`));
    if (!binding) return { ignored: true, reason: "unknown_freight_customer" };
    const key = `freight:company:${binding.companyId}`,
      lease = crypto.randomUUID();
    let duplicate = false;
    await mutate(key, (old) => {
      if (old.events.includes(event.id)) {
        duplicate = true;
        return null;
      }
      if (old.lease?.until > now())
        throw fail("billing_reconciliation_busy", 409);
      return { ...old, lease: { id: lease, until: now() + 120000 } };
    });
    if (duplicate) return { duplicate: true };
    try {
      // Resolve through Stripe's customer/subscription graph, never email or metadata.plan.
      const company = await store.get(key),
        snapshot = await stripe.snapshot(
          customerId,
          object,
          company.billing?.subscriptionId,
        );
      if (snapshot.customerId !== customerId || snapshot.mode !== "test")
        throw fail("stripe_binding_mismatch", 409);
      await mutate(key, (old) => {
        if (old.lease?.id !== lease || old.lease.until <= now())
          throw fail("billing_lease_expired", 409);
        return {
          ...old,
          billing: snapshot,
          events: [...old.events, event.id],
          lease: null,
        };
      });
      return { processed: true };
    } catch (error) {
      await mutate(key, (old) =>
        old.lease?.id === lease ? { ...old, lease: null } : null,
      );
      throw error;
    }
  }
  async function ingest(input) {
    if (!enabled) throw fail("freight_sandbox_disabled", 503);
    const signal = validateSignal(input, now(), rules),
      key = `freight:signal:${signal.dataMode}:${signal.symbol}`;
    const fingerprint = hash(JSON.stringify({ ...signal, eventId: null }));
    let duplicate = false;
    await mutate(key, (old) => {
      if (old && Date.parse(signal.barTime) < Date.parse(old.barTime))
        throw fail("out_of_order_bar", 409);
      if (old && signal.barTime === old.barTime) {
        if (old.fingerprint !== fingerprint) throw fail("conflicting_bar", 409);
        duplicate = true;
        return null;
      }
      return {
        ...signal,
        fingerprint,
        receivedAt: new Date(now()).toISOString(),
      };
    });
    return { accepted: !duplicate, duplicate, dataMode: signal.dataMode };
  }
  async function report(token) {
    const { company } = await owner(token);
    if (!hasAccess(company, now()))
      throw fail("freight_membership_required", 403);
    const views = await Promise.all(
      SYMBOLS.map(async (symbol) => ({
        symbol,
        family: family(symbol),
        routeInfo: ROUTES[symbol] || null,
        ...signalView(
          await store.get(`freight:signal:test:${symbol}`),
          now(),
          rules.maxAgeSeconds?.[symbol],
        ),
      })),
    );
    return {
      service: "freightpulse",
      mode: "test",
      company: accountView(company),
      generatedAt: new Date(now()).toISOString(),
      routes: views.filter((x) => x.family === "container"),
      context: views.filter((x) => x.family !== "container"),
      history: (company.history || []).slice(-50).reverse(),
    };
  }
  async function notifications() {
    if (!enabled || !mailEnabled || !send)
      throw fail("freight_test_email_disabled", 503);
    let sent = 0,
      failed = 0;
    for (const company of await store.listCompanies()) {
      if (
        company.ownerEmail !== "savepulse.cloud@gmail.com" ||
        !hasAccess(company, now()) ||
        !company.preferences.email
      )
        continue;
      for (const symbol of company.preferences.routes) {
        const signal = await store.get(`freight:signal:test:${symbol}`),
          view = signalView(signal, now(), rules.maxAgeSeconds?.[symbol]);
        // New CS rule is demo/sandbox only: no real email delivery until separately approved.
        if (signal?.ruleVersion === CS_RULE_VERSION) continue;
        if (!view.current || view.signalStatus === "unclear") continue;
        const id = hash(`${company.id}:${symbol}:${signal.barTime}`),
          key = `freight:mail:${id}`,
          lease = crypto.randomUUID();
        let skip = false;
        await mutate(key, (old) => {
          if (
            old?.status === "sent" ||
            old?.status === "needs_review" ||
            old?.leaseUntil > now() ||
            old?.retryAt > now()
          ) {
            skip = true;
            return null;
          }
          if (old?.firstAttempt && now() - old.firstAttempt > 23 * 3600000) {
            skip = true;
            return { ...old, status: "needs_review" };
          }
          return {
            ...old,
            status: "sending",
            firstAttempt: old?.firstAttempt || now(),
            attempts: (old?.attempts || 0) + 1,
            lease,
            leaseUntil: now() + 120000,
          };
        });
        if (skip) continue;
        try {
          // Recheck access/preferences/freshness immediately before sending.
          const latest = await store.get(`freight:company:${company.id}`);
          if (
            !hasAccess(latest, now()) ||
            !latest.preferences.email ||
            !latest.preferences.routes.includes(symbol) ||
            !signalView(signal, now(), rules.maxAgeSeconds?.[symbol]).current
          )
            throw fail("notification_no_longer_eligible", 409);
          const providerId = await send({
            email: company.ownerEmail,
            subject: `[TEST] FreightPulse ${symbol}: ${signal.signalStatus}`,
            text: `TEST DATA — not a booking quote. ${symbol}: ${signal.signalStatus}. Source updated ${signal.sourceUpdatedAt}. Check quote expiry, vessel space, sailing date and booking terms. Continuous futures may have rollover effects.`,
            idempotencyKey: `freight-${id}`,
          });
          if (typeof providerId !== "string" || !providerId)
            throw fail("email_provider_unconfirmed", 503);
          await mutate(key, (old) => {
            if (old.lease !== lease) throw fail("mail_lease_lost", 409);
            return {
              ...old,
              status: "sent",
              providerId,
              sentAt: new Date(now()).toISOString(),
              leaseUntil: 0,
            };
          });
          sent++;
          await mutate(`freight:company:${company.id}`, (old) => ({
            ...old,
            history: [
              ...(old.history || []).filter((h) => h.id !== id),
              {
                id,
                symbol,
                status: "sent",
                at: new Date(now()).toISOString(),
                dataMode: "test",
              },
            ].slice(-100),
          }));
        } catch (_) {
          await mutate(key, (old) =>
            old.lease === lease && old.status !== "sent"
              ? {
                  ...old,
                  status: "failed",
                  retryAt: now() + 900000,
                  leaseUntil: 0,
                }
              : null,
          );
          failed++;
        }
      }
    }
    return { sent, failed };
  }
  return {
    account,
    createCompany,
    preferences,
    checkout,
    portal,
    billingEvent,
    ingest,
    report,
    notifications,
  };
}
module.exports = {
  PRICE,
  CONTAINERS,
  SYMBOLS,
  createFreightStore,
  createFreightService,
  validateSignal,
  signalView,
  hasAccess,
  family,
};
