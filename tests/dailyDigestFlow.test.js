"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ACTIONS, TRACKED_ASSETS } = require("../src/signalEngine");
const { buildDailyDigestEmail } = require("../src/dailyDigestEmail");
const { signalsForSubscriber } = require("../src/dailyEmailScheduler");

const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "savepulse-digest-"));

process.env.PORT = "0";
process.env.HOST = "127.0.0.1";
process.env.DATA_DIR = tempDataDir;
process.env.WEBHOOK_SECRET = "test-master-secret";
process.env.ADMIN_READINESS_KEY = "test-admin-key";

const {
  dailyDigestScheduleDue,
  loadEmailLogs,
  saveEmailLogs,
  sendDailyDigestBatch,
  server,
  unsubscribeTokenForEmail
} = require("../serverRuntime");

const SUBSCRIBERS_FILE = path.join(tempDataDir, "subscribers.json");
const SCHEDULER_STATE_FILE = path.join(tempDataDir, "scheduler.json");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function resetState(subscribers = []) {
  writeJson(SUBSCRIBERS_FILE, subscribers);
  writeJson(SCHEDULER_STATE_FILE, {});
  saveEmailLogs([]);
}

function subscriber(email, plan = "free", extra = {}) {
  return {
    id: `sub-${email}`,
    email,
    plan,
    locale: "th",
    dailyDigest: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    ...extra
  };
}

function completeSignals(timestamp = "2026-06-02T01:31:00.000Z", overrides = {}) {
  return TRACKED_ASSETS.map((symbol, index) => ({
    symbol,
    action: ACTIONS.WAIT_ZONE,
    timeframe: "1D",
    price: index + 1,
    receivedAt: timestamp,
    updatedAt: timestamp,
    ...(overrides[symbol] || {})
  }));
}

function fakeSendEmail(prefix = "msg") {
  const sent = [];
  const sendEmail = async ({ subscriber: targetSubscriber, signals }) => {
    sent.push({ subscriber: targetSubscriber, signals });
    return { ok: true, email: targetSubscriber.email, providerMessageId: `${prefix}-${sent.length}` };
  };
  sendEmail.sent = sent;
  return sendEmail;
}

test.after(() => {
  server.close();
  fs.rmSync(tempDataDir, { recursive: true, force: true });
});

test("unsubscribe token is stable and email-specific", () => {
  const token = unsubscribeTokenForEmail("Member@example.com");

  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(token, unsubscribeTokenForEmail("member@example.com"));
  assert.notEqual(token, unsubscribeTokenForEmail("other@example.com"));
});

test("complete signals are ready and normal daily emails are sent", async () => {
  resetState([subscriber("plus@example.com", "plus")]);
  const sendEmail = fakeSendEmail("complete");

  const result = await sendDailyDigestBatch(
    { dryRun: false, now: new Date("2026-06-02T01:35:00.000Z"), signals: completeSignals(), sendEmail },
    { PUBLIC_URL: "https://savepulse.cloud" }
  );

  assert.equal(result.signalReadiness.ready, true);
  assert.equal(result.sent, 1);
  assert.equal(result.skipped, 0);
  assert.equal(sendEmail.sent.length, 1);

  const logs = loadEmailLogs();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, "sent");
  assert.equal(logs[0].template_type, "daily_decision_card");
  assert.equal(logs[0].provider_message_id, "complete-1");
  assert.equal(logs[0].signal_snapshot_date, "2026-06-02");
});

test("incomplete signals skip normal daily email with incomplete_signals reason", async () => {
  resetState([subscriber("free@example.com", "free")]);
  const sendEmail = fakeSendEmail("incomplete");
  const signals = completeSignals().filter((signal) => signal.symbol !== "BTCUSD");

  const result = await sendDailyDigestBatch(
    { dryRun: false, now: new Date("2026-06-02T01:35:00.000Z"), signals, sendEmail },
    { PUBLIC_URL: "https://savepulse.cloud" }
  );

  assert.equal(result.signalReadiness.ready, false);
  assert.deepEqual(result.signalReadiness.missingSymbols, ["BTCUSD"]);
  assert.equal(result.sent, 0);
  assert.equal(result.skipped, 1);
  assert.equal(sendEmail.sent.length, 0);

  const [log] = loadEmailLogs();
  assert.equal(log.status, "skipped");
  assert.equal(log.skipped_reason, "incomplete_signals");
});

test("unsubscribed subscribers are skipped before sending", async () => {
  resetState([subscriber("off@example.com", "plus", { dailyDigest: false })]);
  const sendEmail = fakeSendEmail("unsub");

  const result = await sendDailyDigestBatch(
    { dryRun: false, now: new Date("2026-06-02T01:35:00.000Z"), signals: completeSignals(), sendEmail },
    { PUBLIC_URL: "https://savepulse.cloud" }
  );

  assert.equal(result.sent, 0);
  assert.equal(result.skipped, 1);
  assert.equal(sendEmail.sent.length, 0);
  assert.equal(loadEmailLogs()[0].skipped_reason, "unsubscribed");
});

test("duplicate daily email is prevented for same subscriber and signal date", async () => {
  resetState([subscriber("dup@example.com", "plus")]);
  const sendEmail = fakeSendEmail("dup");
  const options = {
    dryRun: false,
    now: new Date("2026-06-02T01:35:00.000Z"),
    signals: completeSignals(),
    sendEmail
  };
  const env = { PUBLIC_URL: "https://savepulse.cloud" };

  const first = await sendDailyDigestBatch(options, env);
  const second = await sendDailyDigestBatch(options, env);

  assert.equal(first.sent, 1);
  assert.equal(second.sent, 0);
  assert.equal(second.skipped, 1);
  assert.equal(sendEmail.sent.length, 1);

  const logs = loadEmailLogs();
  assert.equal(logs.length, 2);
  assert.equal(logs[1].status, "skipped");
  assert.equal(logs[1].skipped_reason, "duplicate_daily_email");
});

test("correct plan template is selected for each subscriber plan", async () => {
  resetState([
    subscriber("free@example.com", "free"),
    subscriber("plus@example.com", "plus"),
    subscriber("pro@example.com", "pro"),
    subscriber("business@example.com", "business")
  ]);
  const sendEmail = fakeSendEmail("plans");

  await sendDailyDigestBatch(
    { dryRun: false, now: new Date("2026-06-02T01:35:00.000Z"), signals: completeSignals(), sendEmail },
    { PUBLIC_URL: "https://savepulse.cloud" }
  );

  const templates = loadEmailLogs().map((log) => log.template_type).sort();
  assert.deepEqual(
    templates,
    ["daily_decision_card", "daily_pulse_lite", "full_timing_radar", "invoice_risk_brief"].sort()
  );
});

test("direction-aware copy is used for subscriber watchlists", () => {
  const signals = completeSignals("2026-06-02T01:31:00.000Z", {
    JPYTHB: { action: ACTIONS.BUY_ZONE }
  });
  const thbToJpy = subscriber("direction@example.com", "plus", {
    watchlist: [{ symbol: "JPYTHB", from: "THB", to: "JPY" }]
  });

  const email = buildDailyDigestEmail({
    plan: "plus",
    locale: "th",
    signals: signalsForSubscriber(signals, thbToJpy),
    dashboardUrl: "https://savepulse.cloud",
    unsubscribeUrl: "https://savepulse.cloud/unsubscribe"
  });

  assert.match(email.html, /รอก่อน/);
  assert.match(email.text, /รอก่อน/);
  assert.doesNotMatch(email.html, /BUY_ZONE|SELL_ZONE|STRONG_BUY|WAIT_ZONE/);
  assert.doesNotMatch(email.text, /BUY_ZONE|SELL_ZONE|STRONG_BUY|WAIT_ZONE/);
});

test("daily email scheduler uses configurable Bangkok 08:30 default window", () => {
  const env = { DAILY_EMAIL_ENABLED: "true" };

  assert.equal(
    dailyDigestScheduleDue(new Date("2026-06-02T01:29:00.000Z"), env, {}).reason,
    "before_scheduled_time"
  );
  assert.equal(dailyDigestScheduleDue(new Date("2026-06-02T01:30:00.000Z"), env, {}).due, true);
  assert.equal(
    dailyDigestScheduleDue(new Date("2026-06-02T02:00:00.000Z"), env, { dailyEmailDate: "2026-06-02" }).reason,
    "already_processed_today"
  );
});
