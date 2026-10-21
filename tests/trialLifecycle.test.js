"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createTrialLifecycle, createTrialStore, accountKey, DAY } = require("../src/trialLifecycle");
function fixture() {
  const rows = new Map(), mail = [], paid = new Map();
  let time = Date.parse("2026-01-01T00:00:00Z"), failures = 0;
  const clone = value => value ? structuredClone(value) : null;
  const store = {
    async get(key) { return clone(rows.get(key)); },
    async insert(key, value) { if (rows.has(key)) return false; rows.set(key, clone(value)); return true; },
    async cas(key, version, value) { if (rows.get(key)?.version !== version) return false; rows.set(key, clone(value)); return true; },
    async list() { return [...rows].filter(([key]) => key.startsWith("trial:v1:")).map(([key, value]) => ({ key, ...clone(value) })); },
    async paidPlan(email) { return paid.get(email) || "free"; }
  };
  const options = { store, now: () => time, send: async message => { mail.push(message); if (failures-- > 0) throw Error("provider failure"); return `provider-${mail.length}`; } };
  const api = createTrialLifecycle(options);
  async function login(email = "savepulse.cloud@gmail.com") {
    await api.requestCode(email);
    const code = mail.at(-1).text.match(/code is (\d{6})/)[1];
    return api.verify(email, code);
  }
  return { api, store, rows, mail, paid, options, login, advance: ms => time += ms, failNext: () => failures = 1 };
}
test("verified signup, exact expiry, restart/reload, and permanent duplicate protection", async () => {
  const f = fixture(), { token } = await f.login();
  assert.equal((await f.api.status(token)).trial.status, "not_started");
  const first = await f.api.start(token);
  assert.equal(first.plan, "pro"); assert.equal(first.autoRenew, false); assert.equal(first.paymentRequired, false);
  assert.equal(Date.parse(first.trial.endsAt) - Date.parse(first.trial.startedAt), 14 * DAY);
  f.advance(DAY);
  const restarted = createTrialLifecycle(f.options);
  assert.equal((await restarted.status(token)).plan, "pro");
  assert.equal((await restarted.start(token)).trial.endsAt, first.trial.endsAt);
  f.advance(13 * DAY - 1); assert.equal((await restarted.status(token)).plan, "pro");
  f.advance(1); assert.equal((await restarted.status(token)).plan, "free");
  assert.equal((await restarted.start(token)).trial.status, "expired");
});
test("email is not identity; codes expire, have bounded attempts, are single use, and no secrets are stored raw", async () => {
  const f = fixture(), email = "savepulse.cloud@gmail.com";
  await assert.rejects(f.api.start(email), /authentication_required/);
  await f.api.requestCode(email); const code = f.mail.at(-1).text.match(/code is (\d{6})/)[1];
  assert.ok(!JSON.stringify([...f.rows]).includes(code));
  await assert.rejects(f.api.requestCode(email), /wait_before_resending/);
  for (let i = 0; i < 5; i++) await assert.rejects(f.api.verify(email, "000000"), /invalid_or_expired_code/);
  await assert.rejects(f.api.verify(email, code), /invalid_or_expired_code/);
  f.advance(60001); const auth = await f.login();
  await assert.rejects(f.api.verify(email, f.mail.at(-1).text.match(/code is (\d{6})/)[1]), /invalid_or_expired_code/);
  assert.ok(!JSON.stringify([...f.rows]).includes(auth.token));
  f.advance(30 * DAY); await assert.rejects(f.api.status(auth.token), /authentication_required/);
});
test("verification expiry and failed email never activate access", async () => {
  const f = fixture(); await f.api.requestCode("savepulse.cloud@gmail.com");
  const code = f.mail.at(-1).text.match(/code is (\d{6})/)[1];
  f.advance(15 * 60000);
  await assert.rejects(f.api.verify("savepulse.cloud@gmail.com", code), /invalid_or_expired_code/);
  f.failNext(); await assert.rejects(f.api.requestCode("savepulse.cloud@gmail.com"), /trial_email_unavailable/);
  assert.equal(f.rows.get(accountKey("savepulse.cloud@gmail.com")).trial, undefined);
});
test("cancel is server persisted, idempotent, and cannot restart; paid memberships are preserved", async () => {
  const f = fixture(), { token } = await f.login();
  await f.api.start(token); await f.api.cancel(token);
  assert.equal((await f.api.status(token)).plan, "free");
  assert.equal((await f.api.start(token)).trial.status, "cancelled");
  assert.equal((await f.api.cancel(token)).trial.status, "cancelled");
  f.paid.set("savepulse.cloud@gmail.com", "business");
  assert.equal((await f.api.cancel(token)).plan, "business");
  assert.equal((await f.api.start(token)).plan, "business");
});
test("concurrent activation and cancellation do not reset timestamps or resurrect cancelled access", async () => {
  const f = fixture(), { token } = await f.login();
  const starts = await Promise.all([f.api.start(token), f.api.start(token)]);
  assert.equal(starts[0].trial.endsAt, starts[1].trial.endsAt);
  await Promise.all([f.api.cancel(token), f.api.start(token)]);
  assert.equal((await f.api.status(token)).trial.status, "cancelled");
});
test("48-hour reminder, concurrent workers, stable key and retry after failure without duplicates", async () => {
  const f = fixture(), { token } = await f.login(); await f.api.start(token);
  f.advance(12 * DAY - 1); await f.api.tick(); assert.equal(f.mail.length, 1);
  f.advance(60001); f.failNext();
  assert.equal((await f.api.tick()).failed, 1);
  assert.equal((await f.api.status(token)).trial.reminder.status, "failed");
  const failedMessage = f.mail.at(-1);
  f.advance(15 * 60000);
  await Promise.all([f.api.tick(), f.api.tick()]);
  assert.deepEqual(f.mail.at(-1), failedMessage);
  assert.equal((await f.api.status(token)).trial.reminder.status, "sent");
  f.advance(DAY); await f.api.tick(); assert.equal(f.mail.length, 3);
});
test("cancelled, expired, paid and ambiguous jobs outside provider retention never get reminder retries", async () => {
  for (const scenario of ["cancelled", "expired", "paid", "ambiguous"]) {
    const f = fixture(), { token } = await f.login(); await f.api.start(token);
    if (scenario === "cancelled") await f.api.cancel(token);
    if (scenario === "paid") f.paid.set("savepulse.cloud@gmail.com", "pro");
    f.advance(scenario === "expired" ? 14 * DAY : 12 * DAY);
    if (scenario === "ambiguous") { f.failNext(); await f.api.tick(); f.advance(23 * 3600000); }
    const count = f.mail.length; await f.api.tick(); assert.equal(f.mail.length, count);
    if (scenario === "ambiguous") assert.equal((await f.api.status(token)).trial.reminder.status, "needs_review");
  }
});
test("database outage fails closed and concurrent CAS exhaustion does not grant access", async () => {
  const f = fixture(), { token } = await f.login();
  f.store.cas = async () => false;
  await assert.rejects(f.api.start(token), /trial_busy_retry/);
  assert.equal((await f.api.status(token)).plan, "free");
  f.store.get = async () => { throw Error("storage unavailable"); };
  await assert.rejects(f.api.status(token), /storage unavailable/);
});
test("production storage awaits unique insert and version-conditional PATCH and rejects HTTP failures", async () => {
  const calls = [];
  const store = createTrialStore({ SUPABASE_URL: "https://database.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-only" }, async (url, options) => {
    calls.push({ url, options }); return { ok: true, status: 200, json: async () => [{ value: { version: 2 } }] };
  });
  assert.equal(await store.insert("test", { version: 1 }), true);
  assert.match(calls[0].options.headers.prefer, /ignore-duplicates/);
  await store.cas("test", 1, { version: 2 }); assert.match(calls[1].url, /value->>version=eq.1/);
  const broken = createTrialStore({ SUPABASE_URL: "https://database.invalid", SUPABASE_SERVICE_ROLE_KEY: "test" }, async () => ({ ok: false }));
  await assert.rejects(broken.get("test"), /trial_storage_unavailable/);
});
test("Gmail aliases share one trial history but unrelated mailboxes do not", async () => {
  assert.equal(accountKey("save.pulse+qa@gmail.com"), accountKey("savepulse@googlemail.com"));
  assert.notEqual(accountKey("savepulse+qa@example.com"), accountKey("savepulse@example.com"));
  const f = fixture(), first = await f.login("savepulse.cloud@gmail.com"); await f.api.start(first.token);
  f.advance(DAY); const second = await f.login("save.pulse.cloud+qa@gmail.com");
  assert.equal((await f.api.start(second.token)).trial.endsAt, (await f.api.status(first.token)).trial.endsAt);
});
test("isolated virtual-time reminder QA sends only to the authorized test mailbox and never changes its real trial", async () => {
  const f = fixture(), { token } = await f.login(); await f.api.start(token);
  const before = await f.api.status(token);
  const qa = await f.api.qaReminder(token);
  assert.equal(qa.first.sent, 1); assert.equal(qa.duplicate.sent, 0); assert.equal(qa.reminder.status, "sent");
  assert.match(f.mail.at(-1).subject, /^\[TEST\]/); assert.equal(f.mail.at(-1).email, "savepulse.cloud@gmail.com");
  assert.deepEqual(await f.api.status(token), before);
  await f.api.qaReminder(token); assert.equal(f.mail.length, 2);
  const other = await f.login("other@example.com");
  await assert.rejects(f.api.qaReminder(other.token), /qa_test_account_required/);
});
