"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {freightDigestEmail,SYMBOLS}=require("../src/freightDigestEmail");
test("one FreightPulse digest always includes six routes and separate BDI/ZIM context",()=>{
 const d=freightDigestEmail({mode:"demo",generatedAt:"2026-10-26T06:00:00Z",rows:[]});
 for(const s of SYMBOLS) assert.ok(s==="BDI"||s==="ZIM"||d.text.includes(require("../public/freightpulse/routes")[s].name));
 assert.match(d.text,/ภาวะตลาดเรือเทกอง/);assert.match(d.text,/สัญญาณจากหุ้นสายเรือ/);
 assert.equal((d.html.match(/<section /g)||[]).length,8);assert.match(d.subject,/DEMO/);
 assert.throws(()=>freightDigestEmail({mode:"live"}),/not_enabled/);
});
test("digest hides stale windows and escapes source HTML",()=>{
 const d=freightDigestEmail({rows:[{symbol:"CS11!",current:false,dataStatus:"stale",windowDay:2,windowState:"active",ruleVersion:"freightpulse.cs.rebound-next-4.v1",source:'<img src=x onerror=bad>'}]});
 assert.doesNotMatch(d.text,/วันที่ 2\/4/);assert.match(d.text,/ข้อมูลเก่า/);
 assert.doesNotMatch(d.html,/<img/);assert.match(d.html,/&lt;img/);
});
