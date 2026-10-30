"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createBillingRiskInbox } = require("../src/billingRiskInbox");
function fixture() {
 const rows = new Map(); let offline = false;
 const store = { async insert(key,value) { if(offline) throw Error("database_unavailable"); if(rows.has(key))return false;rows.set(key,structuredClone(value));return true; } };
 const options = {store,mode:"test",accountId:"acct_fixture"};
 return { rows, options, api:createBillingRiskInbox(options), fail:()=>offline=true };
}
function event(type="charge.refunded",id="ch_fixture") { return {id:"evt_fixture",type,livemode:false,data:{object:{id,customer:"private",billing_details:{email:"private"},metadata:{plan:"business"}}}}; }
test("risk events create durable review tasks without private payloads or granting rights",async()=>{
 for(const [type,id] of [["charge.refunded","ch_fixture"],["charge.dispute.created","dp_fixture"],["radar.early_fraud_warning.created","issfr_fixture"]]){
  const f=fixture();assert.equal((await f.api.receive(event(type,id))).reason,"risk_review_queued");
  const row=[...f.rows.values()][0];assert.equal(row.state,"pending_review");assert.equal(row.ownershipVerified,false);assert.equal(row.entitlementChanged,false);assert.equal(row.creditNoteCreated,false);
  assert.ok(!JSON.stringify(row).includes("private"));assert.ok(!JSON.stringify(row).includes("business"));
 }
});
test("concurrent duplicate deliveries and process restart retain one risk task",async()=>{
 const f=fixture();const results=await Promise.all([f.api.receive(event()),f.api.receive(event())]);
 assert.equal(f.rows.size,1);assert.equal(results.filter(r=>r.reason==="risk_review_queued").length,1);
 assert.equal((await createBillingRiskInbox(f.options).receive(event())).reason,"duplicate_risk_event");
});
test("risk inbox rejects wrong mode and malformed IDs and propagates storage failure for webhook retry",async()=>{
 const f=fixture();await assert.rejects(f.api.receive({...event(),livemode:true}),/mode_mismatch/);
 await assert.rejects(f.api.receive(event("charge.refunded","sub_wrong")),/invalid_risk_event/);
 await assert.rejects(f.api.receive({...event(),id:"invalid"}),/invalid_risk_event/);
 assert.equal((await f.api.receive(event("invoice.paid"))).reason,"event_ignored");
 assert.equal(f.rows.size,0);f.fail();await assert.rejects(f.api.receive(event()),/database_unavailable/);
});
test("risk tasks isolate Stripe account and mode",async()=>{
 const f=fixture();await f.api.receive(event());
 await createBillingRiskInbox({...f.options,accountId:"acct_other"}).receive(event());
 await createBillingRiskInbox({...f.options,mode:"live"}).receive({...event(),livemode:true});
 assert.equal(f.rows.size,3);
});

test("risk reconciliation persists verified evidence once and never changes entitlement",async()=>{
 const f=fixture();f.options.store.get=async key=>structuredClone(f.rows.get(key));
 f.options.store.cas=async(key,version,value)=>{if(f.rows.get(key)?.version!==version)return false;f.rows.set(key,structuredClone(value));return true;};
 await f.api.receive(event());const key=[...f.rows.keys()][0];
 const api=createBillingRiskInbox({...f.options,resolve:async()=>({ownershipVerified:true,invoices:[{invoiceId:"in_fixture"}],reviewRequired:true})});
 await Promise.all([api.reconcile(key),api.reconcile(key)]);
 const row=f.rows.get(key);assert.equal(row.state,"verified_review_required");assert.equal(row.version,2);assert.equal(row.entitlementChanged,false);assert.equal(row.creditNoteCreated,false);
 assert.equal((await api.reconcile(key)).updated,false);
});
test("provider errors persist bounded retries without leaking provider payloads",async()=>{
 const f=fixture();let time=1000;f.options.store.get=async key=>structuredClone(f.rows.get(key));
 f.options.store.cas=async(key,version,value)=>{if(f.rows.get(key)?.version!==version)return false;f.rows.set(key,structuredClone(value));return true;};
 await f.api.receive(event());const key=[...f.rows.keys()][0];let calls=0;
 const api=createBillingRiskInbox({...f.options,now:()=>time,resolve:async()=>{calls++;throw Error("sensitive_provider_data");}});
 await api.reconcile(key);await api.reconcile(key);assert.equal(calls,1);
 for(let i=1;i<10;i++){time=f.rows.get(key).nextAttemptAt;await api.reconcile(key);}
 assert.equal(f.rows.get(key).state,"manual_review_required");assert.ok(!JSON.stringify(f.rows.get(key)).includes("sensitive"));
});
