"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const homepage = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("homepage presents gold quantities in grams instead of market codes", () => {
  assert.match(homepage, /ทองคำ \(กรัม\)/);
  assert.match(homepage, /Gold \(grams\)/);
  assert.match(homepage, /GOLD_GRAMS_PER_TROY_OUNCE=31\.1034768/);
  assert.doesNotMatch(homepage, /XAU:"Au"/);
});

test("homepage explains the international gold reference conversion", () => {
  assert.match(homepage, /1 ทรอยออนซ์ = 31\.10 กรัม/);
  assert.match(homepage, /Provider fees and spreads are not included/);
});
