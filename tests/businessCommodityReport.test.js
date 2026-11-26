"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { buildBusinessCommodityReport } = require("../src/businessCommodityReport");
const now="2026-10-28T03:00:00Z", bar="2026-10-27T21:00:00Z";
const make = (symbol, sourceTicker, price) => ({symbol,sourceTicker,price,receivedAt:"2026-10-27T23:00:00Z",pine:{barTime:bar},action:"STRONG_BUY"});
test("all seven benchmark rows preserve actual units without recommending purchase",()=>{
 const r=buildBusinessCommodityReport({generatedAt:now,signals:[make("SUGARUSD","ICEUS:SB1!",19.2),make("FCPO","MYX:FCPO1!",4701)]});
 assert.equal(r.rows.length,7);assert.equal(r.rows.find(x=>x.symbol==="SUGARUSD").unit,"US cents/pound");assert.equal(r.rows.find(x=>x.symbol==="FCPO").unit,"MYR/metric tonne");
 assert.ok(r.rows.every(x=>x.price===null));assert.equal(r.customerDeliveryEnabled,false);assert.doesNotMatch(r.text,/STRONG_BUY|cheap|best price/i);
});
test("wrong or absent source and old/future bars cannot become current on receipt",()=>{
 const r=buildBusinessCommodityReport({generatedAt:now,signals:[make("COPPERUSD","COMEX:ALI1!",6),make("BRENTUSD",null,110),{...make("WTIUSD","NYMEX:CL1!",100),pine:{barTime:"2026-10-20T00:00:00Z"}}]});
 assert.equal(r.rows.find(x=>x.symbol==="COPPERUSD").status,"source_unverified");assert.equal(r.rows.find(x=>x.symbol==="BRENTUSD").status,"source_unverified");assert.equal(r.rows.find(x=>x.symbol==="WTIUSD").status,"stale_or_invalid_time");
});
test("new receipt time and matching chart still do not establish source freshness or release rights",()=>{
 const r=buildBusinessCommodityReport({generatedAt:now,signals:[make("NGUSD","NYMEX:NG1!",2.6)]});
 assert.equal(r.rows.find(x=>x.symbol==="NGUSD").status,"source_freshness_unverified");assert.equal(r.customerDeliveryEnabled,false);assert.match(r.subject,/^\[TEST\]/);
});
