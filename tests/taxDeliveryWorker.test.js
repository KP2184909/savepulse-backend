"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {runTaxDeliveryWorker}=require("../src/taxDeliveryWorker");
const item=(patch={})=>({recipient:"savepulse.cloud@gmail.com",document:{invoiceNumber:"TEST-SP-1",paymentMode:"test",sourceInvoiceId:"in_fixture"},delivery:{status:"pending"},...patch});
const rows=items=>[{key:"tax-documents:v1:test:202610",value:{documents:items}}];
test("delivery worker excludes real mailboxes and skips disabled mailer without attempts",async()=>{
 let calls=0;const options={rows:rows({a:item(),b:item({recipient:"customer@example.com"})}),mode:"test",ledger:{deliver:async()=>{calls++;return{sent:true};}}};
 assert.equal((await runTaxDeliveryWorker({...options,configured:false})).accepted,0);assert.equal(calls,0);
 assert.equal((await runTaxDeliveryWorker({...options,configured:true})).accepted,1);assert.equal(calls,1);
 await assert.rejects(runTaxDeliveryWorker({...options,mode:"live",configured:true}),/not_approved/);
});
test("delivery worker respects leases backoff completion and per-run limit",async()=>{
 let calls=0;const options={mode:"test",configured:true,now:1000,limit:1,ledger:{deliver:async()=>{calls++;return{sent:true};}},rows:rows({a:item({delivery:{status:"sent"}}),b:item({delivery:{leaseUntil:2000}}),c:item({delivery:{nextAttemptAt:2000}}),d:item(),e:item()})};
 assert.equal((await runTaxDeliveryWorker(options)).accepted,1);assert.equal(calls,1);
});
test("one provider failure does not prevent other documents and ambiguous sends require review",async()=>{
 let calls=0;const result=await runTaxDeliveryWorker({mode:"test",configured:true,rows:rows({a:item(),b:item(),c:item()}),ledger:{deliver:async()=>{calls++;if(calls===1)throw Error("tax_document_delivery_needs_review");if(calls===2)throw Error("provider");return{sent:true};}}});
 assert.deepEqual(result,{configured:true,accepted:1,review:1,failed:1});
});
