"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const tool = join(__dirname, "../tools/tax-invoice-qa-html.js");

test("offline tax QA exports a numbered TEST invoice with reconciled VAT and synthetic identities", () => {
  const result = spawnSync(process.execPath, [tool], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /TEST-SP-TI-202611-000001/);
  assert.match(result.stdout, /NOT VALID FOR TAX FILING/);
  assert.match(result.stdout, /1275\.70 THB/);
  assert.match(result.stdout, /89\.30 THB/);
  assert.match(result.stdout, /1365\.00 THB/);
  assert.match(result.stdout, /ผู้ซื้อสมมติ/);
  assert.doesNotMatch(result.stdout, /0125554006077|savepulse\.cloud@gmail\.com/);
});
