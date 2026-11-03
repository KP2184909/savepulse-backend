"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {once}=require("node:events");
const originalFetch=global.fetch,rows=new Map(),dir=fs.mkdtempSync(path.join(os.tmpdir(),"savepulse-queue-http-"));
let unavailable=false,providerCalls=0,base;
Object.assign(process.env,{PORT:"0",HOST:"127.0.0.1",DATA_DIR:dir,TRIAL_ENABLED:"false",SUPABASE_URL:"https://queue.invalid",SUPABASE_SERVICE_ROLE_KEY:"fixture",BILLING_V2_ENABLED:"true",BILLING_WEBHOOK_QUEUE_ENABLED:"true",STRIPE_SECRET_KEY:"rk_test_fixture",STRIPE_EXPECTED_ACCOUNT_ID:"acct_fixture",STRIPE_WEBHOOK_SECRET:"whsec_queue_fixture",APP_BASE_URL:"https://preview.example"});
global.fetch=async(raw,options={})=>{
  const url=new URL(raw);
  if(url.hostname==="api.stripe.com"){providerCalls++;throw Error("provider_must_not_run_during_ingress");}
  if(url.hostname!=="queue.invalid")return originalFetch(raw,options);
  if(unavailable)return Response.json({},{status:503});
  if(options.method==="POST"){
    const row=JSON.parse(options.body);if(rows.has(row.key))return Response.json([]);
    rows.set(row.key,row.value);return Response.json([row]);
  }
  return Response.json([]);
};
const {server}=require("../server");
test.before(async()=>{if(!server.listening)await once(server,"listening");base=`http://127.0.0.1:${server.address().port}`;});
test.after(async()=>{await new Promise(r=>server.close(r));global.fetch=originalFetch;fs.rmSync(dir,{recursive:true,force:true});});
async function deliver(){
  const body=JSON.stringify({id:"evt_queue_http",type:"customer.subscription.deleted",livemode:false,data:{object:{id:"sub_queue_http"}}});
  const timestamp=Math.floor(Date.now()/1000),signature=crypto.createHmac("sha256",process.env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest("hex");
  const response=await originalFetch(base+"/api/v1/billing/webhook",{method:"POST",headers:{"stripe-signature":`t=${timestamp},v1=${signature}`},body});
  return {status:response.status,data:await response.json()};
}
test("enabled queue HTTP ingress awaits durable insert and does not wait for Stripe or grant membership",async()=>{
  unavailable=true;assert.equal((await deliver()).status,503);assert.equal(rows.size,0);
  unavailable=false;const accepted=await deliver();assert.equal(accepted.status,200);
  assert.equal(accepted.data.result.reason,"event_queued");assert.equal(accepted.data.result.updated,false);
  assert.equal((await deliver()).data.result.reason,"duplicate_queued_event");
  assert.equal(rows.size,1);assert.equal([...rows.values()][0].state,"pending");assert.equal(providerCalls,0);
});
