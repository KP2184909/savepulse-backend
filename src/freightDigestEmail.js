"use strict";
const ROUTES = require("../public/freightpulse/routes");
const { contextCopy } = require("../public/freightpulse/context-copy");
const { csWindowCopy } = require("../public/freightpulse/cs-window-copy");
const SYMBOLS = [...Object.keys(ROUTES), "BDI", "ZIM"];
const escape = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date = (s) => s && Number.isFinite(Date.parse(s)) ? new Date(s).toLocaleString("en-GB", {timeZone:"Asia/Bangkok",dateStyle:"medium",timeStyle:"short"}) + " ICT" : "Unknown";
function freightDigestEmail({ rows = [], generatedAt, mode = "test" } = {}) {
  if (!["demo", "test"].includes(mode)) throw Error("freight_live_email_not_enabled");
  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  const sections = SYMBOLS.map((symbol) => {
    const r = bySymbol.get(symbol) || {symbol, current:false, dataStatus:"missing"};
    const context = contextCopy(r);
    const title = ROUTES[symbol]?.name || context?.en || symbol;
    const status = !r.current ? ({stale:"Outdated data — not a current assessment",source_freshness_unknown:"Source freshness not verified",missing:"Data unavailable"}[r.dataStatus] || "No verified current assessment available") : context ? context.statusEn || "Assessment not enabled" : ({pressure_up:"Upward rate pressure",easing:"Rate pressure easing",unclear:"Direction unclear"}[r.signalStatus] || "Direction unclear");
    const window = ROUTES[symbol] && r.current ? csWindowCopy(r) : null;
    const explanation = symbol === "BDI" ? "Dry-bulk market context only. This is not a container booking rate and does not establish the direction of rates on your company's routes." : "ZIM equity context only. Company-specific factors may affect the share price; assess it alongside route-level freight data and actual quotes.";
    const windowExplanation = r.windowState === "expired" ? "The end of this window does not mean rates have started falling." : "An initial rebound has been identified. Consider requesting quotes and reviewing booking terms alongside current offers, vessel space and your shipment schedule.";
    const lines = [title, status, ...(window ? [window.en,windowExplanation] : []), `Source updated: ${date(r.sourceUpdatedAt)}`, `Source: ${r.source || "Not connected"}`, ...(context ? [explanation] : [])];
    return {symbol, lines};
  });
  const label = mode === "demo" ? "DEMO — Illustrative data, not a live market report" : "TEST — Test report; service not yet live";
  const intro = [label,"FreightPulse · All shipping routes in one brief",`Prepared: ${date(generatedAt)}`,"Six container routes, with separate BDI and ZIM market context"];
  const footer = ["Before booking, check current quotes, quote validity, vessel space, sailing dates, surcharges and booking terms.", "Futures indicate market trends, not actual booking quotes. Continuous contracts may be affected by contract rolls. No best-price or savings guarantee is made.", "All FreightPulse subscribers receive the same complete route brief. Email preferences will be available in your account when membership launches."];
  return {
    subject: `[${mode === "demo" ? "DEMO" : "TEST"}] FreightPulse — Your Complete Shipping Brief`,
    text:[...intro,"",...sections.flatMap((s)=>[...s.lines,""]),...footer].join("\n"),
    html:require("./freightDigestDesign")({sections,label,generatedAt,footer,escape,date}),
  };
}
module.exports = {freightDigestEmail, SYMBOLS};
