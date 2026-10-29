import { createBotTaxFx } from "./botTaxFx.mjs";
// Isolated readiness probe only. No caller-selected dates or destinations, no keys in responses.
import { createTrialStore } from "../savepulse-billing-sandbox/shared/trialLifecycle.mjs";
const store = createTrialStore({ SUPABASE_URL: Deno.env.get("SUPABASE_URL"), SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") });
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
Deno.serve(async request => {
  if (request.method !== "GET") return json({error:"method_not_allowed"},405);
  if (Deno.env.get("SUPABASE_URL") !== "https://sktzydyiwqylpstxjicf.supabase.co") return json({error:"sandbox_required"},503);
  // Temporary fixed-date QA, not a public rate feed. Retire after this QA day.
  if (new Date().toISOString().slice(0,10) !== "2026-10-29") return json({error:"qa_probe_expired"},410);
  const token = Deno.env.get("BOT_EXCHANGE_RATE_API_KEY") || "";
  if (!token) return json({configured:false},503);
  const key="bot-fx:qa:v2:2026-10-28";
  try {
    const old=await store.get(key);
    if(old?.checkedAt && Date.now()-old.checkedAt<600000) return json(old.result);
    if(old?.leaseUntil>Date.now()) return json({configured:true,status:"checking"},202);
    const next={version:(old?.version||0)+1,leaseUntil:Date.now()+30000};
    const claimed=old?await store.cas(key,old.version,next):await store.insert(key,next);
    if(!claimed)return json({configured:true,status:"checking"},202);
    const evidence=await createBotTaxFx({token,store})("2026-10-28");
    const result={configured:true,ok:true,requestedDate:"2026-10-28",currency:"USD",rateDate:evidence.rateDate,rateType:evidence.field,thbPerUsd:evidence.thbPerUsd,sourceHash:evidence.sourceHash};
    await store.cas(key,next.version,{version:next.version+1,checkedAt:Date.now(),leaseUntil:0,result});
    return json(result);
  }catch(error){return json({configured:true,error:/^tax_fx_/.test(error.message)?error.message:"bot_probe_unavailable"},503);}
});
