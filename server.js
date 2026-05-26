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
  createSignal
} = require("./src/signalEngine");
const { recipientsFromEnv, sendSignalEmail } = require("./src/emailDispatcher");
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

fs.mkdirSync(DATA_DIR, { recursive: true });

let signalsBySymbol = loadJson(SIGNALS_FILE, {});
let subscribers = loadJson(SUBSCRIBERS_FILE, []);
let notificationQueue = loadJson(NOTIFICATIONS_FILE, []);
let invoices = loadJson(INVOICES_FILE, []);

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
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-savepulse-secret",
    "content-type": "application/json; charset=utf-8"
  });
  res.end(body);
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "content-type": contentType
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function bearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function incomingSecret(req, body) {
  return body.secret_key || body.secretKey || req.headers["x-savepulse-secret"] || bearerToken(req);
}

function publicSignal(signal) {
  const effective = applyAutoDemotion(signal);
  return {
    ...effective,
    legalBoundary:
      "Decision intelligence only. Not financial advice, trading instruction, or return guarantee."
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

function emailIsValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function hasMasterSecret(req, body) {
  return Boolean(WEBHOOK_SECRET && incomingSecret(req, body) === WEBHOOK_SECRET);
}

function checkoutUrlForPlan(plan, env = process.env) {
  const planId = normalizePlan(plan);
  if (planId === "free") {
    return null;
  }

  return env[`CHECKOUT_${planId.toUpperCase()}_URL`] || null;
}

function checkoutPayload(plan) {
  const planId = normalizePlan(plan);
  const url = checkoutUrlForPlan(planId);

  return {
    plan: planId,
    configured: Boolean(url),
    url,
    message: url
      ? "Open this checkout URL to activate the requested plan."
      : "Checkout URL is not configured yet. Add the plan payment link in Render."
  };
}

function publicSubscriber(record) {
  return {
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
  const notificationDispatch = await dispatchSignalNotifications(signal, effectiveSignal);

  sendJson(res, 202, {
    accepted: true,
    signal: effectiveSignal,
    notificationDispatch,
    emailDispatch: notificationDispatch
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
    checkout: upgradeRequired ? checkoutPayload(requestedPlan) : null,
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
    checkout: checkoutPayload(plan)
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

    if (req.method === "GET" && url.pathname === "/api/v1/status") {
      const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
      const signal = signalsBySymbol[symbol];
      sendJson(res, signal ? 200 : 404, signal ? { signal: publicSignal(signal) } : { error: "symbol_not_found" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/notifications/summary") {
      sendJson(res, 200, {
        queue: publicNotificationSummary(),
        generatedAt: new Date().toISOString()
      });
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
  dispatchSignalNotifications,
  flushNotificationQueue,
  handleRequest,
  listAssets,
  publicNotificationSummary,
  quotaSnapshot,
  server
};
