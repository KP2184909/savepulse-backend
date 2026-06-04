"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createSupabasePersistence } = require("../src/persistence");

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload)
  };
}

test("Supabase persistence stays disabled without credentials", () => {
  const persistence = createSupabasePersistence({
    env: {},
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    }
  });

  assert.equal(persistence.enabled, false);
});

test("saveSubscribers upserts normalized subscriber rows", async () => {
  const calls = [];
  const persistence = createSupabasePersistence({
    env: {
      SUPABASE_URL: "https://example.supabase.co/",
      SUPABASE_SERVICE_ROLE_KEY: "service-key"
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 204, text: async () => "" };
    }
  });

  await persistence.saveSubscribers([
    {
      id: "sub_123",
      email: "Member@Example.com",
      plan: "plus",
      locale: "th",
      watchlist: ["JPYTHB"],
      channels: ["email"],
      preferences: { dailyDigest: true },
      createdAt: "2026-06-04T00:00:00.000Z"
    }
  ]);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/subscribers");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.apikey, "service-key");
  assert.equal(calls[0].options.headers.authorization, "Bearer service-key");
  assert.equal(calls[0].options.headers.prefer, "resolution=merge-duplicates,return=minimal");

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body[0].email, "member@example.com");
  assert.equal(body[0].subscriber_id, "sub_123");
  assert.equal(body[0].plan, "plus");
  assert.deepEqual(body[0].watchlist, ["JPYTHB"]);
  assert.equal(body[0].payload.email, "Member@Example.com");
});

test("loadAll reconstructs backend state from Supabase rows", async () => {
  const persistence = createSupabasePersistence({
    env: {
      SUPABASE_PROJECT_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_KEY: "service-key"
    },
    fetchImpl: async (url) => {
      if (url.includes("/signals?")) {
        return jsonResponse([{ symbol: "JPYTHB", payload: { symbol: "JPYTHB", action: "BUY_ZONE", price: 0.21 } }]);
      }
      if (url.includes("/subscribers?")) {
        return jsonResponse([{ email: "member@example.com", payload: { email: "member@example.com", plan: "pro" } }]);
      }
      if (url.includes("/notification_jobs?")) {
        return jsonResponse([{ id: "job_1", payload: { id: "job_1", status: "pending" } }]);
      }
      if (url.includes("/invoices?")) {
        return jsonResponse([{ id: "invoice_1", payload: { id: "invoice_1", email: "member@example.com" } }]);
      }
      if (url.includes("/scheduler_state?")) {
        return jsonResponse([{ key: "default", value: { dailyDigestDate: "2026-06-04" } }]);
      }
      throw new Error(`Unexpected URL ${url}`);
    }
  });

  const state = await persistence.loadAll();

  assert.equal(state.signalsBySymbol.JPYTHB.action, "BUY_ZONE");
  assert.equal(state.subscribers[0].plan, "pro");
  assert.equal(state.notificationQueue[0].id, "job_1");
  assert.equal(state.invoices[0].id, "invoice_1");
  assert.equal(state.schedulerState.dailyDigestDate, "2026-06-04");
});
