"use strict";
// Authorized synthetic test traffic only. Never prints or stores the token.
const fs = require("node:fs"),
  { performance } = require("node:perf_hooks");
async function main() {
  const url =
    "https://sktzydyiwqylpstxjicf.supabase.co/functions/v1/freightpulse-tv-sandbox";
  const token = fs
    .readFileSync(
      "/Users/karnpiyathanin/.codex/freightpulse-sandbox/webhook-token.txt",
      "utf8",
    )
    .trim();
  const symbols = [
    "CS11!",
    "CS21!",
    "CS31!",
    "CS41!",
    "CS51!",
    "CS61!",
    "BDI",
    "ZIM",
  ];
  const routes = ["FBX01", "FBX02", "FBX03", "FBX11", "FBX12", "FBX13"];
  const results = [];
  function fixture(symbol, i) {
    const cs = i < 6;
    return {
      contractVersion: "freightpulse.draft.v2",
      scriptVersion: cs
        ? "freightpulse.container.next4.transport.v3"
        : "freightpulse.context.telemetry.v1",
      eventId: "isolated-qa-" + symbol + "-20261026-next",
      symbol: (cs ? "NYMEX:" : i === 6 ? "INDEX:" : "NYSE:") + symbol,
      family: cs ? "container" : i === 6 ? "bulk" : "context",
      route: cs ? routes[i] : null,
      timeframe: "1D",
      barTime: "2026-10-24T00:00:00Z",
      barCloseTime: "2026-10-25T00:00:00Z",
      barClosed: true,
      signalStatus: cs ? "pressure_up" : "unclear",
      windowState: cs ? "active" : "inactive",
      windowDay: cs ? 2 : null,
      windowStart: cs ? "2026-10-23T00:00:00Z" : null,
      ...(cs
        ? {
            ruleVersion:
              "freightpulse.cs.rebound-next-4.lower-close-restart.v1",
            confirmationBarTime: "2026-10-22T00:00:00Z",
          }
        : {}),
      sourceUpdatedAt: null,
      sourceFreshness: "unknown",
      source: "isolated-synthetic-qa",
      dataMode: "test",
    };
  }
  async function check(name, p, expected = 200, secret = token) {
    const start = performance.now();
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret_key: secret, payload: p }),
    });
    const raw = await r.text();
    if (raw.includes(token)) throw Error("credential_echo");
    const body = JSON.parse(raw);
    results.push({
      name,
      status: r.status,
      expected,
      pass: r.status === expected,
      ms: Math.round(performance.now() - start),
      body,
    });
  }
  for (let i = 0; i < symbols.length; i++)
    await check(symbols[i], fixture(symbols[i], i));
  const p = fixture("CS11!", 0);
  await check("unauthorized", p, 401, "wrong");
  await check(
    "out-of-order",
    {
      ...p,
      barTime: "2026-10-23T00:00:00Z",
      barCloseTime: "2026-10-24T00:00:00Z",
      windowStart: "2026-10-22T00:00:00Z",
      confirmationBarTime: "2026-10-21T00:00:00Z",
    },
    409,
  );
  await check("same-bar-conflict", { ...p, windowDay: 3 }, 409);
  await check("wrong-route", { ...p, route: "FBX02" }, 422);
  await check("live-rejected", { ...p, dataMode: "live" }, 422);
  await check("duplicate-new-event-id", { ...p, eventId: "different-id" }, 200);
  const file =
    "/Users/karnpiyathanin/Documents/New project/freightpulse-qa-evidence/edge-receiver-e2e.json";
  fs.writeFileSync(file, JSON.stringify(results, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        url,
        passed: results.filter((r) => r.pass).length,
        total: results.length,
        maxMs: Math.max(...results.map((r) => r.ms)),
        results,
      },
      null,
      2,
    ),
  );
  if (results.some((r) => !r.pass)) process.exitCode = 1;
}
main().catch(() => {
  console.error("Sandbox receiver QA failed; inspect sanitized evidence.");
  process.exitCode = 1;
});
