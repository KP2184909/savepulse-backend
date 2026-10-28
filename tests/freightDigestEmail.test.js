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

test("Pine JSON encoders never use unsupported carriage-return escape that rewrites literal r",()=>{
 const fs=require('node:fs'),path=require('node:path');
 for(const file of fs.readdirSync(path.join(__dirname,'../pine/freightpulse')).filter(x=>x.endsWith('.pine'))){
  const source=fs.readFileSync(path.join(__dirname,'../pine/freightpulse',file),'utf8');
  const quote=source.slice(source.indexOf('f_quote(string value)'),source.indexOf('f_time(int value)'));
  assert.ok(quote.includes('str.replace_all'));
  assert.ok(!quote.includes('"\\r"'),file+' must not rewrite literal r');
 }
});

test("actual BDI payload demonstrates quote corruption without weakening ingestion validation",()=>{
 const {validateSignal}=require('../src/freightpulse');
 const bad=require('./fixtures/bdi-tv-corrupt-quote.json');
 const rules={versions:{BDI:['freightpulse.bulk.next4.transport.v1']},maxAgeSeconds:{BDI:129600}};
 const now=Date.parse('2026-10-27T01:00:00Z');
 assert.throws(()=>validateSignal(bad,now,rules),/script_version_not_approved/);
 // Diagnostic reconstruction only: never normalize incoming production messages.
 const repaired=Object.fromEntries(Object.entries(bad).map(([k,v])=>[k,typeof v==='string'?v.replaceAll('\r','r'):v]));
 assert.equal(validateSignal(repaired,now,rules).symbol,'BDI');
 assert.equal(repaired.sourceFreshness,'unknown');
 assert.equal(repaired.sourceUpdatedAt,null);
});
