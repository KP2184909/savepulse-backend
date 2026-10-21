"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const script = fs.readFileSync(path.join(__dirname, "../public/trial/trial.js"), "utf8");
const trial = { status: "active", active: true, startedAt: new Date().toISOString(), endsAt: new Date(Date.now()+14*86400000).toISOString() };
const data = { email: "savepulse.cloud@gmail.com", paidPlan: "free", plan: "pro", trial };
function setup(reply, token = "") {
  const nodes = new Map(), storage = new Map(token ? [["savepulse_session", token]] : []);
  const $ = id => { if (!nodes.has(id)) nodes.set(id, { hidden: ["account", "verifyForm", "start", "cancel"].includes(id), disabled: false, value: id === "email" ? "savepulse.cloud@gmail.com" : "", textContent: "", focus() {} }); return nodes.get(id); };
  const localStorage = { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  const requests = [];
  const context = { document: { getElementById: $, querySelectorAll: () => [...nodes.values()] }, localStorage, Date, Error, JSON, setInterval() {}, fetch: async (url, options) => { requests.push({ url, options }); return reply(url, options); } };
  vm.runInNewContext(script, context);
  return { $, storage, context, requests, async flush() { await new Promise(resolve => setImmediate(resolve)); } };
}
for (const kind of ["HTTP failure", "network failure", "newsletter only"]) test(`trial UI never announces activation on ${kind}`, async () => {
  const f = setup(async () => { if (kind === "network failure") throw Error("network unavailable"); return { ok: kind === "newsletter only", status: 503, json: async () => kind === "newsletter only" ? { subscribed: true } : { error: "trial_not_available" } }; });
  f.$("start").onclick(); await f.flush();
  assert.doesNotMatch(f.$("message").textContent, /Trial activated/);
  assert.equal(f.$("account").hidden, true);
  assert.equal(f.storage.has("savepulse_trial_state"), false);
});
test("browser reload requires server confirmation, cancellation renders returned Free, logout revokes server token", async () => {
  const f = setup(async url => ({ ok: true, status: 200, json: async () => url.endsWith("cancel") ? { ...data, plan: "free", trial: { ...trial, status: "cancelled", active: false, cancelledAt: "2026-01-02" } } : url.endsWith("logout") ? { signedOut: true } : data }), "opaque-test-token");
  await f.flush(); assert.equal(f.$("account").hidden, false); assert.match(f.$("details").textContent, /Current access: pro/);
  f.$("cancel").onclick(); await f.flush(); assert.match(f.$("details").textContent, /Current access: free/); assert.equal(f.$("cancel").hidden, true);
  f.$("logout").onclick(); await f.flush(); assert.equal(f.storage.has("savepulse_session"), false); assert.ok(f.requests.some(r => r.url.endsWith("logout")));
});
test("expired or unconfirmed access is not restored from local browser state", async () => {
  const f = setup(async () => ({ ok: false, status: 401, json: async () => ({ error: "authentication_required" }) }), "expired-token");
  await f.flush(); assert.equal(f.$("account").hidden, true); assert.equal(f.storage.has("savepulse_session"), false);
  assert.doesNotMatch(f.$("message").textContent, /Trial activated/);
});
