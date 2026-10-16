# SavePulse multi-agent queue (review-only integration)

Status: **prototype control module + shared Google Sheet queue + three scheduled ChatGPT agents.** Not a deployed autonomous service. Do not advertise 24/7 operation, inbox deliverability, production end-to-end handoff, or proved cost savings without evidence.

## Source of truth

CRM: https://docs.google.com/spreadsheets/d/1hkwqtrwKB-enoboIW5vpFalPcMXn09nLRTdVruJvTOk/edit

- AgentQueue (A:W): stable 23-column queue, job owner, status, approval, parent ID, idempotency key, lease, evidence and blocker.
- AgentRuns (A:L): durable audit trail of actual actions, result and supporting evidence.
- AgentPolicy (A:G): role-specific authority, handoff and failure rules.
- Other existing tabs remain intact, including DecisionMakerEmails, EmailResearchProgress, WebsiteLeads and LeadEvents.

Scheduled workers are ChatGPT tasks, NOT Node processes. Their schedules and prompts must be inspected separately. The module at src/agentWorkflow.js is a pure function library and is **not automatically called by those tasks**; adopting it in a runtime or Google Apps Script requires separate authenticated integration and testing.

## Roles and directed handoff

Orchestrator (validate queue schema, idempotency, ownership and status)
  -> Research (source-published company and contact evidence)
  -> Verification (person/role/current email, fit, legal gate, bounce, opt-out and dedupe)
  -> Sales (unsent, personalised draft for founder review; inbound enquiries only when verified)
  -> Analytics (funnel and performance review; new Research hypotheses)

Each stage must persist its applied result and a corresponding AgentRuns entry before creating a child job for the next stage. **A pending job or configured prompt alone is not proof of a completed handoff.**

## Fail-closed rules

- Unknown contact/legal eligibility is NOT permission to email. Public email listings do NOT prove deliverability or consent.
- A bounce, opt-out, duplicate, previously contacted record or incomplete evidence blocks a new outbound draft.
- No automation sends new cold emails, signs contracts, makes pricing commitments, takes payments, changes entitlements, spends money or deploys a site without founder-specific permission.
- The pure state machine verifies header order and rejects invalid transitions. Completed jobs require result plus evidence. Blocked jobs require manual review to re-open.
- Atomic locks are **not available in Google Sheets**. Lease fields are advisory. Separate role ownership, read-before-write, re-read-after-write and no ambiguous retries are required; production-grade concurrency requires a transactional job store.
- Never put secrets, credentials or confidential customer documents into a public repository or CRM.

## Testing and review

Run: node --test tests/agentWorkflow.test.js

Coverage includes schema mismatch, ownership, claims, duplicate job suppression, evidence at completion, parent/child handoff, approval gate, source provenance and suppression. These tests **simulate in-memory transitions**; they do not test scheduled task execution, Gmail sending, payment integration, or deployed production traffic.

Before production activation:
1. Obtain founder approval and choose a persistent transactional store + authenticated service identities, rather than concurrent Sheets writes.
2. Add real connectors for Gmail/CRM and provider error handling with no blind retries.
3. Run sandbox contact -> verify -> draft -> approval -> review end-to-end with test addresses only.
4. Establish observability, human intervention paths, permission boundaries, timeouts, retries and data-protection review.
5. Keep the live product and cold-mail-sending disabled for autonomous operation until acceptance testing passes.
