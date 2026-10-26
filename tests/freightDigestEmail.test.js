"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {freightDigestEmail,SYMBOLS}=require("../src/freightDigestEmail");
test("one FreightPulse digest always includes six routes and separate BDI/ZIM context",()=>{
 const d=freightDigestEmail({mode:"demo",generatedAt:"2026-10-26T06:00:00Z",rows:[]});
 for(const s of SYMBOLS) assert.ok(s==="BDI"||s==="ZIM"||d.text.includes(require("../public/freightpulse/routes")[s].name));
 assert.match(d.text,/Dry Bulk Market Conditions/);assert.match(d.text,/Shipping Equity Context/);
 assert.doesNotMatch(d.text+d.html+d.subject,/[\u0E00-\u0E7F]/);
 assert.match(d.html,/lang="en"/);
 assert.equal((d.html.match(/<section /g)||[]).length,8);assert.match(d.subject,/DEMO/);
 assert.throws(()=>freightDigestEmail({mode:"live"}),/not_enabled/);
});
test("digest hides stale windows and escapes source HTML",()=>{
 const d=freightDigestEmail({rows:[{symbol:"CS11!",current:false,dataStatus:"stale",windowDay:2,windowState:"active",ruleVersion:"freightpulse.cs.rebound-next-4.v1",source:'<img src=x onerror=bad>'}]});
 assert.doesNotMatch(d.text,/Day 2 of 4/);assert.match(d.text,/Outdated data/);
 assert.doesNotMatch(d.html,/<img/);assert.match(d.html,/&lt;img/);
});
