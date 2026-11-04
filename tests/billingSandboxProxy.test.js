"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

test("sandbox proxy cannot run in Production or on another site", async () => {
  const { default: handler } = await import(pathToFileURL(path.resolve(__dirname, "../netlify/functions/billing-sandbox.mjs")));
  const req = new Request("https://savepulse.cloud/sandbox-billing/catalog");
  for (const context of [{ deploy: { context: "production" }, site: { id: "ddc6313e-a711-4a4f-be1f-46887301fd80" } }, { deploy: { context: "deploy-preview" }, site: { id: "unrelated" } }]) {
    assert.equal((await handler(req, context)).status, 404);
  }
});

test("sandbox proxy preserves identity but only forwards allowed operations to the isolated Edge function", async () => {
  const { default: handler } = await import(pathToFileURL(path.resolve(__dirname, "../netlify/functions/billing-sandbox.mjs")));
  const original = global.fetch, calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return Response.json({ plan: "free" }); };
  const context = { deploy: { context: "deploy-preview" }, site: { id: "ddc6313e-a711-4a4f-be1f-46887301fd80" } };
  try {
    const response = await handler(new Request("https://preview.example/sandbox-billing/status", { headers: { authorization: "Bearer local-test-session" } }), context);
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(calls[0].url, "https://sktzydyiwqylpstxjicf.supabase.co/functions/v1/savepulse-billing-sandbox/status");
    assert.equal(calls[0].options.headers.authorization, "Bearer local-test-session");
    assert.equal((await handler(new Request("https://preview.example/sandbox-billing/webhook"), context)).status, 404);
    assert.equal(calls.length, 1);
  } finally { global.fetch = original; }
});
