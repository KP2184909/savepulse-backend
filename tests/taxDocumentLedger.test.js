"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { createTaxDocumentLedger } = require("../src/taxDocumentLedger");
function setup() {
  const rows=new Map(), deliveries=[];let time=Date.parse("2026-10-29T04:00:00Z"), broken=false;
  const clone=x=>x?structuredClone(x):null;
  const store={get:async k=>clone(rows.get(k)),insert:async(k,v)=>{if(rows.has(k))return false;rows.set(k,clone(v));return true;},cas:async(k,n,v)=>{if(rows.get(k)?.version!==n)return false;rows.set(k,clone(v));return true;}};
  const source=async id=>({evidenceVerified:true,mode:"test",recipient:"savepulse.cloud@gmail.com",fxEvidence:{fixture:true},draft:{status:"draft",sourceInvoiceId:id,paymentMode:"test",paymentDate:"2026-10-29",fx:{sourceUrl:"https://www.bot.or.th/test-fixture"},grossSatang:17500}});
  const options={store,source,mode:"test",now:()=>time,send:async data=>{deliveries.push(data);if(broken)throw Error("provider outage");return{id:"mail_fixture"};}};
  return{rows,deliveries,options,ledger:createTaxDocumentLedger(options),setBroken:v=>broken=v,advance:ms=>time+=ms};
}
test("concurrent duplicate issuance and worker restart preserve one number per paid invoice",async()=>{const f=setup();const docs=await Promise.all(Array.from({length:10},()=>f.ledger.issue("in_one")));assert.equal(new Set(docs.map(d=>d.invoiceNumber)).size,1);const other=await f.ledger.issue("in_two");assert.ok(other.invoiceNumber.endsWith("000002"));const restarted=createTaxDocumentLedger(f.options);assert.equal((await restarted.issue("in_one")).invoiceNumber,docs[0].invoiceNumber);assert.ok(docs[0].invoiceNumber.startsWith("TEST-"));});
test("unverified or mode-mismatched source cannot allocate any issued document",async()=>{const f=setup();for(const value of [{evidenceVerified:false},{mode:"live"}]){const ledger=createTaxDocumentLedger({...f.options,source:async id=>({...await f.options.source(id),...value})});await assert.rejects(ledger.issue("in_one"),/verified_source/);}assert.equal(f.rows.size,0);});
test("email retry keeps stable idempotency and successful delivery is not sent twice",async()=>{const f=setup();await f.ledger.issue("in_one");f.setBroken(true);await assert.rejects(f.ledger.deliver("202610","in_one"),/delivery_failed/);f.setBroken(false);await f.ledger.deliver("202610","in_one");assert.deepEqual(await f.ledger.deliver("202610","in_one"),{sent:true,duplicate:true});assert.equal(f.deliveries.length,2);assert.equal(f.deliveries[0].idempotencyKey,f.deliveries[1].idempotencyKey);});
test("ambiguous delivery outside provider retention requires review instead of a duplicate email",async()=>{const f=setup();await f.ledger.issue("in_one");f.setBroken(true);await assert.rejects(f.ledger.deliver("202610","in_one"));f.advance(24*3600000);f.setBroken(false);await assert.rejects(f.ledger.deliver("202610","in_one"),/needs_review/);assert.equal(f.deliveries.length,1);});

test("partial refunds conserve original THB and VAT, duplicates reuse credit notes and never rewrite originals",async()=>{
 const f=setup();f.options.source=async id=>({evidenceVerified:true,mode:'test',recipient:'savepulse.cloud@gmail.com',fxEvidence:{fixture:true},draft:{status:'draft',sourceInvoiceId:id,paymentMode:'test',paymentDate:'2026-10-29',sourceGrossUsdCents:500,grossSatang:16824,vatSatang:1101,netSatang:15723,vatPercent:7,fx:{sourceUrl:'https://www.bot.or.th/fixture',thbPerUsd:'33.6482'},seller:{},customer:{}}});
 f.options.refundSource=async(invoiceId,id)=>({evidenceVerified:true,refund:{id,invoiceId,status:'succeeded',currency:'usd',mode:'test',amount:id==='re_one'?100:400,created:Date.parse('2026-10-29T03:59:00Z')/1000},review:{reasonCode:'service_cancelled',evidenceReference:'TEST cancellation evidence',reviewedBy:'QA'}});
 const ledger=createTaxDocumentLedger(f.options), original=await ledger.issue('in_one');
 const [a,b]=await Promise.all([ledger.credit('202610','in_one','re_one'),ledger.credit('202610','in_one','re_two')]);
 assert.equal(a.grossSatang+b.grossSatang,original.grossSatang);assert.equal(a.vatSatang+b.vatSatang,original.vatSatang);assert.equal(a.netSatang+b.netSatang,original.netSatang);
 assert.deepEqual(await ledger.credit('202610','in_one','re_one'),a);assert.deepEqual(await ledger.issue('in_one'),original);
 await assert.rejects(ledger.credit('202610','in_one','re_excess'),/amount_invalid/);
});
test("cancellation alone, failed/wrong-mode refunds and missing legal reason do not issue credit notes",async()=>{
 const f=setup();await f.ledger.issue('in_one');
 for(const patch of [{status:'pending'},{mode:'live'},{invoiceId:'in_someone_else'}]){
  const ledger=createTaxDocumentLedger({...f.options,refundSource:async()=>({evidenceVerified:true,refund:{id:'re_test',invoiceId:'in_one',currency:'usd',mode:'test',status:'succeeded',amount:100,...patch}})});
  await assert.rejects(ledger.credit('202610','in_one','re_test'),/verified_refund/);
 }
 await assert.rejects(f.ledger.credit('202610','in_one','re_missing'),/verified_refund/);
});

test("live tax documents and credit notes require explicit issuance approval",async()=>{const f=setup(),ledger=createTaxDocumentLedger({...f.options,mode:"live"});await assert.rejects(ledger.issue("in_one"),/live_issuance_not_approved/);await assert.rejects(ledger.credit("202610","in_one","re_one"),/live_issuance_not_approved/);assert.equal(f.rows.size,0);});
