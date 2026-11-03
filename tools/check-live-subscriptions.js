"use strict";
const { inspectLiveSubscriptions, createInventoryReader } = require("../src/liveSubscriptionInventory");
inspectLiveSubscriptions({ env: process.env, get: createInventoryReader() }).then(report => {
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.complete ? 0 : 1;
}).catch(() => { console.log('{"complete":false,"reason":"inventory_failed"}'); process.exitCode = 1; });
