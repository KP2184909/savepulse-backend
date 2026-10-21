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
test("homepage delegates activation to verified flow, never newsletter or local preview", () => {
  assert.match(html, /function openTrialModal\(\)\{window.location.assign\("\/trial\/"\)/);
  assert.doesNotMatch(html, /startTrial:true/);
  const load = html.match(/const loadTrialState=\(\)=>null;/)[0];
  const unlocked = html.match(/const isTrialUnlocked=\(\)=>[^;]+;/)[0];
  const context = { st: { trial: { active: true, endsAt: new Date(Date.now() + 86400000).toISOString() } }, Date, Boolean };
  assert.equal(vm.runInNewContext(`${load};loadTrialState()`, context), null);
  assert.equal(vm.runInNewContext(`${unlocked};isTrialUnlocked()`, context), false);
  assert.doesNotMatch(html, /id="toggleTrialPreviewBtn"/);
});
test("unauthenticated newsletter request cannot change or expose an existing paid record", async () => {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/subscribe`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "member@example.com", plan: "free", watchlist: ["USDJPY"] }) });
  assert.equal(response.status, 202);
  const data = await response.json(); assert.equal(data.subscriber, undefined);
  assert.deepEqual(JSON.parse(fs.readFileSync(subscriberFile)), original);
});
