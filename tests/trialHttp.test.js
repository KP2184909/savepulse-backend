"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const rows = new Map(), mail = [];
const originalFetch = global.fetch;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "savepulse-trial-http-"));
Object.assign(process.env, { PORT: "0", HOST: "127.0.0.1", DATA_DIR: dir, SUPABASE_URL: "https://database.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-not-secret", RESEND_API_KEY: "test-not-secret", FROM_EMAIL: "test@example.invalid" });
global.fetch = async (rawUrl, options = {}) => {
  const url = new URL(rawUrl);
  if (url.hostname === "api.resend.com") { mail.push(JSON.parse(options.body)); return Response.json({ id: "test-provider" }); }
  if (url.hostname !== "database.invalid") return originalFetch(rawUrl, options);
  if (url.pathname.endsWith("/subscribers")) return Response.json([]);
  const key = url.searchParams.get("key")?.replace(/^eq\./, "");
  if (options.method === "POST") {
    const record = JSON.parse(options.body);
    if (rows.has(record.key)) return Response.json([]);
    rows.set(record.key, record.value); return Response.json([record]);
  }
  if (options.method === "PATCH") {
    const version = Number(url.searchParams.get("value->>version")?.replace(/^eq\./, ""));
    if (rows.get(key)?.version !== version) return Response.json([]);
    rows.set(key, JSON.parse(options.body).value); return Response.json([{ key, value: rows.get(key) }]);
  }
  return Response.json(rows.has(key) ? [{ key, value: rows.get(key) }] : []);
};
const { server } = require("../server");
let base;
test.before(async () => { if (!server.listening) await once(server, "listening"); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { await new Promise(resolve => server.close(resolve)); global.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }); });
async function api(route, body, token) {
  const response = await originalFetch(`${base}/api/v1/trial/${route}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
test("HTTP signup, auth, entitlement after reload, cancel, paid-data-safe status and logout", async () => {
  assert.equal((await api("readiness")).data.ready, true);
  assert.equal((await api("status")).status, 401);
  assert.equal((await api("cancel", { email: "savepulse.cloud@gmail.com" })).status, 401);
  assert.equal((await api("code", { email: "invalid" })).status, 422);
  assert.equal((await api("code", { email: "savepulse.cloud@gmail.com" })).status, 200);
  const code = mail.at(-1).text.match(/code is (\d{6})/)[1];
  assert.equal((await api("verify", { email: "savepulse.cloud@gmail.com", code: "000000" })).status, 401);
  const auth = await api("verify", { email: "savepulse.cloud@gmail.com", code });
  assert.equal(auth.status, 200);
  const token = auth.data.token;
  const premiumBefore = await originalFetch(`${base}/api/v1/status?symbol=XAUUSD`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(premiumBefore.status, 403);
  const started = await api("start", {}, token);
  assert.equal(started.data.trial.active, true);
  assert.equal(started.headers.get("cache-control"), "no-store");
  assert.deepEqual((await api("status", undefined, token)).data, started.data);
  assert.equal((await originalFetch(`${base}/api/v1/status?symbol=XAUUSD`, { headers: { authorization: `Bearer ${token}` } })).status, 200);
  assert.equal((await api("start", {}, token)).data.trial.endsAt, started.data.trial.endsAt);
  assert.equal((await api("cancel", {}, token)).data.plan, "free");
  assert.equal((await originalFetch(`${base}/api/v1/status?symbol=XAUUSD`, { headers: { authorization: `Bearer ${token}` } })).status, 403);
  assert.equal((await api("logout", {}, token)).data.signedOut, true);
  assert.equal((await api("status", undefined, token)).status, 401);
});
test("all seven commodity directions return neutral reference semantics and original quote units", async () => {
  const expected = { COPPERUSD: "USD", BRENTUSD: "USD", WTIUSD: "USD", NGUSD: "USD", ALUMINUMUSD: "USD", SUGARUSD: "US cents", FCPO: "MYR" };
  for (const [symbol, currency] of Object.entries(expected)) {
    const response = await originalFetch(`${base}/api/v1/status?symbol=${symbol}&from=USD&to=${symbol.replace("USD", "")}`);
    const data = await response.json();
    assert.equal(response.status, 200); assert.equal(data.userFacing.kind, "commodity_reference");
    assert.equal(data.userFacing.inverted, false); assert.equal(data.signal.asset.currency, currency);
    assert.doesNotMatch(data.userFacing.label.en, /good time|cheap|VIP Unlocked/i);
  }
});
test("trial and exact legal routes serve documents, not the SPA", async () => {
  for (const [route, text] of [["/trial/", "Your 14-day trial"], ["/terms", "14-day no-card trial"], ["/refund", "No refund is needed"]]) {
    const response = await originalFetch(base + route); assert.equal(response.status, 200); assert.ok((await response.text()).includes(text));
  }
});
