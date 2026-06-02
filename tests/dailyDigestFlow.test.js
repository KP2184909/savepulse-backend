"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "savepulse-digest-"));

process.env.PORT = "0";
process.env.HOST = "127.0.0.1";
process.env.DATA_DIR = tempDataDir;
process.env.WEBHOOK_SECRET = "test-master-secret";

const {
  dailyDigestScheduleDue,
  sendDailyDigestBatch,
  server,
  unsubscribeTokenForEmail,
  updateSubscriberPlanFromBilling
} = require("../serverRuntime");

test.after(() => {
  server.close();
  fs.rmSync(tempDataDir, { recursive: true, force: true });
});

test("unsubscribe token is stable and email-specific", () => {
  const token = unsubscribeTokenForEmail("Member@example.com");

  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(token, unsubscribeTokenForEmail("member@example.com"));
  assert.notEqual(token, unsubscribeTokenForEmail("other@example.com"));
});

test("daily digest dry run counts eligible recipients by plan", async () => {
  updateSubscriberPlanFromBilling("plus@example.com", "plus", { status: "paid" });
  updateSubscriberPlanFromBilling("pro@example.com", "pro", { status: "paid" });

  const result = await sendDailyDigestBatch({ dryRun: true });

  assert.equal(result.dryRun, true);
  assert.equal(result.smtpConfigured, false);
  assert.equal(result.recipients, 2);
  assert.equal(result.byPlan.plus, 1);
  assert.equal(result.byPlan.pro, 1);
});

test("daily digest scheduler uses Bangkok daily-digest window", () => {
  const env = {
    DAILY_DIGEST_ENABLED: "true",
    DAILY_DIGEST_TIME: "08:00"
  };

  assert.equal(
    dailyDigestScheduleDue(new Date("2026-06-02T00:59:00.000Z"), env, {}).reason,
    "before_scheduled_time"
  );
  assert.equal(dailyDigestScheduleDue(new Date("2026-06-02T01:00:00.000Z"), env, {}).due, true);
  assert.equal(
    dailyDigestScheduleDue(new Date("2026-06-02T02:00:00.000Z"), env, { dailyDigestDate: "2026-06-02" }).reason,
    "already_processed_today"
  );
});
