"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { once } = require("node:events");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "savepulse-trial-integrity-"));
process.env.PORT = "0";
process.env.HOST = "127.0.0.1";
process.env.DATA_DIR = dir;
process.env.WEBHOOK_SECRET = "test-trial-only";
const original = [{ id: "paid-member", email: "member@example.com", plan: "pro", billing: { status: "active" } }];
const subscriberFile = path.join(dir, "subscribers.json");
fs.writeFileSync(subscriberFile, JSON.stringify(original));
const { server } = require("../server");
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("trial requests fail closed without downgrading a paid member or creating a newsletter signup", async () => {
  if (!server.listening) await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const email of ["member@example.com", "new@example.com"]) {
    const response = await fetch(`${base}/api/v1/subscribe`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, plan: "free", startTrial: true, trialDays: 14 })
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "trial_not_available", trialActivated: false });
    assert.deepEqual(JSON.parse(fs.readFileSync(subscriberFile)), original);
  }
});

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const handlerStart = html.indexOf('$("trialModalForm").onsubmit=');
const handlerEnd = html.indexOf('$("form").onsubmit=', handlerStart);
const handler = html.slice(handlerStart, handlerEnd);

async function submitTrial(fetchImpl) {
  const nodes = new Map();
  const $ = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, disabled: false, value: "member@example.com", textContent: "" });
    return nodes.get(id);
  };
  const st = { lang: "en", key: "COPPERUSD", modalPlan: "free", trial: null };
  const context = { $, st, fetch: fetchImpl, Date, Number, Error, JSON, saveTrialState: () => {}, renderTrialBar: () => {}, watch: () => {}, render: () => {} };
  vm.runInNewContext(handler, context);
  await $("trialModalForm").onsubmit({ preventDefault() {} });
  return { st, $ };
}

for (const [name, fetchImpl] of [
  ["HTTP rejection", async () => ({ ok: false, json: async () => ({ error: "trial_not_available" }) })],
  ["network failure", async () => { throw Error("network down"); }],
  ["newsletter success without trial", async () => ({ ok: true, json: async () => ({ subscribed: true }) })],
  ["expired server entitlement", async () => ({ ok: true, json: async () => ({ trialActivated: true, trial: { active: true, startedAt: "2020-01-01", endsAt: "2020-01-15" } }) })]
]) {
  test(`browser does not announce VIP activation after ${name}`, async () => {
    const { st, $ } = await submitTrial(fetchImpl);
    assert.equal(st.trial, null);
    assert.equal($("trialModalSuccess").hidden, true);
    assert.equal($("trialModalError").hidden, false);
    assert.equal($("trialModalSubmit").disabled, false);
  });
}

test("legacy browser preview cannot restore VIP access", () => {
  const load = html.match(/const loadTrialState=\(\)=>null;/)[0];
  const unlocked = html.match(/const isTrialUnlocked=\(\)=>[^;]+;/)[0];
  const context = { st: { trial: { active: true, endsAt: new Date(Date.now() + 86400000).toISOString() } }, Date, Boolean };
  assert.equal(vm.runInNewContext(`${load};loadTrialState()`, context), null);
  assert.equal(vm.runInNewContext(`${unlocked};isTrialUnlocked()`, context), false);
  assert.doesNotMatch(html, /id="toggleTrialPreviewBtn"/);
});
