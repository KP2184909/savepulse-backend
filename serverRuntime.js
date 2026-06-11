"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const baseServer = require("./server");
const { sendDailyDigestEmail, smtpConfigured } = require("./src/emailDispatcher");
const { normalizePlan } = require("./src/plans");
const {
  DEFAULT_DAILY_EMAIL_TIME,
  DEFAULT_DAILY_EMAIL_TIMEZONE,
  DEFAULT_SIGNAL_FRESHNESS_HOURS,
  assessSignalReadiness,
  createEmailLogEntry,
  emailIsValid: schedulerEmailIsValid,
  isDuplicateDailyEmail,
  sanitizeEmailLogForAdmin,
  signalsForSubscriber,
  subscriberId,
  subscriberSkipReason,
  templateTypeForPlan,
  truncateForAdmin
} = require("./src/dailyEmailScheduler");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "state");
const SUBSCRIBERS_FILE = path.join(DATA_DIR, "subscribers.json");
const SCHEDULER_STATE_FILE = path.join(DATA_DIR, "scheduler.json");
const EMAIL_LOGS_FILE = path.join(DATA_DIR, "email_logs.json");
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function saveJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers":
      "content-type,authorization,x-savepulse-admin-key,x-admin-key,x-savepulse-secret,x-webhook-secret"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "access-control-allow-origin": "*"
  });
  res.end(body);
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("request_body_too_large"));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function parseBody(req) {
  const raw = await readRawBody(req);

  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("invalid_json_body");
  }
}

function appBaseUrl(env = process.env) {
  return String(env.APP_BASE_URL || env.PUBLIC_URL || "https://savepulse.cloud").replace(/\/+$/, "");
}

function emailIsValid(email) {
  return schedulerEmailIsValid(email);
}

function bearerToken(req) {
  const auth = String(req.headers.authorization || "");
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function timingSafeEqualString(providedValue, expectedValue) {
  const provided = String(providedValue || "");
  const expected = String(expectedValue || "");

  if (!provided || !expected || provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function adminSecret(env = process.env) {
  return String(env.ADMIN_READINESS_KEY || env.ADMIN_TOKEN || env.ADMIN_API_KEY || "").trim();
}

function incomingAdminSecret(req) {
  return req.headers["x-savepulse-admin-key"] || req.headers["x-admin-key"] || bearerToken(req);
}

function hasAdminSecret(req, env = process.env) {
  return timingSafeEqualString(incomingAdminSecret(req), adminSecret(env));
}

function incomingSecret(req, body = {}) {
  return (
    body.secret_key ||
    body.secret ||
    req.headers["x-savepulse-secret"] ||
    req.headers["x-webhook-secret"] ||
    bearerToken(req)
  );
}

function hasMasterSecret(req, body = {}) {
  return timingSafeEqualString(incomingSecret(req, body), WEBHOOK_SECRET);
}

function unsubscribeSecret(env = process.env) {
  return env.UNSUBSCRIBE_SECRET || env.WEBHOOK_SECRET || "savepulse-unsubscribe-dev-secret";
}

function unsubscribeTokenForEmail(email, env = process.env) {
  return crypto
    .createHmac("sha256", unsubscribeSecret(env))
    .update(String(email || "").trim().toLowerCase())
    .digest("hex");
}

function unsubscribeUrlForSubscriber(subscriber, env = process.env) {
  const email = String(subscriber?.email || "").trim().toLowerCase();

  if (!emailIsValid(email)) {
    return `${appBaseUrl(env)}/unsubscribe`;
  }

  const url = new URL("/unsubscribe", appBaseUrl(env));
  url.searchParams.set("email", email);
  url.searchParams.set("token", unsubscribeTokenForEmail(email, env));
  return url.toString();
}

function verifyUnsubscribeToken(email, token, env = process.env) {
  const expected = unsubscribeTokenForEmail(email, env);
  return timingSafeEqualString(token, expected);
}

function loadSubscribers() {
  return loadJson(SUBSCRIBERS_FILE, []);
}

function saveSubscribers(subscribers) {
  saveJson(SUBSCRIBERS_FILE, subscribers);
}

function loadEmailLogs() {
  return loadJson(EMAIL_LOGS_FILE, []);
}

function saveEmailLogs(emailLogs) {
  saveJson(EMAIL_LOGS_FILE, Array.isArray(emailLogs) ? emailLogs : []);
}

function appendEmailLog(log) {
  const logs = loadEmailLogs();
  logs.push(log);
  saveEmailLogs(logs);
  return log;
}

function updateEmailLog(id, patch = {}) {
  const logs = loadEmailLogs();
  const updated = logs.map((log) => (log.id === id ? { ...log, ...patch } : log));
  saveEmailLogs(updated);
  return updated.find((log) => log.id === id) || null;
}

function boundedLimit(value, max = 100, fallback = 25) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(max, Math.floor(parsed));
}

function recentDailyEmailLogs(limit = 25) {
  return loadEmailLogs()
    .slice(-boundedLimit(limit))
    .reverse()
    .map(sanitizeEmailLogForAdmin);
}

function normalizeSubscriberRecord(subscriber = {}) {
  return {
    ...subscriber,
    email: String(subscriber.email || "").trim().toLowerCase(),
    plan: normalizePlan(subscriber.plan || "free")
  };
}

function dailyDigestCandidates(plan = "", email = "") {
  const targetPlan = String(plan || "").trim().toLowerCase();
  const targetEmail = String(email || "").trim().toLowerCase();
  const subscribers = loadSubscribers();

  return subscribers
    .map(normalizeSubscriberRecord)
    .filter((subscriber) => emailIsValid(subscriber.email))
    .filter((subscriber) => !targetPlan || subscriber.plan === normalizePlan(targetPlan))
    .filter((subscriber) => !targetEmail || subscriber.email === targetEmail);
}

function dailyDigestRecipients(plan = "", email = "") {
  return dailyDigestCandidates(plan, email).filter((subscriber) => !subscriberSkipReason(subscriber));
}

function dailyEmailEnabled(env = process.env) {
  const value = env.DAILY_EMAIL_ENABLED ?? env.DAILY_DIGEST_ENABLED;
  return String(value || "").toLowerCase() === "true";
}

function dailyEmailTime(env = process.env) {
  return env.DAILY_EMAIL_TIME || env.DAILY_DIGEST_TIME || DEFAULT_DAILY_EMAIL_TIME;
}

function dailyEmailTimeZone(env = process.env) {
  return env.DAILY_EMAIL_TIMEZONE || env.DAILY_DIGEST_TIMEZONE || DEFAULT_DAILY_EMAIL_TIMEZONE;
}

function dailyEmailSignalMaxAgeHours(env = process.env) {
  const raw = env.DAILY_EMAIL_SIGNAL_MAX_AGE_HOURS || env.DAILY_SIGNAL_MAX_AGE_HOURS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SIGNAL_FRESHNESS_HOURS;
}

function storedSignalsForDigest(signals) {
  if (Array.isArray(signals)) {
    return signals;
  }

  if (signals && typeof signals === "object") {
    return Object.values(signals);
  }

  if (typeof baseServer.listStoredSignals === "function") {
    const stored = baseServer.listStoredSignals();
    return Array.isArray(stored) ? stored : Object.values(stored || {});
  }

  return baseServer.listAssets();
}

function safeReadinessSummary(readiness = {}) {
  return {
    ready: Boolean(readiness.ready),
    requiredSymbols: readiness.requiredSymbols || [],
    presentSymbols: readiness.presentSymbols || [],
    missingSymbols: readiness.missingSymbols || [],
    staleSymbols: readiness.staleSymbols || [],
    signalSnapshotDate: readiness.signalSnapshotDate || "",
    checkedAt: readiness.checkedAt || "",
    maxAgeHours: readiness.maxAgeHours,
    timeZone: readiness.timeZone
  };
}

function providerMessageIdFrom(result = {}) {
  return result.providerMessageId || result.provider_message_id || result.messageId || result.id || "";
}

function safeErrorMessage(error) {
  return truncateForAdmin(error?.message || error || "", 180);
}

function dailyEmailConfigForAdmin(env = process.env) {
  return {
    enabled: dailyEmailEnabled(env),
    sendTime: dailyEmailTime(env),
    timeZone: dailyEmailTimeZone(env),
    signalMaxAgeHours: dailyEmailSignalMaxAgeHours(env),
    smtpConfigured: smtpConfigured(env)
  };
}

function schedulerStateForAdmin() {
  const state = loadJson(SCHEDULER_STATE_FILE, {});
  return {
    dailyEmailDate: state.dailyEmailDate || state.dailyDigestDate || "",
    dailyEmailLastRunAt: state.dailyEmailLastRunAt || state.dailyDigestLastRunAt || "",
    dailyEmailLastResult: state.dailyEmailLastResult || state.dailyDigestLastResult || null
  };
}

async function sendDailyDigestBatch(
  { dryRun = false, plan = "", email = "", signals, now = new Date(), sendEmail = sendDailyDigestEmail } = {},
  env = process.env
) {
  const recipients = dailyDigestCandidates(plan, email);
  const signalList = storedSignalsForDigest(signals);
  const readiness = assessSignalReadiness(signalList, {
    now,
    timeZone: dailyEmailTimeZone(env),
    maxAgeHours: dailyEmailSignalMaxAgeHours(env)
  });
  const signalReadiness = safeReadinessSummary(readiness);
  const signalSnapshotDate = signalReadiness.signalSnapshotDate;
  const dashboardUrl = appBaseUrl(env);
  const smtpReady = smtpConfigured(env);
  const existingLogs = loadEmailLogs();
  const results = [];

  for (const subscriber of recipients) {
    const planId = normalizePlan(subscriber.plan || "free");
    const templateType = templateTypeForPlan(planId);
    const unsubscribeUrl = unsubscribeUrlForSubscriber(subscriber, env);
    const skipReason =
      subscriberSkipReason(subscriber) ||
      (!readiness.ready ? "incomplete_signals" : "") ||
      (isDuplicateDailyEmail(existingLogs, subscriber, templateType, signalSnapshotDate) ? "duplicate_daily_email" : "");

    if (dryRun) {
      results.push({
        email: subscriber.email,
        plan: planId,
        templateType,
        locale: subscriber.locale || "th",
        ok: !skipReason,
        dryRun: true
      });
      if (skipReason) {
        results[results.length - 1].skipped = true;
        results[results.length - 1].skippedReason = skipReason;
      }
      continue;
    }

    const emailLog = createEmailLogEntry({
      subscriber,
      plan: planId,
      templateType,
      status: skipReason ? "skipped" : "pending",
      skippedReason: skipReason,
      signalSnapshotDate,
      now
    });
    appendEmailLog(emailLog);
    existingLogs.push(emailLog);

    if (skipReason) {
      results.push({
        email: subscriber.email,
        plan: planId,
        templateType,
        ok: true,
        skipped: true,
        skippedReason: skipReason
      });
      continue;
    }

    try {
      const result = await sendEmail({
        subscriber,
        signals: signalsForSubscriber(signalList, subscriber),
        dashboardUrl,
        unsubscribeUrl,
        env
      });

      const statusPatch = result.ok
        ? {
            status: "sent",
            provider_message_id: providerMessageIdFrom(result),
            sent_at: new Date().toISOString()
          }
        : {
            status: result.skipped ? "skipped" : "failed",
            skipped_reason: result.skippedReason || (result.skipped ? "provider_skipped" : ""),
            error_message: result.error ? truncateForAdmin(result.error, 180) : "",
            provider_message_id: providerMessageIdFrom(result),
            sent_at: result.skipped ? "" : new Date().toISOString()
          };
      updateEmailLog(emailLog.id, statusPatch);
      results.push({ ...result, plan: planId, templateType });
    } catch (error) {
      updateEmailLog(emailLog.id, {
        status: "failed",
        error_message: safeErrorMessage(error),
        sent_at: new Date().toISOString()
      });

      results.push({
        email: subscriber.email,
        plan: planId,
        templateType,
        ok: false,
        error: safeErrorMessage(error)
      });
    }
  }

  return {
    ok: dryRun || results.every((result) => result.ok || result.skipped),
    dryRun,
    smtpConfigured: smtpReady,
    signalReadiness,
    recipients: recipients.length,
    sent: results.filter((result) => result.ok && !result.dryRun && !result.skipped).length,
    skipped: results.filter((result) => result.skipped).length,
    failed: results.filter((result) => result.ok === false && !result.skipped).length,
    byPlan: recipients.reduce((acc, subscriber) => {
      acc[subscriber.plan] = (acc[subscriber.plan] || 0) + 1;
      return acc;
    }, {}),
    results
  };
}

function parseDigestTime(value = DEFAULT_DAILY_EMAIL_TIME) {
  const match = String(value || DEFAULT_DAILY_EMAIL_TIME).match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return { hour: 8, minute: 30 };
  }

  return {
    hour: Math.min(23, Math.max(0, Number(match[1]))),
    minute: Math.min(59, Math.max(0, Number(match[2])))
  };
}

function datePartsForTimeZone(now = new Date(), timeZone = DEFAULT_DAILY_EMAIL_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

function bangkokDateParts(now = new Date()) {
  return datePartsForTimeZone(now, "Asia/Bangkok");
}

function dailyDigestScheduleDue(now = new Date(), env = process.env, state = loadJson(SCHEDULER_STATE_FILE, {})) {
  if (!dailyEmailEnabled(env)) {
    return { due: false, reason: "disabled" };
  }

  const scheduled = parseDigestTime(dailyEmailTime(env));
  const current = datePartsForTimeZone(now, dailyEmailTimeZone(env));
  const currentMinutes = current.hour * 60 + current.minute;
  const scheduledMinutes = scheduled.hour * 60 + scheduled.minute;

  if (state.dailyEmailDate === current.date || state.dailyDigestDate === current.date) {
    return { due: false, reason: "already_processed_today", date: current.date };
  }

  if (currentMinutes < scheduledMinutes) {
    return { due: false, reason: "before_scheduled_time", date: current.date };
  }

  return { due: true, date: current.date };
}

async function runScheduledDailyDigest(now = new Date(), env = process.env) {
  const state = loadJson(SCHEDULER_STATE_FILE, {});
  const schedule = dailyDigestScheduleDue(now, env, state);

  if (!schedule.due) {
    return schedule;
  }

  const result = await sendDailyDigestBatch({ dryRun: false }, env);
  const runResult = {
    sent: result.sent,
    skipped: result.skipped,
    failed: result.failed,
    recipients: result.recipients,
    signalReadiness: result.signalReadiness
  };

  saveJson(SCHEDULER_STATE_FILE, {
    ...state,
    dailyEmailDate: schedule.date,
    dailyDigestDate: schedule.date,
    dailyEmailLastRunAt: new Date().toISOString(),
    dailyDigestLastRunAt: new Date().toISOString(),
    dailyEmailLastResult: runResult,
    dailyDigestLastResult: runResult
  });

  return { ...schedule, result };
}

function unsubscribeSuccessHtml(locale = "th") {
  const thai = locale !== "en";
  const title = thai ? "ยกเลิกรับอีเมลรายวันแล้ว" : "Daily emails unsubscribed";
  const desc = thai
    ? "คุณจะไม่ได้รับ Daily Pulse จาก SavePulse ที่อีเมลนี้อีก หากต้องการเปิดใหม่ในอนาคต สามารถสมัครจากหน้าเว็บได้อีกครั้ง"
    : "You will no longer receive SavePulse Daily Pulse emails at this address. You can subscribe again from the website anytime.";
  const cta = thai ? "กลับหน้าแรก" : "Back home";

  return `<!doctype html>
<html lang="${thai ? "th" : "en"}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      body{margin:0;background:#eef7f8;color:#111827;font-family:Arial,sans-serif}
      main{min-height:100vh;display:grid;place-items:center;padding:24px}
      section{max-width:520px;background:#fff;border:1px solid #dcebed;border-radius:22px;padding:36px;box-shadow:0 18px 45px rgba(15,118,110,.13)}
      .mark{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:#e8fbf7;color:#087f83;font-size:28px;font-weight:800}
      h1{font-size:28px;line-height:1.25;margin:18px 0 10px}
      p{font-size:15px;line-height:1.7;color:#4b5563}
      a{display:inline-block;margin-top:18px;background:#087f83;color:#fff;text-decoration:none;border-radius:12px;padding:12px 16px;font-weight:700}
    </style>
  </head>
  <body>
    <main>
      <section>
        <div class="mark">✓</div>
        <h1>${title}</h1>
        <p>${desc}</p>
        <a href="${appBaseUrl()}">${cta}</a>
      </section>
    </main>
  </body>
</html>`;
}

function handleUnsubscribe(url, res) {
  const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
  const token = String(url.searchParams.get("token") || "");
  const locale = String(url.searchParams.get("lang") || "th").trim().toLowerCase();

  if (!emailIsValid(email) || !verifyUnsubscribeToken(email, token)) {
    sendText(res, 400, "Invalid unsubscribe link.");
    return;
  }

  const subscribers = loadSubscribers();
  let changed = false;

  const updated = subscribers.map((subscriber) => {
    if (String(subscriber.email || "").trim().toLowerCase() !== email) {
      return subscriber;
    }

    changed = true;
    return {
      ...subscriber,
      dailyDigest: false,
      unsubscribedAt: new Date().toISOString()
    };
  });

  if (changed) {
    saveSubscribers(updated);
  }

  sendText(res, 200, unsubscribeSuccessHtml(locale), "text/html; charset=utf-8");
}

async function handleDailyDigestSend(req, res) {
  const body = await parseBody(req);

  if (!hasMasterSecret(req, body) && !hasAdminSecret(req)) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  const result = await sendDailyDigestBatch(
    {
      dryRun: body.dryRun !== false,
      plan: body.plan || "",
      email: body.email || "",
      now: body.now ? new Date(body.now) : new Date()
    },
    process.env
  );

  sendJson(res, 200, result);
}

async function patchedHandleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (req.method === "GET" && url.pathname === "/unsubscribe") {
      handleUnsubscribe(url, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/daily-digest/send") {
      await handleDailyDigestSend(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/admin/daily-email-logs") {
      if (!hasAdminSecret(req)) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        generatedAt: new Date().toISOString(),
        config: dailyEmailConfigForAdmin(),
        state: schedulerStateForAdmin(),
        recentLogs: recentDailyEmailLogs(url.searchParams.get("limit")),
        safety: {
          secretsExposed: false,
          rawPayloadExposed: false
        }
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/admin/daily-email-jobs") {
      if (!hasAdminSecret(req)) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }

      const signalList = storedSignalsForDigest();
      const readiness = assessSignalReadiness(signalList, {
        now: new Date(),
        timeZone: dailyEmailTimeZone(),
        maxAgeHours: dailyEmailSignalMaxAgeHours()
      });

      sendJson(res, 200, {
        ok: true,
        generatedAt: new Date().toISOString(),
        config: dailyEmailConfigForAdmin(),
        state: schedulerStateForAdmin(),
        signalReadiness: safeReadinessSummary(readiness),
        recentLogs: recentDailyEmailLogs(url.searchParams.get("limit")),
        safety: {
          secretsExposed: false,
          rawPayloadExposed: false
        }
      });
      return;
    }

    await baseServer.handleRequest(req, res);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

baseServer.server.removeAllListeners("request");
baseServer.server.on("request", patchedHandleRequest);

const dailyDigestTimer = setInterval(() => {
  runScheduledDailyDigest().catch((error) => {
    console.warn(`Daily digest scheduler failed: ${error.message}`);
  });
}, 5 * 60 * 1000);

if (typeof dailyDigestTimer.unref === "function") {
  dailyDigestTimer.unref();
}

module.exports = {
  bangkokDateParts,
  dailyDigestCandidates,
  dailyDigestRecipients,
  dailyDigestScheduleDue,
  dailyEmailEnabled,
  dailyEmailSignalMaxAgeHours,
  dailyEmailTime,
  dailyEmailTimeZone,
  datePartsForTimeZone,
  loadEmailLogs,
  patchedHandleRequest,
  recentDailyEmailLogs,
  runScheduledDailyDigest,
  saveEmailLogs,
  sendDailyDigestBatch,
  server: baseServer.server,
  unsubscribeTokenForEmail,
  unsubscribeUrlForSubscriber,
  updateSubscriberPlanFromBilling: baseServer.updateSubscriberPlanFromBilling,
  verifyUnsubscribeToken
};
