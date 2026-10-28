"use strict";
const { CONTAINERS, signalView } = require("./freightpulse");
const ROUTES = require("../public/freightpulse/routes");
const { csWindowCopy } = require("../public/freightpulse/cs-window-copy");
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
      contractVersion: "freightpulse.draft.v2",
      ruleVersion: "freightpulse.cs.rebound-next-4.v1",
      scriptVersion: "freightpulse.container.next4.demo.v1",
      sourceFreshness: "known",
      windowState: "inactive",
      confirmationBarTime: null,
      symbol,
      route: ROUTES[symbol].benchmark,
      family: "container",
      signalStatus:
        index % 3 === 0
          ? "pressure_up"
          : index % 3 === 1
            ? "easing"
            : "unclear",
    };
    if (signal.signalStatus === "pressure_up") {
      signal.windowState = index === 3 ? "expired" : "active";
      signal.windowDay = index === 3 ? null : 2;
      signal.windowStart = index === 3 ? null : iso(now - 49 * hour);
      signal.confirmationBarTime = iso(now - 73 * hour);
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
    notificationPreview: {
      demo: true,
      sent: false,
      ...csWindowCopy(routes[0]),
    },
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
