"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  QUEUE_COLUMNS, assertHeader, fromRow, toRow, idempotencyKey,
  claim, transition, canPrepareDraft, handoff
} = require("../src/agentWorkflow");
function base() {
  return {
    "Job ID": "TEST-001", "Created At UTC": "2026-10-13T00:00:00.000Z",
    "Job Type": "verify_contact", "Owner Agent": "Verification",
    Status: "pending", Priority: "normal",
    "Entity Key": "COMPANY-A", Country: "GB",
    "Idempotency Key": "verify-company-a",
    "Approval Required": "NO", "Approval Status": "not_required"
  };
}
const t = "2026-10-13T12:00:00.000Z";

test("sheet row contract roundtrips and fails closed on changed headers", () => {
  const parsed = fromRow(QUEUE_COLUMNS, toRow(base()));
  assert.equal(parsed["Owner Agent"], "Verification");
  assert.equal(parsed.Status, "pending");
  assert.throws(() => assertHeader(["X", ...QUEUE_COLUMNS.slice(1)], QUEUE_COLUMNS), /schema mismatch/);
});
test("claim is agent-specific and cannot silently re-claim", () => {
  assert.throws(() => claim(base(), "Sales", t), /different agent/);
  const active = claim(base(), "Verification", t);
  assert.equal(active.Status, "in_progress");
  assert.equal(active["Lease Until UTC"], "2026-10-13T12:30:00.000Z");
  assert.throws(() => claim(active, "Verification", t), /not pending/);
});
test("completed job requires evidence; handoff is deduplicated", () => {
  const active = claim(base(), "Verification", t);
  assert.throws(() => transition(active, "completed", "Verification", t, {result:"verified"}), /requires applied result/);
  const finished = transition(active, "completed", "Verification", t, {
    result:"checked",evidence:"https://company.example/contact"
  });
  const child = handoff(finished, {
    jobId:"TEST-002",type:"prepare_draft",owner:"Sales",
    email:"cfo@company.example",
    idempotencyKey:idempotencyKey(["company-a","cfo@company.example","draft"]),
    requiresApproval:true
  },[finished],t);
  assert.equal(child["Parent Job ID"],"TEST-001");
  assert.equal(child["Approval Required"],"YES");
  assert.throws(() => handoff(finished, {
    jobId:"TEST-002",type:"prepare_draft",owner:"Sales",
    idempotencyKey:child["Idempotency Key"]
  },[child],t),/duplicate/);
});
test("sales draft waits for founder approval before a cold send", () => {
  const sale = {...base(),"Owner Agent":"Sales","Job Type":"prepare_draft"};
  const started = claim(sale,"Sales",t);
  const wait = transition(started,"needs_approval","Sales",t,{result:"Gmail draft saved"});
  assert.equal(wait["Approval Status"],"pending_founder");
  assert.throws(() => transition(wait,"in_progress","Sales",t,{action:"send_cold_email"}),/founder approval/);
  assert.throws(() => transition(wait,"completed","Sales",t,{result:"sent",evidence:"gmail:123"}),/invalid status/);
});
test("checks email source, fit, contact gate, suppression and bounce", () => {
  const good={
    company:"Company", email:"finance@company.example", name:"A Person",
    role:"CFO", type:"named_direct",
    emailSource:"https://company.example/contact",
    roleSource:"https://company.example/team",
    legalGate:"cleared",companyFit:true
  };
  assert.equal(canPrepareDraft(good).eligible,true);
  assert.equal(canPrepareDraft({...good,legalGate:"unknown"}).eligible,false);
  assert.equal(canPrepareDraft({...good,optedOut:true}).eligible,false);
  assert.equal(canPrepareDraft({...good,bounced:true}).eligible,false);
  assert.equal(canPrepareDraft({...good,emailSource:""}).eligible,false);
  assert.equal(canPrepareDraft({...good,type:"general_inbox"}).eligible,false);
});
test("retries require review, no automatic cold send jobs", () => {
  const started=claim(base(),"Verification",t);
  const blocked=transition(started,"blocked","Verification",t,{error:"no source"});
  assert.throws(()=>transition(blocked,"pending","Verification",t),/manual review/);
  assert.equal(transition(blocked,"pending","Verification",t,{manualReview:true}).Status,"pending");
  const finished=transition(started,"completed","Verification",t,{result:"ok",evidence:"https://company.example"});
  assert.throws(()=>handoff(finished,{
    jobId:"J2",owner:"Sales",type:"send_cold_email",idempotencyKey:"x"
  },[],t),/cannot be queued/);
  assert.throws(()=>transition(started,"completed","Verification",t,{
    result:"sent",evidence:"gmail",action:"send_cold_email"
  }),/founder approval/);
});
test("idempotency key is stable across casing and whitespace",()=>{
  assert.equal(
    idempotencyKey(["COMPANY A "," CFO@EXAMPLE.COM"]),
    idempotencyKey(["company a","cfo@example.com"])
  );
});
