"use strict";
const crypto = require("node:crypto");
const DAY = 86400000;
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const fail = (code, status = 503) => Object.assign(new Error(code), { status });
function canonicalEmail(email) {
  const [local, domain] = email.toLowerCase().split("@");
  return ["gmail.com", "googlemail.com"].includes(domain) ? `${local.split("+")[0].replace(/\./g, "")}@gmail.com` : email.toLowerCase();
}
const accountKey = email => `trial:v1:${hash(canonicalEmail(email))}`;

// Direct, awaited database writes. No local JSON fallback for identity or access.
function createTrialStore(env = process.env, fetchImpl = globalThis.fetch) {
  const url = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  async function request(query, options = {}) {
    if (!url || !key) throw fail("trial_storage_unavailable");
    const response = await fetchImpl(`${url}/rest/v1/${query}`, {
      ...options, signal: AbortSignal.timeout(15000),
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=representation", ...options.headers }
    });
    if (!response.ok) throw fail("trial_storage_unavailable");
    return response.status === 204 ? [] : response.json();
  }
  const filter = key => `scheduler_state?key=eq.${encodeURIComponent(key)}`;
  return {
    async get(key) { return (await request(`${filter(key)}&select=value`))[0]?.value || null; },
    async insert(key, value) {
      const rows = await request("scheduler_state?on_conflict=key", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ key, value }) });
      return rows.length === 1;
    },
    async cas(key, version, value) {
      const rows = await request(`${filter(key)}&value->>version=eq.${version}`, { method: "PATCH", body: JSON.stringify({ value, updated_at: new Date().toISOString() }) });
      return rows.length === 1;
    },
    async list() {
      const all = [];
      for (let offset = 0; ; offset += 1000) {
        const rows = await request(`scheduler_state?key=like.trial:v1:*&select=key,value&order=key&limit=1000&offset=${offset}`);
        all.push(...rows.map(r => ({ key: r.key, ...r.value })));
        if (rows.length < 1000) return all;
      }
    },
    async paidPlan(email) {
      const rows = await request(`subscribers?email=eq.${encodeURIComponent(email)}&select=plan,payload&limit=1`);
      // Trial never writes the subscriber's paid record. Billing remains authoritative.
      const plan = rows[0]?.plan || rows[0]?.payload?.plan;
      return ["plus", "pro", "business"].includes(plan) ? plan : "free";
    }
  };
}

function createTrialMailer(env = process.env, fetchImpl = globalThis.fetch) {
  return async function send({ email, subject, text, idempotencyKey }) {
    if (!env.RESEND_API_KEY || !env.FROM_EMAIL) throw fail("trial_email_unavailable");
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from: env.FROM_EMAIL, to: [email], subject, text })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.id) throw fail("trial_email_unavailable");
    return payload.id;
  };
}

function createTrialLifecycle({ store, send, now = Date.now, enabled = true }) {
  async function mutate(key, change) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const old = await store.get(key);
      const next = await change(old);
      if (!next) return old;
      next.version = (old?.version || 0) + 1;
      if (old ? await store.cas(key, old.version, next) : await store.insert(key, next)) return next;
    }
    throw fail("trial_busy_retry", 409);
  }
  const validEmail = raw => {
    const email = String(raw || "").trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail("valid_email_required", 422);
    return email;
  };
  function requireEnabled() { if (!enabled) throw fail("trial_not_available"); }
  async function requestCode(rawEmail, client = "unknown") {
    requireEnabled();
    const email = validEmail(rawEmail), time = now();
    // Bounded global + per-client + per-address limits persist across restarts.
    for (const [key, limit] of [[`trial-rate:global:${Math.floor(time / 3600000)}`, 25], [`trial-rate:daily:${Math.floor(time / DAY)}`, 100], [`trial-rate:email:${hash(canonicalEmail(email))}:${Math.floor(time / 3600000)}`, 5], [`trial-rate:${hash(client)}:${Math.floor(time / 3600000)}`, 5]]) {
      await mutate(key, old => {
        if ((old?.count || 0) >= limit) throw fail("too_many_requests", 429);
        return { count: (old?.count || 0) + 1 };
      });
    }
    const code = String(crypto.randomInt(100000, 1000000));
    const nonce = crypto.randomBytes(24).toString("hex");
    const record = await mutate(accountKey(email), old => {
      if (old?.code?.requestedAt > time - 60000) throw fail("wait_before_resending", 429);
      return { ...old, email, code: { digest: hash(`${nonce}:${code}`), nonce, attempts: 0, requestedAt: time, expiresAt: time + 15 * 60000, status: "pending" } };
    });
    try {
      const messageId = await send({ email, subject: "Your SavePulse verification code", text: `Your SavePulse code is ${code}. It expires in 15 minutes. Enter it only at https://savepulse.cloud/trial/. This verifies your email; it does not start a paid subscription. If you did not request it, ignore this email.`, idempotencyKey: `trial-code/${nonce}` });
      await mutate(accountKey(email), old => old.code?.nonce === nonce ? { ...old, code: { ...old.code, status: "sent", messageId } } : null);
    } catch (error) {
      await mutate(accountKey(email), old => old.code?.nonce === nonce ? { ...old, code: { ...old.code, status: "failed" } } : null);
      throw fail("trial_email_unavailable");
    }
    return { verificationRequired: true, expiresInSeconds: 900 };
  }
  async function verify(rawEmail, code) {
    requireEnabled();
    const email = validEmail(rawEmail), time = now();
    let accepted = false;
    await mutate(accountKey(email), old => {
      accepted = false;
      if (!old?.code || old.code.status !== "sent" || old.code.expiresAt <= time || old.code.attempts >= 5) throw fail("invalid_or_expired_code", 401);
      const matches = /^\d{6}$/.test(String(code)) && hash(`${old.code.nonce}:${code}`) === old.code.digest;
      accepted = matches;
      return { ...old, code: { ...old.code, attempts: old.code.attempts + 1, ...(matches ? { status: "used", digest: null } : {}) } };
    });
    if (!accepted) throw fail("invalid_or_expired_code", 401);
    const token = crypto.randomBytes(32).toString("hex");
    await store.insert(`trial-session:${hash(token)}`, { version: 1, email, expiresAt: time + 30 * DAY });
    return { token, ...(await status(token)) };
  }
  async function identity(token) {
    if (!/^[a-f0-9]{64}$/.test(String(token))) throw fail("authentication_required", 401);
    const session = await store.get(`trial-session:${hash(token)}`);
    if (!session || session.expiresAt <= now()) throw fail("authentication_required", 401);
    return session.email;
  }
  async function logout(token) {
    await identity(token);
    const key = `trial-session:${hash(token)}`;
    await mutate(key, old => ({ ...old, expiresAt: now() }));
    return { signedOut: true };
  }
  async function status(token) {
    const email = await identity(token);
    const record = await store.get(accountKey(email));
    const paidPlan = await store.paidPlan(email);
    const trial = record?.trial;
    const active = Boolean(trial && !trial.cancelledAt && now() < Date.parse(trial.endsAt));
    const plan = paidPlan !== "free" ? paidPlan : active ? "pro" : "free";
    return { email, plan, paidPlan, trialActivated: active, trial: trial ? { active, startedAt: trial.startedAt, endsAt: trial.endsAt, cancelledAt: trial.cancelledAt || null, status: trial.cancelledAt ? "cancelled" : active ? "active" : "expired", reminder: trial.reminder ? { status: trial.reminder.status, sentAt: trial.reminder.sentAt || null, attempts: trial.reminder.attempts || 0 } : null } : { active: false, status: "not_started" }, autoRenew: false, paymentRequired: false };
  }
  async function start(token) {
    requireEnabled();
    const email = await identity(token);
    if (await store.paidPlan(email) !== "free") return status(token);
    await mutate(accountKey(email), old => {
      if (old?.trial) return null; // Permanent trial history: cancelled/expired never resets.
      const time = now();
      return { ...old, trial: { startedAt: new Date(time).toISOString(), endsAt: new Date(time + 14 * DAY).toISOString() } };
    });
    return status(token);
  }
  async function cancel(token) {
    const email = await identity(token);
    await mutate(accountKey(email), old => old?.trial && !old.trial.cancelledAt ? { ...old, trial: { ...old.trial, cancelledAt: new Date(now()).toISOString() } } : null);
    return status(token);
  }
  async function tick() {
    if (!enabled) return { enabled: false };
    const time = now();
    // Any caller may wake the scheduler, but cannot select recipients or alter time.
    let acquired = false;
    await mutate("trial-tick-lock", old => {
      acquired = false;
      if (old?.until > time) return null;
      acquired = true;
      return { until: time + 60000 };
    });
    if (!acquired) return { busy: true };
    let sent = 0, failed = 0;
    for (const record of await store.list()) {
      const trial = record.trial, end = Date.parse(trial?.endsAt);
      if (!trial || trial.cancelledAt || end <= time || end - time > 2 * DAY || await store.paidPlan(record.email) !== "free") continue;
      let claimed = false;
      const claimedRecord = await mutate(record.key, old => {
        claimed = false;
        const reminder = old.trial.reminder;
        if (old.trial.cancelledAt || reminder?.status === "sent" || reminder?.leaseUntil > time || reminder?.retryAt > time) return null;
        // Resend keeps idempotency keys for 24h. Never re-send an ambiguous job outside that window.
        if (reminder?.firstAttemptAt && time - reminder.firstAttemptAt >= 23 * 3600000) return { ...old, trial: { ...old.trial, reminder: { ...reminder, status: "needs_review", retryAt: end } } };
        claimed = true;
        return { ...old, trial: { ...old.trial, reminder: { ...reminder, status: "sending", firstAttemptAt: reminder?.firstAttemptAt || time, attempts: (reminder?.attempts || 0) + 1, leaseUntil: time + 120000 } } };
      });
      if (!claimed) continue;
      const message = { email: record.email, subject: "Your SavePulse trial ends soon — no charge", text: `Your 14-day SavePulse trial ends at ${trial.endsAt}. This reminder is scheduled approximately 48 hours before expiry. After expiry your trial access returns to Free automatically. No card is stored by this trial and there is no automatic charge or renewal. View or cancel at https://savepulse.cloud/trial/. Paid upgrades require a separate choice.`, idempotencyKey: `trial-reminder/${hash(record.key + trial.endsAt)}` };
      try {
        const messageId = await send(message);
        await mutate(record.key, old => ({ ...old, trial: { ...old.trial, reminder: { ...claimedRecord.trial.reminder, status: "sent", messageId, sentAt: new Date(now()).toISOString(), leaseUntil: 0 } } }));
        sent++;
      } catch (error) {
        await mutate(record.key, old => ({ ...old, trial: { ...old.trial, reminder: { ...claimedRecord.trial.reminder, status: "failed", error: "delivery_not_confirmed", retryAt: time + 15 * 60000, leaseUntil: 0 } } }));
        failed++;
      }
    }
    return { sent, failed };
  }
  async function qaReminder(token) {
    const email = await identity(token);
    if (email !== "savepulse.cloud@gmail.com") throw fail("qa_test_account_required", 403);
    // Separate keyspace and injected clock: never change the real account or production clock.
    const day = new Date(now()).toISOString().slice(0, 10), prefix = `trial-qa:${day}:`;
    const qaToken = hash(`isolated-fixture:${day}`), key = accountKey(email);
    const midnight = Date.parse(`${day}T00:00:00Z`);
    const fixture = {
      get: k => store.get(prefix + k), insert: (k, v) => store.insert(prefix + k, v),
      cas: (k, version, v) => store.cas(prefix + k, version, v), paidPlan: async () => "free",
      list: async () => { const value = await store.get(prefix + key); return value ? [{ key, ...value }] : []; }
    };
    await fixture.insert(`trial-session:${hash(qaToken)}`, { version: 1, email, expiresAt: midnight + 60 * DAY });
    await fixture.insert(key, { version: 1, email, trial: { startedAt: new Date(midnight).toISOString(), endsAt: new Date(midnight + 14 * DAY).toISOString() } });
    let virtualTime = now() + 12 * DAY;
    const qa = createTrialLifecycle({ store: fixture, now: () => virtualTime, send: message => send({ ...message, subject: `[TEST] ${message.subject}`, text: `ISOLATED VIRTUAL-TIME QA. This does not change your real trial, billing or customer records.\n\n${message.text}`, idempotencyKey: `qa-${day}/${message.idempotencyKey}` }) });
    const first = await qa.tick();
    virtualTime += 60001;
    const duplicate = await qa.tick();
    const result = await qa.status(qaToken);
    return { isolated: true, virtualClock: true, recipient: email, first, duplicate, reminder: result.trial.reminder, realAccountUnchanged: true };
  }
  return { requestCode, verify, status, start, cancel, tick, identity, logout, qaReminder };
}
module.exports = { createTrialStore, createTrialMailer, createTrialLifecycle, accountKey, DAY };
