"use strict";
const { inspectLiveBilling, createLivePreflightReader } = require("../src/billingLivePreflight");
// Run only in the server's environment. Never paste keys into command arguments.
const get = createLivePreflightReader();
inspectLiveBilling({ env: process.env, get }).then(report => {
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ready ? 0 : 1;
}).catch(() => { console.log('{"ready":false,"error":"preflight_failed"}'); process.exitCode = 1; });
