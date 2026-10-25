"use strict";
const { CONTAINERS, signalView } = require("./freightpulse");
function demoReport(now = Date.now()) {
  const hour = 3600000,
    iso = (t) => new Date(t).toISOString();
  const common = {
    contractVersion: "freightpulse.draft.v1",
    scriptVersion: "demo-only",
    timeframe: "1D",
    barClosed: true,
    dataMode: "demo",
    source: "Demo fixture — not market data",
    barTime: iso(now - 25 * hour),
    barCloseTime: iso(now - hour),
    sourceUpdatedAt: iso(now - hour),
    windowDay: null,
    windowStart: null,
  };
  const routes = CONTAINERS.map((symbol, index) => {
    if (index === 5)
      return {
        symbol,
        family: "container",
        dataMode: "demo",
        ...signalView(null, now, 36 * 3600),
      };
    const signal = {
      ...common,
      symbol,
      route: symbol,
      family: "container",
      signalStatus:
        index % 3 === 0
          ? "pressure_up"
          : index % 3 === 1
            ? "easing"
            : "unclear",
    };
    if (signal.signalStatus === "pressure_up") {
      signal.windowDay = 2;
      signal.windowStart = iso(now - 49 * hour);
    }
    if (index === 4) {
      signal.sourceUpdatedAt = iso(now - 120 * hour);
      signal.barTime = iso(now - 144 * hour);
      signal.barCloseTime = iso(now - 120 * hour);
    }
    return {
      symbol,
      family: "container",
      ...signalView(signal, now, 36 * 3600),
    };
  });
  return {
    service: "freightpulse",
    mode: "demo",
    generatedAt: iso(now),
    routes,
    context: ["BDI", "ZIM"].map((symbol) => ({
      symbol,
      family: symbol === "BDI" ? "bulk" : "context",
      ...signalView(
        {
          ...common,
          symbol,
          route: symbol,
          family: symbol === "BDI" ? "bulk" : "context",
          signalStatus: symbol === "BDI" ? "easing" : "unclear",
        },
        now,
        36 * 3600,
      ),
    })),
    history: [
      {
        id: "demo-notification",
        symbol: "CS11!",
        status: "demo_not_sent",
        at: iso(now - hour),
        dataMode: "demo",
      },
    ],
    notice:
      "Demo only. Commercial rights, freshness SLA and signal cancellation/restart rules await agreement. Explanations are templates; no live AI model or real feed is connected.",
  };
}
module.exports = { demoReport };
