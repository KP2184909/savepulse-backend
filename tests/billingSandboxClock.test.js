"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createBillingSandboxClock } = require("../src/billingSandboxClock");
const { createStripeApi } = require("../src/billingLifecycle");
function fixture() {
  let config = {version:1, clockId:"clock_qa", customerId:"cus_qa"};
  const wall = Date.parse("2026-11-09T00:00:00Z");
  const clock = {id:"clock_qa",livemode:false,status:"ready",frozen_time:wall/1000+86400};
  const customer = {id:"cus_qa",email:"savepulse.cloud@gmail.com",livemode:false,test_clock:clock.id};
  const calls=[];
  const env={SUPABASE_URL:"https://sktzydyiwqylpstxjicf.supabase.co",STRIPE_EXPECTED_ACCOUNT_ID:"acct_1TbuPE0su7h1AsZT",STRIPE_SECRET_KEY:"rk_test_fixture"};
  const stripe=async(method,path,params,key)=>{calls.push({method,path,params,key}); if(path==="/account")return{id:env.STRIPE_EXPECTED_ACCOUNT_ID};if(path.startsWith("/test_helpers/"))return clock;if(path.startsWith("/customers"))return customer;return params;};
  const store={get:async()=>config,insert:async(k,v)=>{if(config)return false;config=v;return true;},cas:async(k,version,v)=>{if(config.version!==version)return false;config=v;return true;}};
  const api=createBillingSandboxClock({store,stripe,env,wallNow:()=>wall});
  return{api,clock,customer,env,wall,calls,clear:()=>config=null};
}
test("verified test clock is request-local; checkout uses only its bound test customer",async()=>{
  const f=fixture();
  assert.equal(f.api.now(),f.wall);
  await f.api.run(async()=>{
    assert.equal(f.api.now(),f.clock.frozen_time*1000);
    const result=await f.api.stripe("POST","/checkout/sessions",{customer_email:f.customer.email,mode:"subscription"},"idem");
    assert.equal(result.customer,"cus_qa");assert.equal(result.customer_email,undefined);
    assert.deepEqual(result.customer_update,{name:"auto",address:"auto"});
    await assert.rejects(f.api.stripe("POST","/checkout/sessions",{customer_email:"other@example.com"}),/customer_mismatch/);
  });
  assert.equal(f.api.active(),false);assert.equal(f.api.now(),f.wall);
});
test("clock adapter fails closed for Live keys, wrong project and mismatched customers",async()=>{
  for(const change of [f=>f.env.STRIPE_SECRET_KEY="rk_live_fixture",f=>f.env.SUPABASE_URL="https://production.example",f=>f.customer.test_clock="clock_other",f=>f.customer.email="other@example.com",f=>f.clock.status="advancing",f=>f.clock.frozen_time+=181*86400]){
    const f=fixture();change(f);await assert.rejects(f.api.run(async()=>assert.fail("must not enter")),/billing_simulation_/);
  }
});
test("ordinary requests retain wall time and preparation is idempotent and test-only",async()=>{
  const f=fixture();f.clear();await f.api.run(async()=>assert.equal(f.api.now(),f.wall));
  const prepared=await f.api.prepare();assert.equal(prepared.customerId,"cus_qa");assert.equal(prepared.emailsSent,0);
  await assert.rejects(f.api.prepare(),/already_configured/);
  assert.equal(f.calls.filter(c=>c.path==="/customers"&&c.method==="POST").length,1);
});
test("extra provider routes require explicit sandbox opt-in and reject Live or destructive access",async()=>{
  const f=fixture();let calls=0;
  const fetch=async()=>{calls++;return{ok:true,json:async()=>({id:"clock_qa"})};};
  await assert.rejects(createStripeApi(f.env,fetch)("POST","/test_helpers/test_clocks",{}),/billing_unavailable/);
  await assert.rejects(createStripeApi({...f.env,STRIPE_SECRET_KEY:"rk_live_fixture"},fetch,{sandboxClockRoutes:true})("POST","/test_helpers/test_clocks",{}),/billing_unavailable/);
  await assert.rejects(createStripeApi(f.env,fetch,{sandboxClockRoutes:true})("DELETE","/customers/cus_qa"),/billing_unavailable/);
  assert.equal(calls,0);
  await createStripeApi(f.env,fetch,{sandboxClockRoutes:true})("POST","/test_helpers/test_clocks",{});
  assert.equal(calls,1);
});
test("suspension retains audit binding and restores ordinary wall time",async()=>{
  const f=fixture();await f.api.suspend();
  await f.api.run(async()=>{assert.equal(f.api.active(),false);assert.equal(f.api.now(),f.wall);});
  await assert.rejects(f.api.prepare(),/already_configured/);
});
test("overlapping requests do not inherit each other's simulated time",async()=>{
  const f=fixture();let release,entered;
  const ready=new Promise(resolve=>entered=resolve);
  const gate=new Promise(resolve=>release=resolve);
  const original=f.clock.frozen_time*1000;
  const first=f.api.run(async()=>{entered();await gate;assert.equal(f.api.now(),original);});
  await ready;f.clock.frozen_time+=86400;
  await f.api.run(async()=>assert.equal(f.api.now(),original+86400000));
  release();await first;assert.equal(f.api.now(),f.wall);
});
