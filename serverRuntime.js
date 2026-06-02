"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const baseServer = require("./server");
const { sendDailyDigestEmail, smtpConfigured } = require("./src/emailDispatcher");
const { normalizePlan } = require("./src/plans");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "state");
const SUBSCRIBERS_FILE = path.join(DATA_DIR, "subscribers.json");
const SCHEDULER_STATE_FILE = path.join(DATA_DIR, "scheduler.json");
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
    "access-control-allow-headers": "content-type,authorization"
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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function bearerToken(req) {
  const auth = String(req.headers.authorization || "");
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
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
  const provided = String(incomingSecret(req, body) || "");
  return Boolean(WEBHOOK_SECRET && provided && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(WEBHOOK_SECRET)));
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
  const provided = String(token || "");

  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function loadSubscribers() {
  return loadJson(SUBSCRIBERS_FILE, []);
}

function saveSubscribers(subscribers) {
  saveJson(SUBSCRIBERS_FILE, subscribers);
}

function dailyDigestRecipients(plan = "", email = "") {
  const targetPlan = String(plan || "").trim().toLowerCase();
  const targetEmail = String(email || "").trim().toLowerCase();
  const subscribers = loadSubscribers();

  return subscribers
    .map((subscriber) => ({
      ...subscriber,
      email: String(subscriber.email || "").trim().toLowerCase(),
      plan: normalizePlan(subscriber.plan || "free")
    }))
    .filter((subscriber) => emailIsValid(subscriber.email))
    .filter((subscriber) => subscriber.dailyDigest !== false)
    .filter((subscriber) => !targetPlan || subscriber.plan === normalizePlan(targetPlan))
    .filter((subscriber) => !targetEmail || subscriber.email === targetEmail);
}

async function sendDailyDigestBatch({ dryRun = false, plan = "", email = "" } = {}, env = process.env) {
  const recipients = dailyDigestRecipients(plan, email);
  const signals = baseServer.listAssets();
  const dashboardUrl = appBaseUrl(env);
  const smtpReady = smtpConfigured(env);
  const results = [];

  for (const subscriber of recipients) {
    const unsubscribeUrl = unsubscribeUrlForSubscriber(subscriber, env);

    if (dryRun) {
      results.push({
        email: subscriber.email,
        plan: subscriber.plan,
        locale: subscriber.locale || "th",
        ok: true,
        dryRun: true
      });
      continue;
    }

    const result = await sendDailyDigestEmail({
      subscriber,
      signals,
      dashboardUrl,
      unsubscribeUrl,
      env
    });

    results.push(result);
  }

  return {
    ok: dryRun || results.every((result) => result.ok || result.skipped),
    dryRun,
    smtpConfigured: smtpReady,
    recipients: recipients.length,
    sent: results.filter((result) => result.ok && !result.dryRun).length,
    skipped: results.filter((result) => result.skipped).length,
    failed: results.filter((result) => result.ok === false && !result.skipped).length,
    byPlan: recipients.reduce((acc, subscriber) => {
      acc[subscriber.plan] = (acc[subscriber.plan] || 0) + 1;
      return acc;
    }, {}),
    results
  };
}

function parseDigestTime(value = "08:00") {
  const match = String(value || "08:00").match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return { hour: 8, minute: 0 };
  }

  return {
    hour: Math.min(23, Math.max(0, Number(match[1]))),
    minute: Math.min(59, Math.max(0, Number(match[2])))
  };
}

function bangkokDateParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
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

function dailyDigestScheduleDue(now = new Date(), env = process.env, state = loadJson(SCHEDULER_STATE_FILE, {})) {
  if (env.DAILY_DIGEST_ENABLED !== "true") {
    return { due: false, reason: "disabled" };
  }

  const scheduled = parseDigestTime(env.DAILY_DIGEST_TIME || "08:00");
  const current = bangkokDateParts(now);
  const currentMinutes = current.hour * 60 + current.minute;
  const scheduledMinutes = scheduled.hour * 60 + scheduled.minute;

  if (state.dailyDigestDate === current.date) {
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

  saveJson(SCHEDULER_STATE_FILE, {
    ...state,
    dailyDigestDate: schedule.date,
    dailyDigestLastRunAt: new Date().toISOString(),
    dailyDigestLastResult: {
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
      recipients: result.recipients
    }
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

  if (!hasMasterSecret(req, body)) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  const result = await sendDailyDigestBatch(
    {
      dryRun: body.dryRun !== false,
      plan: body.plan || "",
      email: body.email || ""
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
  dailyDigestRecipients,
  dailyDigestScheduleDue,
  patchedHandleRequest,
  runScheduledDailyDigest,
  sendDailyDigestBatch,
  server: baseServer.server,
  unsubscribeTokenForEmail,
  unsubscribeUrlForSubscriber,
  updateSubscriberPlanFromBilling: baseServer.updateSubscriberPlanFromBilling,
  verifyUnsubscribeToken
};
