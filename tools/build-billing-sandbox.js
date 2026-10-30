"use strict";
// Package the same tested CommonJS modules as ESM for the Supabase Edge runtime.
// Generated files are deployment artifacts; edit src/, then run this command.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "supabase/functions/savepulse-billing-sandbox/shared");
fs.mkdirSync(out, { recursive: true });
for (const name of ["taxDeliveryWorker", "billingRiskResolver", "billingRiskInbox", "trialLifecycle", "billingLifecycle", "stripeSignature", "botTaxFx", "taxDocumentLedger", "thaiTaxInvoiceDraft", "thaiCreditNote", "taxDocumentJobs", "taxFxPolicy"]) {
  const input = fs.readFileSync(path.join(root, `src/${name}.js`), "utf8");
  let result = input.replace('"use strict";\n', "").replace('const crypto = require("node:crypto");', 'import crypto from "node:crypto";');
  result = result.replace('const { canonicalEmail } = require("./trialLifecycle");', 'import { canonicalEmail } from "./trialLifecycle.mjs";');
  result = result.replace('const { buildThaiCreditNote } = require("./thaiCreditNote");', 'import { buildThaiCreditNote } from "./thaiCreditNote.mjs";');
  result = result.replace('const { Buffer } = require("node:buffer");', 'import { Buffer } from "node:buffer";');
  result = result.replace('const seller = require("../config/billing-seller.json");', `const seller = ${fs.readFileSync(path.join(root, "config/billing-seller.json"), "utf8")};`);
  result = result.replace(/module\.exports\s*=\s*\{([^}]+)\};/, "export {$1};");
  if (result.includes("require(") || result.includes("module.exports")) throw Error(`ESM packaging needs review: ${name}`);
  fs.writeFileSync(path.join(out, `${name}.mjs`), result);
}
console.log("Packaged billing sandbox shared modules (no credentials).");
