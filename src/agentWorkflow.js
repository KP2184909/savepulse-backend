"use strict";

const crypto = require("node:crypto");

// Exact column order of SavePulse Global Growth CRM -> AgentQueue.
const QUEUE_COLUMNS = Object.freeze([
  "Job ID", "Created At UTC", "Job Type", "Owner Agent", "Status",
  "Priority", "Entity Key", "Country", "Contact Email", "Input Summary",
  "Evidence URLs", "Source Record", "Parent Job ID", "Next Agent",
  "Approval Required", "Approval Status", "Idempotency Key", "Lease Owner",
  "Lease Until UTC", "Updated At UTC", "Result Summary", "Error / Blocker", "Due At UTC"
]);
const RUN_COLUMNS = Object.freeze([
  "Run ID", "Job ID", "Agent", "Started At UTC", "Finished At UTC",
  "Outcome", "Input Snapshot", "Evidence / Source URLs",
  "Created Child Job IDs", "Error / Blocker", "Changes Actually Applied", "Reviewer / Notes"
]);
const AGENTS = new Set(["Orchestrator", "Research", "Verification", "Sales", "Analytics"]);
const STATES = new Set(["pending", "in_progress", "completed", "blocked", "needs_approval"]);
const TRANSITIONS = Object.freeze({
  pending: new Set(["in_progress", "blocked"]),
  in_progress: new Set(["completed", "blocked", "needs_approval", "pending"]),
  needs_approval: new Set(["in_progress", "blocked"]),
  blocked: new Set(["pending"]),
  completed: new Set()
});
const SEND_ACTIONS = new Set([
  "send_cold_email", "quote_price", "accept_payment",
  "sign_contract", "deploy_production"
]);

function assertHeader(row, expected) {
  if (!Array.isArray(row) || row.length !== expected.length ||
      expected.some((name, i) => row[i] !== name)) {
    throw new Error("CRM schema mismatch: stop all queue writes and request review");
  }
}
function fromRow(header, row) {
  assertHeader(header, QUEUE_COLUMNS);
  if (!Array.isArray(row)) throw new Error("invalid queue row");
  return Object.fromEntries(QUEUE_COLUMNS.map((name, i) => [name, String(row[i] ?? "")]));
}
function toRow(record) {
  const fields = QUEUE_COLUMNS.map((name) => String(record[name] ?? ""));
  if (!fields[0] || !AGENTS.has(fields[3]) || !STATES.has(fields[4]) || !fields[16]) {
    throw new Error("invalid queue job identity, owner, state or idempotency key");
  }
  return fields;
}
function idempotencyKey(parts) {
  if (!Array.isArray(parts) || !parts.length ||
      parts.some((x) => !String(x || "").trim())) {
    throw new Error("all idempotency key parts must be nonempty");
  }
  return crypto.createHash("sha256")
    .update(parts.map((x) => String(x).trim().toLowerCase()).join("\u001f"))
    .digest("hex");
}
function assertUnique(existing, candidate) {
  if (existing.some((job) => job["Job ID"] === candidate["Job ID"] ||
      job["Idempotency Key"] === candidate["Idempotency Key"])) {
    throw new Error("duplicate job ID or idempotency key");
  }
}
function isoNow(now) {
  const dt = new Date(now);
  if (!Number.isFinite(dt.getTime())) throw new Error("invalid timestamp");
  return dt.toISOString();
}
function claim(job, agent, now, leaseMinutes = 30) {
  if (job["Owner Agent"] !== agent || !AGENTS.has(agent)) {
    throw new Error("job belongs to a different agent");
  }
  if (job.Status !== "pending") {
    throw new Error("job is not pending; no implicit retry or lease steal");
  }
  if (!Number.isInteger(leaseMinutes) || leaseMinutes < 1 || leaseMinutes > 240) {
    throw new Error("invalid lease");
  }
  const timestamp = isoNow(now);
  return {
    ...job, Status: "in_progress", "Lease Owner": agent,
    "Lease Until UTC": new Date(new Date(timestamp).getTime() + leaseMinutes * 60000).toISOString(),
    "Updated At UTC": timestamp
  };
}
function transition(job, nextState, agent, now, opts = {}) {
  if (!STATES.has(nextState) || !TRANSITIONS[job.Status]?.has(nextState)) {
    throw new Error("invalid status transition");
  }
  if (job["Owner Agent"] !== agent) throw new Error("wrong owner");
  if (job.Status === "blocked" && !opts.manualReview) {
    throw new Error("blocked job requires manual review to reopen");
  }
  if (job.Status === "in_progress" && job["Lease Owner"] !== agent) {
    throw new Error("job not claimed by agent");
  }
  if (nextState === "completed" && (!opts.result || !opts.evidence)) {
    throw new Error("completion requires applied result and evidence");
  }
  if (nextState === "needs_approval" && !opts.result) {
    throw new Error("approval requests require an actual draft/result reference");
  }
  if (nextState === "pending" && !opts.manualReview) {
    throw new Error("retry requires manual review; no blind retries");
  }
  if (SEND_ACTIONS.has(opts.action) && opts.approved !== true) {
    throw new Error("founder approval required for external action");
  }
  const timestamp = isoNow(now);
  return {
    ...job, Status: nextState, "Updated At UTC": timestamp,
    "Result Summary": opts.result || job["Result Summary"] || "",
    "Evidence URLs": opts.evidence || job["Evidence URLs"] || "",
    "Error / Blocker": opts.error || (nextState === "blocked" ? "manual review required" : ""),
    "Approval Status": nextState === "needs_approval" ? "pending_founder" : job["Approval Status"],
    "Lease Owner": "", "Lease Until UTC": ""
  };
}
function canPrepareDraft(contact) {
  const failures = [];
  if (!contact.company || !contact.email || !/^\S+@\S+\.\S+$/.test(contact.email)) {
    failures.push("missing validated business contact");
  }
  if (contact.type !== "named_direct" || !contact.name || !contact.role) {
    failures.push("no source-published named direct decision-maker");
  }
  if (!/^https:\/\//.test(contact.emailSource || "") ||
      !/^https:\/\//.test(contact.roleSource || "")) {
    failures.push("missing published evidence URLs");
  }
  if (contact.bounced || contact.optedOut ||
      contact.duplicate || contact.previouslyContacted) {
    failures.push("suppressed, bounced or already contacted");
  }
  if (contact.legalGate !== "cleared") failures.push("legal contact gate not cleared");
  if (contact.companyFit !== true) failures.push("company fit not verified");
  return { eligible: failures.length === 0, reasons: failures };
}
function handoff(parent, options, existing, now) {
  if (parent.Status !== "completed") {
    throw new Error("handoff requires completed upstream stage");
  }
  if (!AGENTS.has(options.owner) || options.owner === parent["Owner Agent"]) {
    throw new Error("invalid next agent");
  }
  if (!options.jobId || !options.idempotencyKey || !options.type) {
    throw new Error("missing child identity");
  }
  if (options.type === "send_cold_email") {
    throw new Error("cold send cannot be queued automatically");
  }
  const created = isoNow(now);
  const job = {
    "Job ID": options.jobId, "Created At UTC": created,
    "Job Type": options.type, "Owner Agent": options.owner,
    Status: "pending", Priority: options.priority || "normal",
    "Entity Key": options.entity || parent["Entity Key"],
    Country: options.country || parent.Country,
    "Contact Email": options.email || "", "Input Summary": options.summary || "",
    "Evidence URLs": options.evidence || parent["Evidence URLs"],
    "Source Record": options.source || parent["Source Record"],
    "Parent Job ID": parent["Job ID"], "Next Agent": options.nextAgent || "",
    "Approval Required": options.requiresApproval ? "YES" : "NO",
    "Approval Status": options.requiresApproval ? "not_requested" : "not_required",
    "Idempotency Key": options.idempotencyKey, "Lease Owner": "", "Lease Until UTC": "",
    "Updated At UTC": created, "Result Summary": "",
    "Error / Blocker": "", "Due At UTC": options.due || ""
  };
  toRow(job);
  assertUnique(existing, job);
  return job;
}
module.exports = {
  QUEUE_COLUMNS, RUN_COLUMNS, AGENTS, STATES,
  assertHeader, fromRow, toRow, idempotencyKey,
  assertUnique, claim, transition, canPrepareDraft, handoff
};
