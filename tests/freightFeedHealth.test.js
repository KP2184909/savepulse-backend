"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {freightFeedHealth}=require("../src/freightFeedHealth");
const observedAt="2026-10-28T08:00:00Z";
test("partial real receipt coverage cannot imply healthy/current service",()=>{
 const report=freightFeedHealth({observedAt,receipts:[{symbol:"BDI",barTime:"2026-10-27T00:00:00Z",receivedAt:"2026-10-28T00:24:17Z",sourceFreshness:"unknown",secret_key:"do-not-echo"}]});
 assert.equal(report.expected,8);assert.equal(report.received,1);assert.equal(report.missing,7);
 assert.equal(report.liveReady,false);assert.ok(report.rows.every(r=>r.current===false));
 assert.ok(!JSON.stringify(report).includes("do-not-echo"));
});
test("available but old/session-boundary chart bars are distinguished from receipt",()=>{
 const report=freightFeedHealth({observedAt,observations:[{symbol:"CS11!",lastBarOpen:"2026-10-26T22:00:00Z",reviewStart:"2026-10-27T00:00:00Z"},{symbol:"CS21!",lastBarOpen:"2026-06-08T22:00:00Z",reviewStart:"2026-10-27T00:00:00Z"}]});
 for(const row of report.rows.slice(0,2)){assert.equal(row.receiptStatus,"not_received");assert.equal(row.sourceEvidence,"latest_available_bar_precedes_review_start");}
});
test("invalid/future receipts do not count and reversed input preserves newest bar",()=>{
 const receipts=[{symbol:"ZIM",barTime:"2026-10-27T13:30:00Z",receivedAt:"2026-10-27T20:01:19Z",sourceFreshness:"known",sourceUpdatedAt:"2026-10-27T20:00:00Z"},{symbol:"ZIM",barTime:"2026-10-26T13:30:00Z",receivedAt:"2026-10-27T20:02:19Z"},{symbol:"BDI",barTime:"invalid",receivedAt:observedAt},{symbol:"CS11!",barTime:"2026-10-29T00:00:00Z",receivedAt:"2026-10-29T01:00:00Z"}];
 const r=freightFeedHealth({observedAt,receipts});assert.equal(r.received,1);assert.equal(r.rows[7].barTime,receipts[0].barTime);assert.equal(r.rows[7].sourceFreshness,"known_requires_policy");assert.equal(r.rows[7].current,false);
 assert.throws(()=>freightFeedHealth({observedAt:"invalid"}));
});
