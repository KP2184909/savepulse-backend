"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDailyEmailOutbox } = require("../src/dailyEmailOutbox");
function fixture() {
  const rows = new Map(), sent = [];
  let clock = Date.parse("2026-11-10T02:00:00Z");
  const store = {
    get: async k => structuredClone(rows.get(k) || null),
    insert: async (k,v) => { if (rows.has(k)) return false; rows.set(k,structuredClone(v)); return true; },
    cas: async (k,version,v) => { if (rows.get(k)?.version !== version) return false; rows.set(k,structuredClone(v)); return true; }
  };
  const options = { store, now: () => clock, send: async message => {
    assert.equal([...rows.values()][0].state, "working");
    sent.push(message); return { messageId: "qa-message" };
  }};
  const input = { idempotencyKey: `daily-digest/v1/${"a".repeat(64)}`,
    message: { to:"savepulse.cloud@gmail.com", from:"test@example.com",subject:"Daily",html:"<p>Frozen</p>",text:"Frozen" }};
  return { rows, store, options, input, sent, advance: ms => { clock += ms; } };
}
test("persistent QA outbox freezes payload and suppresses replay after service recreation", async () => {
  const f = fixture();
  assert.equal((await createDailyEmailOutbox(f.options).deliver(f.input)).ok, true);
  f.input.message.html = "changed after restart";
  assert.equal((await createDailyEmailOutbox(f.options).deliver(f.input)).ok, true);
  assert.equal(f.sent.length, 1);
  assert.match(f.sent[0].html, /Frozen/);
  assert.match(f.sent[0].subject, /^\[TEST\]/);
  assert.equal([...f.rows.values()][0].message.html.includes("changed"), false);
});
test("outbox rejects customer destinations and fails before send on storage outage", async () => {
  const f = fixture();
  await assert.rejects(createDailyEmailOutbox(f.options).deliver({ ...f.input, message:{...f.input.message,to:"customer@example.com"} }), /test_scope/);
  f.store.insert = async () => { throw Error("database down"); };
  await assert.rejects(createDailyEmailOutbox(f.options).deliver(f.input), /database down/);
  assert.equal(f.sent.length, 0);
});
test("concurrent workers claim one durable send", async () => {
  const f = fixture();
  await Promise.all([createDailyEmailOutbox(f.options).deliver(f.input),createDailyEmailOutbox(f.options).deliver(f.input)]);
  assert.equal(f.sent.length, 1);
});
test("uncertain provider outcome is persisted for review without exposing error or retrying", async () => {
  const f = fixture(); let calls=0;
  f.options.send = async () => { calls++; throw Error("secret provider diagnostic"); };
  assert.equal((await createDailyEmailOutbox(f.options).deliver(f.input)).reason, "manual_review_required");
  await createDailyEmailOutbox(f.options).deliver(f.input);
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify([...f.rows]), /secret provider/);
});
test("crash after provider acceptance leaves a lease, then review, never a second send", async () => {
  const f = fixture(); const cas = f.store.cas;
  f.store.cas = async (k,v,next) => { if(next.state === "sent") throw Error("write failed"); return cas(k,v,next); };
  await assert.rejects(createDailyEmailOutbox(f.options).deliver(f.input), /write failed/);
  f.store.cas = cas;
  assert.equal((await createDailyEmailOutbox(f.options).deliver(f.input)).reason, "working");
  f.advance(120001);
  assert.equal((await createDailyEmailOutbox(f.options).deliver(f.input)).reason, "manual_review_required");
  assert.equal(f.sent.length, 1);
});
test("expired unsent jobs require review rather than late automatic delivery", async () => {
  const f = fixture();
  f.store.cas = async () => false;
  await createDailyEmailOutbox(f.options).deliver(f.input);
  f.store.cas = async (k,v,next) => { f.rows.set(k,structuredClone(next)); return true; };
  f.advance(24*60*60*1000);
  assert.equal((await createDailyEmailOutbox(f.options).deliver(f.input)).reason, "manual_review_required");
  assert.equal(f.sent.length, 0);
});
