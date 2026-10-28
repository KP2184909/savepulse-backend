"use strict";
// Read a minimal, credential-free export; never reads provider credentials.
const fs = require("node:fs");
const { freightFeedHealth } = require("../src/freightFeedHealth");
if (process.argv.length !== 3) {
  console.error("Usage: node tools/freight-feed-health.js evidence.json");
  process.exitCode = 2;
} else {
  try {
    console.log(JSON.stringify(freightFeedHealth(JSON.parse(fs.readFileSync(process.argv[2], "utf8"))), null, 2));
  } catch (_) {
    console.error("Invalid evidence input; no source contents logged.");
    process.exitCode = 1;
  }
}
