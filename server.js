"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const {
  ACTIONS,
  TRACKED_ASSETS,
  applyAutoDemotion,
  createDefaultSignal,
  createSignal,
  userFacingActionForDirection
} = require("./src/signalEngine");
const { recipientsFromEnv, sendSignalEmail } = require("./src/emailDispatcher");
const { buildDailyDigestEmail, buildEmailPreviewIndex } = require("./src/dailyDigestEmail");
const { createSupabasePersistence } = require("./src/persistence");
const {
  deliveryDecisionForSignal,
  normalizePlan,
  planFor,
  publicPlans,
  sanitizeChannels,
  sanitizeWatchlist,
  subscriberEntitlements
} = require("./src/plans");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || "state");
const PUBLIC_DIR = path.join(__dirname, "public");
const SIGNALS_FILE = path.join(DATA_DIR, "signals.json");
const SUBSCRIBERS_FILE = path.join(DATA_DIR, "subscribers.json");
const NOTIFICATIONS_FILE = path.join(DATA_DIR, "notifications.json");
const INVOICES_FILE = path.join(DATA_DIR, "invoices.json");
const DAILY_FREE_QUOTA = Number(process.env.DAILY_FREE_QUOTA || 50);
const WEBHOOK_SECRET =
  process.env.WEBHOOK_SECRET ||
  (process.env.NODE_ENV === "production" ? "" : "SAVEPULSE_MASTER_KEY_2026");
const ADMIN_READINESS_KEY = process.env.ADMIN_READINESS_KEY || process.env.ADMIN_API_KEY || "";
const STRIPE_REQUIRED_WEBHOOK_EVENTS = Object.freeze([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed"
]);
const RECENT_STRIPE_EVENT_LIMIT = 25;

fs.mkdirSync(DATA_DIR, { recursive: true });

let signalsBySymbol = loadJson(SIGNALS_FILE, {});
let subscribers = loadJson(SUBSCRIBERS_FILE, []);
let notificationQueue = loadJson(NOTIFICATIONS_FILE, []);
let invoices = loadJson(INVOICES_FILE, []);
const recentStripeEvents = [];
const persistence = createSupabasePersistence();

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,HEAD,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-savepulse-secret,x-savepulse-admin-key,x-admin-key",
    "content-type": "application/json; charset=utf-8"
  });
  res.end(body);
}

function sendEmpty(res, statusCode) {
  res.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,HEAD,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-savepulse-secret,x-savepulse-admin-key,x-admin-key"
  });
  res.end();
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "content-type": contentType
  });
  res.end(body);
}

function runBackgroundTask(label, task) {
  Promise.resolve()
    .then(task)
    .catch((error) => {
      console.warn(`${label} failed: ${error.message}`);
    });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bodyLength = 0;

    req.on("data", (chunk) => {
      chunks.push(chunk);
      bodyLength += chunk.length;

      if (bodyLength > 1024 * 1024) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

async function parseBody(req) {
  const bodyBuffer = await readRawBody(req);
  const body = bodyBuffer.toString("utf8");

  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error("invalid JSON body");
  }
}

function bearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function incomingSecret(req, body) {
  return body.secret_key || body.secretKey || req.headers["x-savepulse-secret"] || bearerToken(req);
}

function incomingAdminSecret(req) {
  return (
    req.headers["x-savepulse-admin-key"] ||
    req.headers["x-admin-key"] ||
    req.headers["x-savepulse-secret"] ||
    bearerToken(req)
  );
}

function publicSignal(signal) {
  const effective = applyAutoDemotion(signal);
  return {
    ...effective,
    legalBoundary:
      "Decision intelligence only. Not financial advice, trading instruction, or return guarantee."
  };
}

function userFacingSignal(signal, userFromCurrency, userToCurrency) {
  const resolved = userFacingActionForDirection({
    symbol: signal.symbol,
    action: signal.action,
    userFromCurrency,
    userToCurrency
  });

  return {
    supported: resolved.supported,
    direction: resolved.direction,
    inverted: resolved.inverted,
    base: resolved.base,
    quote: resolved.quote,
    label: resolved.label,
    copy: resolved.copy
  };
}

function quotaSnapshot() {
  const freeSubscribers = subscribers.filter((subscriber) => normalizePlan(subscriber.plan) === "free").length;
  const used = Math.min(DAILY_FREE_QUOTA, freeSubscribers);
  return {
    limit: DAILY_FREE_QUOTA,
    used,
    remaining: Math.max(0, DAILY_FREE_QUOTA - used)
  };
}

function listAssets() {
  const signals = {
    ...Object.fromEntries(TRACKED_ASSETS.map((symbol) => [symbol, createDefaultSignal(symbol)])),
    ...signalsBySymbol
  };

  const order = new Map(TRACKED_ASSETS.map((symbol, index) => [symbol, index]));

  return Object.values(signals)
    .map(publicSignal)
    .sort((a, b) => {
      const aOrder = order.has(a.symbol) ? order.get(a.symbol) : Number.MAX_SAFE_INTEGER;
      const bOrder = order.has(b.symbol) ? order.get(b.symbol) : Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder || a.symbol.localeCompare(b.symbol);
    });
}

function latestSignalSummary(signal) {
  const effective = publicSignal(signal);
  const pine = effective.pine || {};

  return {
    symbol: effective.symbol,
    action: effective.action,
    rawAction: effective.rawAction || effective.action,
    label: {
      th: effective.meta?.th?.label || null,
      en: effective.meta?.en?.label || null
    },
    timeframe: effective.timeframe || "1D",
    price: effective.price ?? null,
    source: effective.source || null,
    receivedAt: effective.receivedAt || null,
    ageHours: effective.ageHours ?? null,
    expired: Boolean(effective.expired),
    decisionWindowExpired: Boolean(effective.decisionWindowExpired),
    demotedFrom: effective.demotedFrom || null,
    businessDaysElapsed: effective.businessDaysElapsed ?? null,
    buyWindowBusinessDays: effective.buyWindowBusinessDays ?? null,
    percentile: effective.percentile
      ? {
          percent: effective.percentile.percent ?? null
        }
      : null,
    pine: {
      detail: pine.detail || null,
      daysInWindow: pine.daysInWindow ?? null,
      emaFast: pine.emaFast ?? null,
      emaSlow: pine.emaSlow ?? null,
      barTime: pine.barTime || null
    }
  };
}

function latestSignalsSnapshot() {
  const signals = listAssets().map(latestSignalSummary);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    count: signals.length,
    signals,
    safety: {
      secretsExposed: false,
      rawPayloadExposed: false,
      customerIdsExposed: false,
      subscriptionIdsExposed: false,
      supabaseKeysExposed: false
    }
  };
}

function emailIsValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function hasMasterSecret(req, body) {
  return Boolean(WEBHOOK_SECRET && incomingSecret(req, body) === WEBHOOK_SECRET);
}

function hasAdminSecret(req) {
  const incoming = incomingAdminSecret(req);

  if (ADMIN_READINESS_KEY) {
    return incoming === ADMIN_READINESS_KEY;
  }

  return Boolean(WEBHOOK_SECRET && incoming === WEBHOOK_SECRET);
}

function checkoutUrlForPlan(plan, env = process.env) {
  const planId = normalizePlan(plan);
  if (planId === "free") {
    return null;
  }

  return env[`CHECKOUT_${planId.toUpperCase()}_URL`] || null;
}

function stripeSecretKey(env = process.env) {
  return env.STRIPE_SECRET_KEY || env.STRIPE_API_KEY || "";
}

function stripeWebhookSecret(env = process.env) {
  return env.STRIPE_WEBHOOK_SECRET || env.STRIPE_SIGNING_SECRET || "";
}

function appBaseUrl(env = process.env) {
  return String(env.APP_BASE_URL || env.PUBLIC_URL || `http://${HOST}:${PORT}`).replace(/\/+$/, "");
}

function checkoutPriceIdForPlan(plan, env = process.env) {
  const planId = normalizePlan(plan);
  if (planId === "free") {
    return "";
  }

  const key = planId.toUpperCase();
  return (
    env[`STRIPE_PRICE_${key}`] ||
    env[`STRIPE_PRICE_${key}_MONTHLY`] ||
    env[`STRIPE_${key}_PRICE_ID`] ||
    ""
  );
}

function checkoutRequirements(plan, env = process.env) {
  const planId = normalizePlan(plan);
  const missing = [];

  if (!stripeSecretKey(env)) {
    missing.push("STRIPE_SECRET_KEY");
  }

  if (!checkoutPriceIdForPlan(planId, env)) {
    missing.push(`STRIPE_PRICE_${planId.toUpperCase()}`);
  }

  return missing;
}

function stripeKeyMode(key) {
  const value = String(key || "");
  if (value.startsWith("sk_live_")) {
    return "live";
  }

  if (value.startsWith("sk_test_")) {
    return "test";
  }

  return value ? "unknown" : "missing";
}

function supabaseEnvConfigured(env = process.env) {
  return Boolean(
    (env.SUPABASE_URL || env.SUPABASE_PROJECT_URL) &&
      (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY)
  );
}

function billingReadinessSnapshot(env = process.env) {
  const baseUrl = appBaseUrl(env);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    endpoints: {
      stripeWebhook: `${baseUrl}/api/v1/billing/webhook`,
      checkout: `${baseUrl}/api/v1/billing/checkout`
    },
    stripe: {
      mode: stripeKeyMode(stripeSecretKey(env)),
      secretKeyConfigured: Boolean(stripeSecretKey(env)),
      webhookSecretConfigured: Boolean(stripeWebhookSecret(env)),
      priceIdsConfigured: {
        plus: Boolean(checkoutPriceIdForPlan("plus", env)),
        pro: Boolean(checkoutPriceIdForPlan("pro", env)),
        business: Boolean(checkoutPriceIdForPlan("business", env))
      },
      requiredWebhookEvents: [...STRIPE_REQUIRED_WEBHOOK_EVENTS]
    },
    supabase: {
      configured: supabaseEnvConfigured(env),
      persistenceEnabled: env === process.env ? persistence.enabled : supabaseEnvConfigured(env)
    },
    adminProtection: {
      adminReadinessKeyConfigured: Boolean(env.ADMIN_READINESS_KEY || env.ADMIN_API_KEY),
      protected: Boolean(env.ADMIN_READINESS_KEY || env.ADMIN_API_KEY || env.WEBHOOK_SECRET || WEBHOOK_SECRET)
    },
    safety: {
      secretsExposed: false,
      rawStripePayloadExposed: false
    }
  };
}

function sanitizeStripeEventResult(result = {}) {
  const payload = {
    updated: Boolean(result.updated),
    reason: result.reason || null
  };

  if (result.subscriber) {
    payload.subscriber = {
      email: result.subscriber.email || null,
      plan: normalizePlan(result.subscriber.plan),
      billing: result.subscriber.billing
        ? {
            provider: result.subscriber.billing.provider || null,
            status: result.subscriber.billing.status || null,
            plan: normalizePlan(result.subscriber.billing.plan || result.subscriber.plan),
            updatedAt: result.subscriber.billing.updatedAt || null
          }
        : null
    };
  }

  return payload;
}

function safeStripeEventSummary(event = {}, result = {}, processedAt = new Date().toISOString()) {
  const object = event?.data?.object || {};
  return {
    id: event.id || null,
    type: event.type || null,
    processedAt,
    object: {
      mode: object.mode || null,
      status: object.status || null,
      paymentStatus: object.payment_status || null,
      hasEmail: Boolean(stripeObjectEmail(object)),
      hasCustomer: Boolean(object.customer),
      hasSubscription: Boolean(object.subscription || String(event.type || "").startsWith("customer.subscription."))
    },
    result: sanitizeStripeEventResult(result)
  };
}

function rememberStripeEvent(event, result) {
  const summary = safeStripeEventSummary(event, result);
  recentStripeEvents.unshift(summary);
  recentStripeEvents.splice(RECENT_STRIPE_EVENT_LIMIT);
  return summary;
}

function persistStripeEvent(event, result) {
  if (!persistence.enabled || typeof persistence.recordStripeEvent !== "function") {
    return;
  }

  persistence.recordStripeEvent(event, sanitizeStripeEventResult(result)).catch((error) => {
    console.warn(`Supabase Stripe event sync failed: ${error.message}`);
  });
}

function safeStripeEventRow(row = {}) {
  return {
    id: row.id || null,
    type: row.type || null,
    processedAt: row.processed_at || null,
    result: sanitizeStripeEventResult(row.result || {})
  };
}

function boundedLimit(value, fallback = 10) {
  return Math.min(RECENT_STRIPE_EVENT_LIMIT, Math.max(1, Math.floor(Number(value) || fallback)));
}

async function stripeEventsSnapshot(limit = 10) {
  const count = boundedLimit(limit);
  let remoteEvents = [];
  let remoteError = null;

  if (persistence.enabled && typeof persistence.listStripeEvents === "function") {
    try {
      remoteEvents = (await persistence.listStripeEvents(count)).map(safeStripeEventRow);
    } catch (error) {
      remoteError = "supabase_stripe_events_read_failed";
    }
  }

  const seen = new Set();
  const merged = [...remoteEvents, ...recentStripeEvents]
    .filter((event) => {
      const key = `${event.id || ""}:${event.type || ""}:${event.processedAt || ""}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, count);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: remoteEvents.length ? "supabase" : "local_memory",
    persistence: {
      enabled: persistence.enabled,
      table: persistence.tables?.stripeEvents || "stripe_events",
      remoteError
    },
    events: merged,
    localBuffered: recentStripeEvents.length
  };
}

async function createStripeCheckoutSession({ email, plan, locale = "en", watchlist = [] }, env = process.env) {
  const planId = normalizePlan(plan);
  const secretKey = stripeSecretKey(env);
  const priceId = checkoutPriceIdForPlan(planId, env);

  if (!secretKey || !priceId || planId === "free") {
    return null;
  }

  const baseUrl = appBaseUrl(env);
  const metadata = {
    email,
    plan: planId,
    locale: locale === "th" ? "th" : "en",
    watchlist: Array.isArray(watchlist) ? watchlist.join(",") : ""
  };
  const form = new URLSearchParams();

  form.append("mode", "subscription");
  form.append("customer_email", email);
  form.append("client_reference_id", email);
  form.append("line_items[0][price]", priceId);
  form.append("line_items[0][quantity]", "1");
  form.append("success_url", `${baseUrl}/?checkout=success&plan=${planId}&session_id={CHECKOUT_SESSION_ID}`);
  form.append("cancel_url", `${baseUrl}/?checkout=cancelled&plan=${planId}`);
  form.append("allow_promotion_codes", "true");

  for (const [key, value] of Object.entries(metadata)) {
    form.append(`metadata[${key}]`, value);
    form.append(`subscription_data[metadata][${key}]`, value);
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: form
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "Stripe checkout session creation failed");
  }

  return {
    id: payload.id,
    url: payload.url
  };
}

async function checkoutPayload(plan, options = {}, env = process.env) {
  const planId = normalizePlan(plan);
  const staticUrl = checkoutUrlForPlan(planId, env);

  if (options.email && checkoutRequirements(planId, env).length === 0) {
    try {
      const session = await createStripeCheckoutSession({ ...options, plan: planId }, env);

      if (session?.url) {
        return {
          plan: planId,
          configured: true,
          provider: "stripe",
          url: session.url,
          sessionId: session.id,
          message: "Open this Stripe Checkout session to activate the requested plan."
        };
      }
    } catch (error) {
      return {
        plan: planId,
        configured: false,
        provider: "stripe",
        url: null,
        message: error.message
      };
    }
  }

  if (staticUrl) {
    return {
      plan: planId,
      configured: true,
      provider: "payment_link",
      url: staticUrl,
      message: "Open this checkout URL to activate the requested plan."
    };
  }

  return {
    plan: planId,
    configured: false,
    provider: "stripe",
    url: null,
    missing: checkoutRequirements(planId, env),
    message: "Stripe Checkout is not configured yet. Add the Stripe secret key and plan price IDs in Render."
  };
}

function publicSubscriber(record) {
  const payload = {
    id: record.id,
    email: record.email,
    locale: record.locale,
    interest: record.interest,
    plan: normalizePlan(record.plan),
    watchlist: Array.isArray(record.watchlist) ? record.watchlist : [],
    channels: Array.isArray(record.channels) ? record.channels : ["email"],
    preferences: record.preferences || {},
    entitlements: subscriberEntitlements(record),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  if (record.billing) {
    payload.billing = {
      provider: record.billing.provider,
      status: record.billing.status,
      plan: normalizePlan(record.billing.plan || record.plan),
      updatedAt: record.billing.updatedAt
    };
  }

  return payload;
}

function buildSubscriberRecord(email, body, existing, plan) {
  const watchlistInput = body.watchlist ?? body.symbols ?? body.symbol ?? existing?.watchlist ?? [];
  const watchlistResult = sanitizeWatchlist(watchlistInput, plan);
  const channels = sanitizeChannels(body.channels ?? existing?.channels ?? ["email"], plan);
  const planConfig = planFor(plan);

  return {
    record: {
      id: existing?.id || crypto.randomUUID(),
      email,
      locale: body.locale === "th" ? "th" : body.locale === "en" ? "en" : existing?.locale || "en",
      interest: String(body.interest || existing?.interest || "general").slice(0, 40),
      plan,
      watchlist: watchlistResult.watchlist,
      channels,
      preferences: {
        dailyDigest: body.dailyDigest ?? existing?.preferences?.dailyDigest ?? true,
        majorAlertsOnly: planConfig.majorAlertsOnly,
        realTimeAlerts: planConfig.realTimeAlerts
      },
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    watchlistResult
  };
}

function saveSubscriberRecord(record) {
  const existing = subscribers.find((subscriber) => subscriber.email === record.email);

  if (existing) {
    subscribers = subscribers.map((subscriber) => (subscriber.email === record.email ? record : subscriber));
  } else {
    subscribers.push(record);
  }

  saveJson(SUBSCRIBERS_FILE, subscribers);
}

function updateSubscriberPlanFromBilling(email, plan, billing = {}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!emailIsValid(normalizedEmail)) {
    return { updated: false, reason: "valid_email_required" };
  }

  const existing = subscribers.find((subscriber) => subscriber.email === normalizedEmail);
  const planId = normalizePlan(plan);
  const { record, watchlistResult } = buildSubscriberRecord(normalizedEmail, {}, existing, planId);

  record.billing = {
    ...(existing?.billing || {}),
    provider: "stripe",
    ...billing,
    plan: planId,
    updatedAt: new Date().toISOString()
  };

  saveSubscriberRecord(record);

  return {
    updated: true,
    subscriber: publicSubscriber(record),
    rejectedWatchlist: watchlistResult.rejected
  };
}

function notificationCandidates() {
  const envSubscribers = recipientsFromEnv().map((email) => ({
    id: `env-${email}`,
    email,
    locale: email.endsWith(".th") ? "th" : "en",
    plan: "pro",
    watchlist: [],
    channels: ["email"],
    source: "env"
  }));

  const seen = new Set();
  return [...subscribers, ...envSubscribers].filter((subscriber) => {
    const email = String(subscriber.email || "").trim().toLowerCase();

    if (!email || seen.has(email)) {
      return false;
    }

    seen.add(email);
    return true;
  });
}

function subscribersForSignal(signal) {
  const eligible = [];
  const skipped = {};

  for (const subscriber of notificationCandidates()) {
    const delivery = deliveryDecisionForSignal(subscriber, signal);

    if (delivery.eligible) {
      eligible.push({
        ...subscriber,
        plan: delivery.plan,
        channels: delivery.channels,
        delivery
      });
      continue;
    }

    skipped[delivery.reason] = (skipped[delivery.reason] || 0) + 1;
  }

  return { eligible, skipped };
}

function notifiableAction(action) {
  return action === ACTIONS.STRONG_BUY || action === ACTIONS.SELL_ZONE;
}

function enqueueSignalNotifications(signal, effectiveSignal) {
  if (!notifiableAction(signal.action)) {
    return { queued: 0, skipped: true, reason: "action_not_notifiable" };
  }

  const { eligible, skipped } = subscribersForSignal(signal);
  const now = new Date();
  const jobs = eligible.map((subscriber) => {
    const scheduledAt = new Date(now.getTime() + subscriber.delivery.delayMinutes * 60 * 1000);

    return {
      id: crypto.randomUUID(),
      status: "pending",
      type: "signal_alert",
      createdAt: now.toISOString(),
      scheduledFor: scheduledAt.toISOString(),
      subscriber: publicSubscriber(subscriber),
      delivery: {
        plan: subscriber.delivery.plan,
        channels: subscriber.delivery.channels,
        delayMinutes: subscriber.delivery.delayMinutes
      },
      signal,
      effectiveSignal
    };
  });

  notificationQueue.push(...jobs);
  saveJson(NOTIFICATIONS_FILE, notificationQueue);

  return {
    queued: jobs.length,
    immediate: jobs.filter((job) => job.delivery.delayMinutes === 0).length,
    delayed: jobs.filter((job) => job.delivery.delayMinutes > 0).length,
    skippedByReason: skipped,
    nextScheduledFor: jobs
      .map((job) => job.scheduledFor)
      .sort()
      .at(0)
  };
}

async function flushNotificationQueue(now = new Date()) {
  const dueJobs = notificationQueue.filter((job) => {
    return job.status === "pending" && new Date(job.scheduledFor).getTime() <= now.getTime();
  });

  if (dueJobs.length === 0) {
    return { due: 0, sent: 0, failed: 0, skipped: 0 };
  }

  for (const job of dueJobs) {
    try {
      const result = await sendSignalEmail({
        signal: job.signal,
        effectiveSignal: job.effectiveSignal,
        subscriber: job.subscriber
      });

      job.result = result;
      job.finishedAt = new Date().toISOString();
      job.status = result.ok ? "sent" : result.skipped ? "skipped" : "failed";
    } catch (error) {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.result = { ok: false, error: error.message };
    }
  }

  saveJson(NOTIFICATIONS_FILE, notificationQueue);

  return {
    due: dueJobs.length,
    sent: dueJobs.filter((job) => job.status === "sent").length,
    failed: dueJobs.filter((job) => job.status === "failed").length,
    skipped: dueJobs.filter((job) => job.status === "skipped").length
  };
}

async function dispatchSignalNotifications(signal, effectiveSignal) {
  const queued = enqueueSignalNotifications(signal, effectiveSignal);

  if (queued.skipped === true) {
    return queued;
  }

  const flushed = await flushNotificationQueue();

  return {
    ...queued,
    flushed
  };
}

function publicNotificationSummary() {
  const counts = notificationQueue.reduce(
    (acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    },
    { pending: 0, sent: 0, failed: 0, skipped: 0 }
  );

  const nextPending = notificationQueue
    .filter((job) => job.status === "pending")
    .map((job) => job.scheduledFor)
    .sort()
    .at(0);

  return {
    counts,
    nextPending: nextPending || null
  };
}

function parseDateOnly(value) {
  const raw = String(value || "").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00+07:00`) : new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function invoiceSymbol(currency, targetCurrency) {
  const base = String(currency || "").trim().toUpperCase();
  const target = String(targetCurrency || "THB").trim().toUpperCase();
  const direct = `${base}${target}`;
  const reverse = `${target}${base}`;

  if (TRACKED_ASSETS.includes(direct)) {
    return direct;
  }

  if (TRACKED_ASSETS.includes(reverse)) {
    return reverse;
  }

  return null;
}

function invoiceExposure(invoice) {
  const signal = signalsBySymbol[invoice.symbol] || createDefaultSignal(invoice.symbol);
  const dueDate = new Date(invoice.dueDate);
  const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  return {
    symbol: invoice.symbol,
    daysUntilDue,
    signal: publicSignal(signal)
  };
}

function parseStripeSignatureHeader(header) {
  return String(header || "")
    .split(",")
    .map((part) => part.trim().split("="))
    .reduce(
      (acc, [key, value]) => {
        if (!key || !value) {
          return acc;
        }

        if (key === "v1") {
          acc.v1.push(value);
          return acc;
        }

        acc[key] = value;
        return acc;
      },
      { v1: [] }
    );
}

function verifyStripeWebhookSignature(rawBody, signatureHeader, secret, nowMs = Date.now(), toleranceSeconds = 300) {
  if (!secret) {
    throw new Error("stripe_webhook_secret_not_configured");
  }

  const parsed = parseStripeSignatureHeader(signatureHeader);
  const timestamp = Number(parsed.t);

  if (!Number.isFinite(timestamp) || parsed.v1.length === 0) {
    throw new Error("invalid_stripe_signature_header");
  }

  if (toleranceSeconds !== null && Math.abs(nowMs / 1000 - timestamp) > toleranceSeconds) {
    throw new Error("stripe_signature_timestamp_outside_tolerance");
  }

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  const signedPayload = `${timestamp}.${body}`;
  const expectedSignature = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const hasValidSignature = parsed.v1.some((signature) => {
    const signatureBuffer = Buffer.from(signature, "hex");
    return signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  });

  if (!hasValidSignature) {
    throw new Error("invalid_stripe_signature");
  }

  return true;
}

function planFromStripePriceId(priceId, env = process.env) {
  const normalizedPrice = String(priceId || "").trim();

  if (!normalizedPrice) {
    return "free";
  }

  for (const plan of ["plus", "pro", "business"]) {
    if (checkoutPriceIdForPlan(plan, env) === normalizedPrice) {
      return plan;
    }
  }

  return "free";
}

function stripeObjectEmail(object) {
  return String(
    object?.metadata?.email ||
      object?.customer_details?.email ||
      object?.customer_email ||
      object?.client_reference_id ||
      ""
  )
    .trim()
    .toLowerCase();
}

function stripeSubscriptionPriceId(subscription) {
  return subscription?.items?.data?.[0]?.price?.id || "";
}

function applyStripeCheckoutCompleted(session, env = process.env) {
  const email = stripeObjectEmail(session);
  const metadataPlan = normalizePlan(session?.metadata?.plan);
  const plan = metadataPlan === "free" ? normalizePlan(session?.metadata?.requested_plan) : metadataPlan;

  if (plan === "free") {
    return { updated: false, reason: "paid_plan_missing" };
  }

  return updateSubscriberPlanFromBilling(email, plan, {
    customerId: session.customer || null,
    subscriptionId: session.subscription || null,
    status: session.payment_status || session.status || "checkout_completed",
    checkoutSessionId: session.id || null,
    eventSource: "checkout.session.completed",
    envMode: stripeSecretKey(env).startsWith("sk_live_") ? "live" : "test"
  });
}

function applyStripeSubscriptionChanged(subscription, env = process.env) {
  const email = stripeObjectEmail(subscription);
  const plan = normalizePlan(subscription?.metadata?.plan || planFromStripePriceId(stripeSubscriptionPriceId(subscription), env));
  const active = ["active", "trialing"].includes(String(subscription?.status || "").toLowerCase());

  if (!email) {
    return { updated: false, reason: "subscriber_email_missing" };
  }

  if (plan === "free" && active) {
    return { updated: false, reason: "paid_plan_missing" };
  }

  return updateSubscriberPlanFromBilling(email, active ? plan : "free", {
    customerId: subscription.customer || null,
    subscriptionId: subscription.id || null,
    status: subscription.status || "unknown",
    currentPeriodEnd: subscription.current_period_end || null,
    eventSource: "customer.subscription.changed",
    envMode: stripeSecretKey(env).startsWith("sk_live_") ? "live" : "test"
  });
}

function applyStripeEvent(event, env = process.env) {
  const object = event?.data?.object || {};

  switch (event?.type) {
    case "checkout.session.completed":
      return applyStripeCheckoutCompleted(object, env);
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return applyStripeSubscriptionChanged(object, env);
    case "customer.subscription.deleted":
      return applyStripeSubscriptionChanged({ ...object, status: "canceled" }, env);
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
      return { updated: false, reason: "invoice_event_recorded_only" };
    default:
      return { updated: false, reason: "event_ignored" };
  }
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml"
    }[extension] || "application/octet-stream"
  );
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, file) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    sendText(res, 200, file, contentTypeFor(filePath));
  });
}

function handleEmailPreview(url, res) {
  const parts = url.pathname.split("/").filter(Boolean);
  const requestedPlan = parts[1];
  const locale = url.searchParams.get("lang") === "en" ? "en" : "th";

  if (!requestedPlan) {
    sendText(res, 200, buildEmailPreviewIndex(locale), "text/html; charset=utf-8");
    return;
  }

  const planId = normalizePlan(requestedPlan);
  if (planId !== requestedPlan.toLowerCase()) {
    sendText(res, 404, "Email preview plan not found");
    return;
  }

  const template = buildDailyDigestEmail({
    plan: planId,
    locale,
    signals: listAssets(),
    dashboardUrl: appBaseUrl()
  });

  sendText(res, 200, template.html, "text/html; charset=utf-8");
}

async function handleWebhook(req, res) {
  const body = await parseBody(req);

  if (!WEBHOOK_SECRET || incomingSecret(req, body) !== WEBHOOK_SECRET) {
    sendJson(res, 401, { error: "unauthorized_webhook" });
    return;
  }

  const signal = createSignal(body);
  signalsBySymbol[signal.symbol] = signal;
  saveJson(SIGNALS_FILE, signalsBySymbol);

  const effectiveSignal = publicSignal(signal);
  sendJson(res, 202, {
    accepted: true,
    signal: effectiveSignal,
    notificationDispatch: { status: "scheduled_background" },
    emailDispatch: { status: "scheduled_background" }
  });

  runBackgroundTask(`TradingView notification dispatch for ${signal.symbol}`, async () => {
    await dispatchSignalNotifications(signal, effectiveSignal);
  });
}

async function handleSubscribe(req, res) {
  const body = await parseBody(req);
  const email = String(body.email || "").trim().toLowerCase();

  if (!emailIsValid(email)) {
    sendJson(res, 422, { error: "valid_email_required" });
    return;
  }

  const existing = subscribers.find((subscriber) => subscriber.email === email);
  const existingPlan = normalizePlan(existing?.plan || "free");
  const requestedPlan = body.plan === undefined ? existingPlan : normalizePlan(body.plan);
  const isPlanChange = requestedPlan !== existingPlan;
  const canSetRequestedPlan = requestedPlan === "free" || !isPlanChange || hasMasterSecret(req, body);
  const plan = canSetRequestedPlan ? requestedPlan : existingPlan;
  const upgradeRequired = requestedPlan !== plan && requestedPlan !== "free";
  const { record, watchlistResult } = buildSubscriberRecord(email, body, existing, plan);

  saveSubscriberRecord(record);

  sendJson(res, 201, {
    subscribed: true,
    subscriber: publicSubscriber(record),
    requestedPlan,
    upgradeRequired,
    checkout: upgradeRequired
      ? await checkoutPayload(requestedPlan, {
          email,
          locale: record.locale,
          watchlist: record.watchlist
        })
      : null,
    rejectedWatchlist: watchlistResult.rejected,
    quota: quotaSnapshot()
  });
}

async function handleBillingCheckout(req, res) {
  const body = await parseBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  const plan = normalizePlan(body.plan);

  if (plan === "free") {
    sendJson(res, 422, { error: "paid_plan_required" });
    return;
  }

  if (!emailIsValid(email)) {
    sendJson(res, 422, { error: "valid_email_required" });
    return;
  }

  sendJson(res, 200, {
    email,
    checkout: await checkoutPayload(plan, {
      email,
      locale: body.locale,
      watchlist: body.watchlist
    })
  });
}

async function handleStripeWebhook(req, res) {
  const rawBody = await readRawBody(req);

  try {
    verifyStripeWebhookSignature(rawBody, req.headers["stripe-signature"], stripeWebhookSecret());
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch (error) {
    sendJson(res, 400, { error: "invalid_stripe_event_json" });
    return;
  }

  const result = applyStripeEvent(event);
  rememberStripeEvent(event, result);
  persistStripeEvent(event, result);

  sendJson(res, 200, {
    received: true,
    eventType: event.type,
    result: sanitizeStripeEventResult(result)
  });
}

async function handleAdminSubscriberPlan(req, res) {
  const body = await parseBody(req);

  if (!hasMasterSecret(req, body)) {
    sendJson(res, 401, { error: "unauthorized_admin_update" });
    return;
  }

  const email = String(body.email || "").trim().toLowerCase();
  if (!emailIsValid(email)) {
    sendJson(res, 422, { error: "valid_email_required" });
    return;
  }

  const existing = subscribers.find((subscriber) => subscriber.email === email);
  const plan = normalizePlan(body.plan || existing?.plan || "free");
  const { record, watchlistResult } = buildSubscriberRecord(email, body, existing, plan);

  saveSubscriberRecord(record);

  sendJson(res, 200, {
    updated: true,
    subscriber: publicSubscriber(record),
    rejectedWatchlist: watchlistResult.rejected
  });
}

async function handleBusinessInvoice(req, res) {
  const body = await parseBody(req);
  const email = String(body.email || "").trim().toLowerCase();

  if (!emailIsValid(email)) {
    sendJson(res, 422, { error: "valid_email_required" });
    return;
  }

  const subscriber = subscribers.find((record) => record.email === email);
  if (!subscriber || normalizePlan(subscriber.plan) !== "business") {
    sendJson(res, 403, {
      error: "business_plan_required",
      upgradeRequired: true,
      message: "Invoice tracking is available on the Business plan."
    });
    return;
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    sendJson(res, 422, { error: "positive_amount_required" });
    return;
  }

  const dueDate = parseDateOnly(body.dueDate);
  if (!dueDate) {
    sendJson(res, 422, { error: "valid_due_date_required" });
    return;
  }

  const symbol = invoiceSymbol(body.currency, body.targetCurrency || "THB");
  if (!symbol) {
    sendJson(res, 422, {
      error: "unsupported_invoice_currency_pair",
      supportedAssets: TRACKED_ASSETS
    });
    return;
  }

  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    subscriberId: subscriber.id,
    email,
    amount,
    currency: String(body.currency || "").trim().toUpperCase(),
    targetCurrency: String(body.targetCurrency || "THB").trim().toUpperCase(),
    symbol,
    dueDate: dueDate.toISOString(),
    vendor: String(body.vendor || "").slice(0, 80),
    note: String(body.note || "").slice(0, 240),
    createdAt: now,
    updatedAt: now
  };

  invoices.push(record);
  saveJson(INVOICES_FILE, invoices);

  sendJson(res, 201, {
    created: true,
    invoice: record,
    exposure: invoiceExposure(record)
  });
}

function handleListBusinessInvoices(url, res) {
  const email = String(url.searchParams.get("email") || "").trim().toLowerCase();

  if (!emailIsValid(email)) {
    sendJson(res, 422, { error: "valid_email_required" });
    return;
  }

  const subscriber = subscribers.find((record) => record.email === email);
  if (!subscriber || normalizePlan(subscriber.plan) !== "business") {
    sendJson(res, 403, {
      error: "business_plan_required",
      upgradeRequired: true
    });
    return;
  }

  const records = invoices.filter((invoice) => invoice.email === email);
  sendJson(res, 200, {
    invoices: records,
    exposures: records.map(invoiceExposure),
    generatedAt: new Date().toISOString()
  });
}

async function handleNotificationFlush(req, res) {
  const body = await parseBody(req);

  if (!WEBHOOK_SECRET || incomingSecret(req, body) !== WEBHOOK_SECRET) {
    sendJson(res, 401, { error: "unauthorized_notification_flush" });
    return;
  }

  const flushed = await flushNotificationQueue();
  sendJson(res, 200, {
    flushed,
    queue: publicNotificationSummary()
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (req.method === "HEAD" && url.pathname === "/api/v1/health") {
      sendEmpty(res, 200);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/health") {
      sendJson(res, 200, {
        ok: true,
        name: "SavePulse Analytics Network",
        now: new Date().toISOString(),
        queue: publicNotificationSummary()
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/plans") {
      sendJson(res, 200, {
        plans: publicPlans(),
        generatedAt: new Date().toISOString()
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/assets") {
      sendJson(res, 200, {
        assets: listAssets(),
        quota: quotaSnapshot(),
        plans: publicPlans(),
        generatedAt: new Date().toISOString()
      });
      return;
    }

    if (req.method === "GET" && (url.pathname === "/email-preview" || url.pathname.startsWith("/email-preview/"))) {
      handleEmailPreview(url, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/status") {
      const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
      if (!symbol) {
        sendJson(res, 400, { error: "symbol_required" });
        return;
      }

      const signal = signalsBySymbol[symbol] || createDefaultSignal(symbol);

      const userFromCurrency =
        url.searchParams.get("from") ||
        url.searchParams.get("user_from_currency") ||
        url.searchParams.get("fromCurrency");
      const userToCurrency =
        url.searchParams.get("to") ||
        url.searchParams.get("user_to_currency") ||
        url.searchParams.get("toCurrency");
      const responseSignal = publicSignal(signal);
      const response = { signal: responseSignal };

      if (userFromCurrency && userToCurrency) {
        response.userFacing = userFacingSignal(responseSignal, userFromCurrency, userToCurrency);
      }

      sendJson(res, 200, response);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/notifications/summary") {
      sendJson(res, 200, {
        queue: publicNotificationSummary(),
        generatedAt: new Date().toISOString()
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/admin/billing-readiness") {
      if (!hasAdminSecret(req)) {
        sendJson(res, 401, { error: "unauthorized_admin_readiness" });
        return;
      }

      sendJson(res, 200, billingReadinessSnapshot());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/admin/latest-signals") {
      if (!hasAdminSecret(req)) {
        sendJson(res, 401, { error: "unauthorized_admin_latest_signals" });
        return;
      }

      sendJson(res, 200, latestSignalsSnapshot());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/admin/stripe-events") {
      if (!hasAdminSecret(req)) {
        sendJson(res, 401, { error: "unauthorized_admin_stripe_events" });
        return;
      }

      sendJson(res, 200, await stripeEventsSnapshot(url.searchParams.get("limit")));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/webhook/tradingview") {
      await handleWebhook(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/subscribe") {
      await handleSubscribe(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/billing/checkout") {
      await handleBillingCheckout(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/billing/webhook") {
      await handleStripeWebhook(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/admin/subscribers/plan") {
      await handleAdminSubscriberPlan(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/notifications/flush") {
      await handleNotificationFlush(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/business/invoices") {
      await handleBusinessInvoice(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/business/invoices") {
      handleListBusinessInvoices(url, res);
      return;
    }

    if (req.method === "GET") {
      serveStatic(req, res, url.pathname);
      return;
    }

    sendJson(res, 405, { error: "method_not_allowed" });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

const server = http.createServer(handleRequest);
const notificationTimer = setInterval(() => {
  flushNotificationQueue().catch((error) => {
    console.warn(`Notification queue flush failed: ${error.message}`);
  });
}, 60 * 1000);

if (typeof notificationTimer.unref === "function") {
  notificationTimer.unref();
}

if (!WEBHOOK_SECRET) {
  console.warn("WEBHOOK_SECRET is not configured. TradingView webhook writes will be rejected.");
}

server.listen(PORT, HOST, () => {
  console.log(`SavePulse running on http://${HOST}:${PORT}`);
});

module.exports = {
  applyStripeEvent,
  billingReadinessSnapshot,
  checkoutPayload,
  checkoutPriceIdForPlan,
  dispatchSignalNotifications,
  flushNotificationQueue,
  handleRequest,
  latestSignalsSnapshot,
  listAssets,
  publicNotificationSummary,
  quotaSnapshot,
  safeStripeEventSummary,
  server,
  stripeEventsSnapshot,
  updateSubscriberPlanFromBilling,
  verifyStripeWebhookSignature
};
