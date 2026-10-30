"use strict";
const crypto = require("node:crypto");
const BASE = "https://gateway.api.bot.or.th/Stat-ExchangeRate/v2/DAILY_AVG_EXG_RATE/";
const fail = code => Object.assign(new Error(code), { status: 503 });
function createBotTaxFx({ token, store, fetchImpl = globalThis.fetch, now = Date.now }) {
  return async function getRate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !Number.isFinite(Date.parse(date)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date) throw fail("tax_fx_date_invalid");
    const key=`tax-fx:v1:BOT:USD:buying_transfer:${date}`;
    const cached=await store.get(key);
    if(cached?.evidence) return structuredClone(cached.evidence);
    if(!token || /[\r\n]/.test(token))throw fail("tax_fx_not_configured");
    const url=`${BASE}?${new URLSearchParams({start_period:date,end_period:date,currency:"USD"})}`;
    let response, body;
    try { response=await fetchImpl(url,{headers:{Authorization:token,Accept:"application/json"},signal:AbortSignal.timeout(12000)});body=await response.json(); }
    catch(_){throw fail("tax_fx_provider_unavailable");}
    if(!response.ok)throw fail("tax_fx_provider_unavailable");
    const rows=body?.result?.data?.data_detail;
    if(!Array.isArray(rows))throw fail("tax_fx_schema_changed");
    const matches=rows.filter(row=>row.period===date&&row.currency_id==="USD");
    if(matches.length!==1)throw fail("tax_fx_exact_date_unavailable");
    const rawRate=String(matches[0].buying_transfer ?? "");
    const rate=rawRate.includes(".") ? rawRate.replace(/0+$/, "").replace(/\.$/, "") : rawRate;
    if(!/^[1-9]\d{0,3}(\.\d{1,6})?$/.test(rate))throw fail("tax_fx_rate_invalid");
    // Preserve only verified accounting fields, never headers/tokens/provider echoes.
    const observed={period:date,currency_id:"USD",buying_transfer:rawRate};
    const evidence={method:"BOT_DAILY_AVERAGE_BUYING",field:"buying_transfer",rateDate:date,thbPerUsd:rate,sourceUrl:url,retrievedAt:new Date(now()).toISOString(),sourceHash:crypto.createHash("sha256").update(JSON.stringify(observed)).digest("hex"),observed};
    const inserted=await store.insert(key,{version:1,evidence});
    if(!inserted){const winner=await store.get(key);if(!winner?.evidence)throw fail("tax_fx_storage_unavailable");return structuredClone(winner.evidence);}
    return evidence;
  };
}
module.exports = { createBotTaxFx };
