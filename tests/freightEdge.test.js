"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const token = "isolated-local-unit-test-token-123456";
const hash = crypto.createHash("sha256").update(token).digest("hex");
const fixture = {
  contractVersion: "freightpulse.draft.v2",
  ruleVersion: "freightpulse.cs.rebound-next-4.lower-close-restart.v1",
  scriptVersion: "freightpulse.container.next4.transport.v4",
  eventId: "edge-unit-fixture",
  symbol: "NYMEX:CS11!",
  family: "container",
  route: "FBX01",
  timeframe: "1D",
  barTime: "2026-10-24T00:00:00Z",
  barCloseTime: "2026-10-25T00:00:00Z",
  barClosed: true,
  signalStatus: "pressure_up",
  windowState: "active",
  windowDay: 2,
  windowStart: "2026-10-23T00:00:00Z",
  confirmationBarTime: "2026-10-22T00:00:00Z",
  sourceUpdatedAt: null,
  sourceFreshness: "unknown",
  source: "unit-fixture",
  dataMode: "test",
};
const env = {
  get: (name) =>
    ({
      SUPABASE_URL: "https://project.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "server-only-fixture",
    })[name],
};
test("Edge receiver uses canonical validator and acknowledges only after credential-free persistence", async () => {
  const { createHandler } =
    await import("../supabase/functions/freightpulse-tv-sandbox/index.mjs");
  let persisted = false,
    calls = [];
  const handler = createHandler(
    env,
    async (url, options) => {
      calls.push({ url, options });
      if (url.includes("sandbox_config"))
        return Response.json([{ token_hash: hash, enabled: true }]);
      const params = JSON.parse(options.body);
      assert.equal(params.p_payload.symbol, "CS11!");
      assert.ok(!options.body.includes(token));
      assert.equal(params.p_fingerprint.length, 64);
      await new Promise((resolve) => setImmediate(resolve));
      persisted = true;
      return Response.json({ accepted: true, duplicate: false });
    },
    () => Date.parse("2026-10-26T12:00:00Z"),
  );
  const request = new Request("https://receiver.invalid", {
    method: "POST",
    body: JSON.stringify({ secret_key: token, payload: fixture }),
  });
  const response = await handler(request);
  assert.equal(response.status, 200);
  assert.equal(persisted, true);
  const data = await response.json();
  assert.equal(data.current, false);
  assert.equal(data.customerNotifications, false);
  assert.equal(data.dataStatus, "source_freshness_unknown");
  assert.equal(calls.length, 2);
});
test("Edge errors never echo token/body and oversized or malformed traffic never reaches storage", async () => {
  const { createHandler } =
    await import("../supabase/functions/freightpulse-tv-sandbox/index.mjs");
  let calls = 0;
  const handler = createHandler(env, async () => {
    calls++;
    return Response.json([{ token_hash: hash, enabled: true }]);
  });
  for (const [body, status] of [
    ["{bad-secret-value", 400],
    ["x".repeat(16385), 413],
    [JSON.stringify({ secret_key: "wrong", payload: fixture }), 401],
  ]) {
    const r = await handler(
      new Request("https://receiver.invalid", { method: "POST", body }),
    );
    assert.equal(r.status, status);
    assert.ok(!(await r.text()).includes(token));
  }
  assert.equal(calls, 0);
  assert.equal(
    (await handler(new Request("https://receiver.invalid", { method: "PUT" })))
      .status,
    405,
  );
});
test("Generated Edge validator agrees with backend on accepted payload and rejected CS day five", async () => {
  const edge =
    await import("../supabase/functions/freightpulse-tv-sandbox/validator.mjs");
  const backend = require("../src/freightpulse");
  const rules = { versions: { "CS11!": [fixture.scriptVersion] } },
    now = Date.parse("2026-10-26T12:00:00Z");
  assert.deepEqual(
    edge.validateSignal(fixture, now, rules),
    backend.validateSignal(fixture, now, rules),
  );
  for (const module of [edge, backend])
    assert.throws(
      () => module.validateSignal({ ...fixture, windowDay: 5 }, now, rules),
      /invalid_window/,
    );
});

test("BDI sandbox rule accepts four-day windows only for its approved transport, preserves freshness masking, and leaves ZIM unchanged", async () => {
  const edge = await import("../supabase/functions/freightpulse-tv-sandbox/validator.mjs");
  const backend = require("../src/freightpulse");
  const bdi = {...fixture, symbol:"INDEX:BDI",family:"bulk",route:null,scriptVersion:"freightpulse.bulk.next4.transport.v1",ruleVersion:"freightpulse.bdi.rebound-next-4.lower-close-restart.v1"};
  const rules={versions:{BDI:[bdi.scriptVersion,"freightpulse.context.telemetry.v1"],ZIM:[bdi.scriptVersion]}};
  const now=Date.parse("2026-10-26T12:00:00Z");
  for(const api of [edge,backend]) {
    const clean=api.validateSignal(bdi,now,rules);
    assert.equal(clean.windowDay,2);
    assert.equal(api.signalView(clean,now,86400).current,false);
    assert.equal(api.signalView(clean,now,86400).windowDay,null);
    assert.throws(()=>api.validateSignal({...bdi,windowDay:5},now,rules),/invalid_window/);
    assert.throws(()=>api.validateSignal({...bdi,ruleVersion:fixture.ruleVersion},now,rules),/bdi_rule_version_required/);
    assert.throws(()=>api.validateSignal({...bdi,scriptVersion:"freightpulse.context.telemetry.v1"},now,rules),/window_not_applicable/);
    assert.throws(()=>api.validateSignal({...bdi,symbol:"NYSE:ZIM",family:"context"},now,rules),/window_not_applicable/);
  }
});

test("ZIM adapter preserves supplied SavePulse calculation block and sandbox context contract", async () => {
  const fs=require("node:fs");
  const pine=fs.readFileSync(require("node:path").join(__dirname,"../pine/freightpulse/zim-savepulse-context-sandbox.pine"),"utf8");
  const core=pine.slice(pine.indexOf("// [3] CORE INDICATORS"),pine.indexOf("// [5] SYMBOL & PAYLOAD"));
  assert.equal(crypto.createHash("sha256").update(core).digest("hex"),"3b5a961707f0a215c5badcd0095a5b2f7e2c9b98f11170125ecdc237cbcb74a2");
  assert.match(pine,/barstate.isrealtime and barstate.isconfirmed/);
  assert.match(pine,/syminfo.prefix == "BATS"/);
  const edge=await import("../supabase/functions/freightpulse-tv-sandbox/validator.mjs");
  const rules={versions:{ZIM:["freightpulse.zim.savepulse-context.v1"]}};
  const z={...fixture,symbol:"NYSE:ZIM",family:"context",route:null,scriptVersion:"freightpulse.zim.savepulse-context.v1",ruleVersion:"freightpulse.zim.savepulse-ema14-60-window5.v1",windowState:"inactive",windowDay:null,windowStart:null,confirmationBarTime:null};
  const now=Date.parse("2026-10-26T12:00:00Z");
  for(const api of [edge,require("../src/freightpulse")]){
    assert.equal(api.validateSignal(z,now,rules).symbol,"ZIM");
    assert.equal(api.signalView(api.validateSignal(z,now,rules),now,86400).signalStatus,null);
    assert.throws(()=>api.validateSignal({...z,ruleVersion:fixture.ruleVersion},now,rules),/zim_rule_version_required/);
    assert.throws(()=>api.validateSignal({...z,windowState:"active",windowDay:1},now,rules),/window_not_applicable/);
  }
});
