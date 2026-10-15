"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { COMMODITY_ASSETS, LEGACY_ASSETS, normalizeSymbol, createSignal, marketForSymbol } = require("../src/signalEngine");
const { REQUIRED_DAILY_SIGNAL_SYMBOLS, assessSignalReadiness } = require("../src/dailyEmailScheduler");
const { isAssetAllowedForPlan } = require("../src/plans");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "savepulse-commodity-"));
process.env.DATA_DIR = dir;
process.env.WEBHOOK_SECRET = "commodity-test-only";
process.env.PORT = "0";
process.env.HOST = "127.0.0.1";
const { server, latestSignalsSnapshot } = require("../server");
let base;
test.before(async () => { await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
async function post(body) { const res = await fetch(`${base}/api/v1/webhook/tradingview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret_key: "commodity-test-only", ...body }) }); return { status: res.status, body: await res.json() }; }
const now = Date.now();
const payload = (symbol, extra = {}) => ({ symbol, action: "BUY_ZONE", timeframe: "1D", price: 123, bar_time: now, ...extra });

test("canonical aliases retain quoted units and never become currency pairs", () => {
  for (const [symbol, meta] of Object.entries(COMMODITY_ASSETS)) {
    assert.equal(normalizeSymbol(meta.ticker), symbol);
    assert.equal(normalizeSymbol(symbol.toLowerCase()), symbol);
    assert.equal(marketForSymbol(symbol), null);
  }
  assert.equal(COMMODITY_ASSETS.FCPO.currency, "MYR");
  assert.equal(COMMODITY_ASSETS.SUGARUSD.currency, "US cents");
});
test("legacy digest readiness and paid membership universes remain unchanged", () => {
  assert.deepEqual(REQUIRED_DAILY_SIGNAL_SYMBOLS, LEGACY_ASSETS);
  assert.equal(REQUIRED_DAILY_SIGNAL_SYMBOLS.length, 9);
  assert.equal(assessSignalReadiness(LEGACY_ASSETS.map(symbol => ({ symbol, receivedAt: new Date().toISOString() }))).ready, true);
  for (const symbol of Object.keys(COMMODITY_ASSETS)) assert.equal(isAssetAllowedForPlan(symbol, "business"), false);
});
test("wrong override is rejected when source identity is supplied", async () => {
  const r = await post(payload("BTCTHB", { source_ticker: "MYX:FCPO1!" }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "source_symbol_mismatch");
  assert.equal(fs.existsSync(path.join(dir, "signals.json")), false);
});
test("all seven aliases persist canonically and appear with labels in snapshot", async () => {
  for (const [symbol, meta] of Object.entries(COMMODITY_ASSETS)) {
    const r = await post(payload(meta.ticker, { source_ticker: meta.ticker }));
    assert.equal(r.status, 202);
    assert.equal(r.body.signal.symbol, symbol);
    assert.equal(r.body.signal.asset.en, meta.en);
    assert.equal(r.body.signal.meta.en.label, "Commodity reference");
    const res = await fetch(`${base}/api/v1/status?symbol=${encodeURIComponent(meta.ticker)}`);
    assert.equal((await res.json()).signal.symbol, symbol);
  }
  const stored = JSON.parse(fs.readFileSync(path.join(dir, "signals.json")));
  assert.deepEqual(Object.keys(stored), Object.keys(COMMODITY_ASSETS));
  const snapshot = latestSignalsSnapshot();
  assert.equal(snapshot.count, 16);
  assert.equal(snapshot.signals.filter(s => s.asset?.kind === "commodity").length, 7);
  assert.equal(JSON.stringify(snapshot).includes("commodity-test-only"), false);
});
test("duplicate and older commodity bars cannot overwrite the latest price", async () => {
  const duplicate = await post(payload("BRENTUSD", { price: 999 }));
  assert.equal(duplicate.body.reason, "duplicate_bar");
  const older = await post(payload("BRENTUSD", { price: 999, bar_time: now - 86400000 }));
  assert.equal(older.body.reason, "out_of_order_bar");
  const data = JSON.parse(fs.readFileSync(path.join(dir, "signals.json")));
  assert.equal(data.BRENTUSD.price, 123);
});
test("invalid commodity bars and unauthenticated writes are rejected", async () => {
  for (const extra of [{ price: null }, { price: -1 }, { timeframe: "2D" }, { bar_time: null }, { bar_time: now + 86400000 }, { bar_time: now - 10 * 86400000 }]) {
    assert.equal((await post(payload("FCPO", extra))).status, 400);
  }
  assert.equal((await post(payload("FCPO", { secret_key: "wrong" }))).status, 401);
  // Existing payloads without new commodity identity fields still work.
  assert.equal(createSignal({ symbol: "USDTHB", action: "WAIT_ZONE", price: 35 }).symbol, "USDTHB");
});
