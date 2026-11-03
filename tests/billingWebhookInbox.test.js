"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createBillingWebhookInbox } = require("../src/billingWebhookInbox");
function fixture(processEvent = async () => {}) {
  const rows = new Map(); let time = 1000000, unavailable = false;
  const store = {
    async get(k) { return structuredClone(rows.get(k)); },
    async insert(k,v) { if (unavailable) throw Error("database_failed"); if(rows.has(k))return false; rows.set(k,structuredClone(v));return true; },
    async cas(k,version,v) { if(rows.get(k)?.version!==version)return false;rows.set(k,structuredClone(v));return true; },
    async billingWebhookRows() {return [...rows].map(([key,value])=>({key,...value}));}
  };
  const options = {store,mode:"test",accountId:"acct_fixture",processEvent,now:()=>time};
  const inbox = createBillingWebhookInbox(options);
  const event = {id:"evt_queue",type:"customer.subscription.updated",livemode:false,data:{object:{id:"sub_fixture",email:"private@example.invalid",metadata:{secret:"not_saved"}}}};
  return {rows,store,options,inbox,event,advance:ms=>time+=ms,fail:value=>unavailable=value};
}
test("signed-ingress inbox persists minimal references before ack, rejects wrong mode and fails closed on storage outage", async()=>{
  let calls=0;const f=fixture(async()=>{calls++;});
  await assert.rejects(f.inbox.receive({...f.event,livemode:true}),/mode_mismatch/);
  f.fail(true);await assert.rejects(f.inbox.receive(f.event),/database_failed/);assert.equal(f.rows.size,0);
  f.fail(false);
  const results=await Promise.all(Array.from({length:5},()=>f.inbox.receive(f.event)));
  assert.equal(results.filter(x=>x.reason==="event_queued").length,1);
  assert.equal(f.rows.size,1);assert.equal(calls,0);
  assert.ok(!JSON.stringify([...f.rows]).includes("private@"));assert.ok(!JSON.stringify([...f.rows]).includes("not_saved"));
  assert.equal((await f.inbox.tick()).processed,1);assert.equal(calls,1);
  await f.inbox.tick();assert.equal(calls,1);
});
test("processing failures survive restart, back off and stop for review without leaking provider errors",async()=>{
  const f=fixture(async()=>{throw Error("private_provider_payload");});await f.inbox.receive(f.event);
  const restarted=createBillingWebhookInbox(f.options),key=f.inbox.keyFor(f.event.id);
  for(let n=1;n<=20;n++){
    await restarted.run(key);const row=f.rows.get(key);assert.equal(row.attempts,n);
    assert.equal((await restarted.run(key)).processed,false);f.advance(3600001);
  }
  assert.equal(f.rows.get(key).state,"manual_review_required");
  assert.ok(!JSON.stringify([...f.rows]).includes("private_provider_payload"));
});
test("concurrent workers claim once, and an expired worker cannot overwrite recovered queue state",async()=>{
  let release,entered,calls=0;
  const held=new Promise(r=>release=r),started=new Promise(r=>entered=r);
  const f=fixture(async()=>{if(++calls===1){entered();await held;}});
  await f.inbox.receive(f.event);const key=f.inbox.keyFor(f.event.id);
  const slow=f.inbox.run(key);await started;
  try{
    assert.equal((await createBillingWebhookInbox(f.options).run(key)).processed,false);
    f.advance(120001);
    assert.equal((await createBillingWebhookInbox(f.options).run(key)).processed,true);
  }finally{release();}
  assert.equal((await slow).state,"lease_lost");assert.equal(f.rows.get(key).state,"processed");
});
