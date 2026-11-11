"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ACTIONS, TRACKED_ASSETS } = require("../src/signalEngine");
const { buildDailyDigestEmail } = require("../src/dailyDigestEmail");
const { signalsForSubscriber, assessSignalReadiness } = require("../src/dailyEmailScheduler");

const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "savepulse-digest-"));

process.env.PORT = "0";
process.env.HOST = "127.0.0.1";
process.env.DATA_DIR = tempDataDir;
process.env.WEBHOOK_SECRET = "test-master-secret";
process.env.ADMIN_READINESS_KEY = "test-admin-key";

const {
  dailyDigestCandidates,
  dailyDigestScheduleDue,
  runScheduledDailyDigest,
  dailyEmailRecipientAllowlist,
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
  const sendEmail = async ({ subscriber: targetSubscriber, signals, idempotencyKey }) => {
    sent.push({ subscriber: targetSubscriber, signals, idempotencyKey });
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
  const thbToJpy = subscriber("direction@example.com", "pro", {
    watchlist: [{ symbol: "JPYTHB", from: "THB", to: "JPY" }]
  });

  const email = buildDailyDigestEmail({
    plan: "pro",
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
  const env = { DAILY_EMAIL_ENABLED: "true", DAILY_EMAIL_RECIPIENTS: "pilot@example.com" };

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

test("scheduled daily email stays closed until a recipient allowlist is configured", () => {
  const result = dailyDigestScheduleDue(new Date("2026-06-02T02:00:00.000Z"), {
    DAILY_EMAIL_ENABLED: "true"
  });

  assert.equal(result.due, false);
  assert.equal(result.reason, "recipient_allowlist_required");
});

test("daily email recipient allowlist limits automatic pilot recipients", () => {
  resetState([
    subscriber("owner@example.com", "free"),
    subscriber("pilot@example.com", "free"),
    subscriber("old-test@example.com", "free")
  ]);
  const env = {
    DAILY_EMAIL_RECIPIENTS: " OWNER@example.com, pilot@example.com, invalid "
  };

  assert.deepEqual(dailyEmailRecipientAllowlist(env), ["owner@example.com", "pilot@example.com"]);
  assert.deepEqual(
    dailyDigestCandidates("", "", env).map((record) => record.email),
    ["owner@example.com", "pilot@example.com"]
  );
});

 test("a fresh receipt cannot rejuvenate an old, future or invalid source bar", () => {
  const now = new Date("2026-11-10T02:00:00Z");
  for (const barTime of ["2026-06-01T00:00:00Z", "2026-11-12T00:00:00Z", "invalid"]) {
    const result = assessSignalReadiness(completeSignals(now.toISOString(), {
      USDTHB: { payload: { pine: { barTime } } }
    }), { now });
    assert.equal(result.ready, false);
    assert.ok(result.staleSymbols.includes("USDTHB"));
  }
  const fresh = assessSignalReadiness(completeSignals(now.toISOString(), {
    USDTHB: { payload: { pine: { barTime: now.getTime() } } }
  }), { now });
  assert.equal(fresh.ready, true);
});

test("scheduled runner does not send or mark completion while disabled or missing allowlist", async () => {
  resetState([subscriber("savepulse.cloud@gmail.com", "plus")]);
  const before = fs.readFileSync(SCHEDULER_STATE_FILE, "utf8");
  const now = new Date("2026-11-10T02:00:00Z");
  assert.equal((await runScheduledDailyDigest(now, {})).reason, "disabled");
  assert.equal((await runScheduledDailyDigest(now, { DAILY_EMAIL_ENABLED: "true" })).reason,
    "recipient_allowlist_required");
  assert.deepEqual(loadEmailLogs(), []);
  assert.equal(fs.readFileSync(SCHEDULER_STATE_FILE, "utf8"), before);
});

test("scheduled pilot waits for complete source data, sends only to QA, and does not replay", async () => {
  const qa = "savepulse.cloud@gmail.com";
  resetState([subscriber(qa, "plus"), subscriber("excluded@example.com", "plus")]);
  const env = { DAILY_EMAIL_ENABLED: "true", DAILY_EMAIL_RECIPIENTS: qa };
  const now = new Date("2026-11-10T02:00:00Z");
  const sendEmail = fakeSendEmail("scheduled-qa");
  const missing = completeSignals(now.toISOString()).filter(s => s.symbol !== "USDTHB");
  const first = await runScheduledDailyDigest(now, env, { signals: missing, sendEmail });
  assert.equal(first.waitingForSignals, true);
  assert.equal(sendEmail.sent.length, 0);
  assert.equal(dailyDigestScheduleDue(now, env).due, true);
  const second = await runScheduledDailyDigest(now, env, { signals: completeSignals(now.toISOString()), sendEmail });
  assert.equal(second.result.sent, 1);
  assert.equal(second.waitingForSignals, false);
  assert.deepEqual(sendEmail.sent.map(x => x.subscriber.email), [qa]);
  assert.equal(loadEmailLogs().find(x => x.status === "sent").signal_snapshot_date, "2026-11-10");
  assert.equal((await runScheduledDailyDigest(now, env, { signals: completeSignals(now.toISOString()), sendEmail })).reason,
    "already_processed_today");
  assert.equal(sendEmail.sent.length, 1);
});

test("overlapping scheduled ticks do not dispatch twice in one process", async () => {
  const qa = "savepulse.cloud@gmail.com";
  resetState([subscriber(qa, "plus")]);
  const env = { DAILY_EMAIL_ENABLED: "true", DAILY_EMAIL_RECIPIENTS: qa };
  const now = new Date("2026-11-10T02:00:00Z");
  let release;
  let entered;
  const sending = new Promise(resolve => { entered = resolve; });
  const options = { signals: completeSignals(now.toISOString()), sendEmail: async () => {
    entered();
    await new Promise(resolve => { release = resolve; });
    return { ok: true, providerMessageId: "overlap-qa" };
  }};
  const first = runScheduledDailyDigest(now, env, options);
  await sending;
  assert.equal((await runScheduledDailyDigest(now, env, options)).reason, "already_running");
  release();
  assert.equal((await first).result.sent, 1);
  assert.equal(loadEmailLogs().filter(x => x.status === "sent").length, 1);
});

test("daily delivery identity survives local state recreation and changes by recipient or date", async () => {
  const qa = "savepulse.cloud@gmail.com";
  const sender = fakeSendEmail("identity");
  const dispatch = async (email, date) => {
    resetState([subscriber(email, "plus")]);
    await sendDailyDigestBatch({ now: new Date(date), signals: completeSignals(date), sendEmail: sender }, {});
    return sender.sent.at(-1).idempotencyKey;
  };
  const first = await dispatch(qa, "2026-11-10T02:00:00Z");
  const replay = await dispatch(qa, "2026-11-10T03:00:00Z");
  assert.match(first, /^daily-digest\/v1\/[a-f0-9]{64}$/);
  assert.equal(replay, first);
  assert.notEqual(await dispatch(qa, "2026-11-11T02:00:00Z"), first);
  assert.notEqual(await dispatch("different@example.com", "2026-11-10T02:00:00Z"), first);
  assert.equal(first.includes(qa), false);
});

test("QA pilot requires exactly one approved recipient and disables the ordinary schedule", () => {
  const { dailyEmailPilotReady } = require("../serverRuntime");
  const env = { DAILY_EMAIL_DURABLE_TEST_ENABLED: "true", DAILY_EMAIL_RECIPIENTS: "savepulse.cloud@gmail.com",
    EMAIL_PROVIDER: "resend", RESEND_API_KEY: "fake", SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "fake" };
  assert.equal(dailyEmailPilotReady(env), true);
  for (const overrides of [{ DAILY_EMAIL_ENABLED: "true" }, { DAILY_DIGEST_ENABLED: "true" },
    { DAILY_EMAIL_RECIPIENTS: "savepulse.cloud@gmail.com,other@example.com" },
    { DAILY_DIGEST_RECIPIENTS: "other@example.com" }, { RESEND_API_KEY: "" }]) {
    assert.equal(dailyEmailPilotReady({ ...env, ...overrides }), false);
  }
  assert.equal(dailyDigestScheduleDue(new Date(), { ...env, DAILY_EMAIL_ENABLED: "true" }, {}).reason, "qa_pilot_only");
});

test("pilot HTTP endpoint requires admin authentication and stays off by default", async () => {
  const url = `http://127.0.0.1:${server.address().port}/api/v1/admin/daily-email-pilot`;
  const call = (headers, body = "{}") => fetch(url, { method: "POST", headers, body });
  assert.equal((await call({ "x-webhook-secret": "test-master-secret" })).status, 401);
  const headers = { "x-savepulse-admin-key": "test-admin-key" };
  const preview = await call(headers);
  assert.equal(preview.status, 200);
  const status = await preview.json();
  assert.equal(status.dryRun, true);
  assert.equal(status.sendConfigured, false);
  assert.equal(status.sent, 0);
  const disabled = await call(headers, '{"send":true}');
  assert.equal(disabled.status, 503);
  assert.equal((await disabled.json()).error, "daily_email_pilot_not_ready");
});

for (const plan of ["plus", "pro"]) test(`admin can preview ${plan} for the QA mailbox without changing its Free membership`, async () => {
  resetState([subscriber("savepulse.cloud@gmail.com"), subscriber("excluded@example.com")]);
  const before = fs.readFileSync(SUBSCRIBERS_FILE, "utf8");
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/daily-email-pilot`, {
    method: "POST",
    headers: { "x-savepulse-admin-key": "test-admin-key" },
    body: JSON.stringify({ send: false, report: plan })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.recipients, 1);
  assert.equal(result.outcomes[0].plan, plan);
  assert.equal(result.sent, 0);
  assert.equal(fs.readFileSync(SUBSCRIBERS_FILE, "utf8"), before);
});
