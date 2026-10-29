"use strict";
const $ = id => document.getElementById(id);
let catalog, account, busy = false;
const token = () => localStorage.getItem("savepulse_session") || "";
const billingBase = window.location.hostname === "deploy-preview-10--astounding-fenglisu-0ff097.netlify.app" ? "/sandbox-billing/" : "/api/v1/billing/";
const names = { plus: "Plus", pro: "Pro", business: "Business" };
const errors = {
  authentication_required: "Verify your email before continuing.", billing_test_mailbox_required: "Sandbox testing is limited to the authorized test mailbox.",
  billing_membership_exists_use_portal: "You already have a membership. Use Manage billing & receipts.", billing_checkout_already_open: "A checkout is already open for another plan. Complete or cancel it before choosing another plan.",
  billing_existing_membership_needs_migration: "Your existing membership is preserved. Contact support to connect billing management.",
  billing_payment_processing: "Stripe is processing this checkout. Refresh membership after it finishes.", billing_busy_retry: "Another membership action is in progress. Please try again shortly.",
  billing_unavailable: "Paid signup is not available yet. The no-card trial is separate and remains available."
};
async function api(route, body) {
  const response = await fetch(`${billingBase}${route}`, { method: body === undefined ? "GET" : "POST", cache: "no-store", headers: { "content-type": "application/json", ...(token() ? { authorization: `Bearer ${token()}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw Error(errors[data.error] || "The server could not confirm this action. No access has been granted. Refresh before retrying.");
  return data;
}
function draw() {
  $("billingDetails").hidden = !catalog?.billingDetailsRequired || Boolean(account?.managed && !["canceled", "incomplete_expired"].includes(account.status));
  $("plans").replaceChildren();
  for (const plan of catalog?.plans || []) {
    if (!names[plan.id] || !Number.isFinite(plan.amount) || plan.currency !== "USD" || plan.interval !== "month") continue;
    const card = document.createElement("section"); card.className = "plan";
    const title = document.createElement("h2"); title.textContent = names[plan.id];
    const price = document.createElement("p"); price.className = "price"; price.textContent = `$${plan.amount} USD / month`;
    const note = document.createElement("p"); note.textContent = catalog.mode === "test" ? `Sandbox demonstration. No real charge. Test access only.${catalog.taxLabel ? " " + catalog.taxLabel : ""}` : "Charged at signup. Renews monthly until cancelled.";
    const button = document.createElement("button"); button.textContent = catalog.mode === "test" ? `Test ${names[plan.id]} checkout` : `Subscribe to ${names[plan.id]}`;
    button.disabled = busy || !account?.email || !catalog.enabled || (account?.managed && !["canceled", "incomplete_expired"].includes(account.status));
    button.onclick = () => action(async () => {
      if (!account?.email) throw Error("Verify your email before continuing.");
      if (catalog.billingDetailsRequired) {
        if (!$("billingDetails").reportValidity()) throw Error("Complete your billing details before checkout.");
        await api("profile", { name: $("billingName").value, address: $("billingAddress").value, postalCode: $("billingPostal").value, taxId: $("billingTaxId").value, branchCode: $("billingBranch").value, country: "TH", serviceUseCountry: "TH", domesticUseConfirmed: $("domesticUse").checked });
      }
      const result = await api("checkout", { email: account.email, plan: plan.id });
      if (!result.checkout?.configured || !result.checkout.url?.startsWith("https://checkout.stripe.com/")) throw Error("Checkout was not confirmed by the server.");
      window.location.assign(result.checkout.url);
    });
    card.append(title, price, note, button); $("plans").append(card);
  }
  $("verifyLink").hidden = Boolean(account?.email);
  $("refresh").hidden = !account?.email;
  $("portal").hidden = !account?.portalAvailable;
  $("portal").disabled = busy;
  if (account) $("status").textContent = `Email: ${account.email}\nCurrent paid access: ${account.plan}\nBilling status: ${account.status}${account.paidUntil ? `\nPaid through: ${new Date(account.paidUntil).toLocaleString()}` : ""}\nRenewal: ${account.renews ? "on" : "off"}${account.cancellationScheduled ? " (cancellation scheduled)" : ""}`;
}
async function action(fn) {
  if (busy) return; busy = true; draw();
  $("message").textContent = "Checking with the server…";
  try { await fn(); } catch (error) { $("message").textContent = error.message; }
  finally { busy = false; draw(); }
}
async function refresh() {
  const identityResponse = await fetch("/api/v1/trial/status", { cache: "no-store", headers: { authorization: `Bearer ${token()}` } });
  const verified = await identityResponse.json();
  if (!identityResponse.ok || !verified.email) throw Error("Verify your email before continuing.");
  const status = await api("status");
  account = { ...status, email: verified.email };
  $("message").textContent = catalog.mode === "test" ? "STRIPE SANDBOX — test only. No real payment or live membership is created." : "Membership status confirmed by the server.";
}
$("refresh").onclick = () => action(refresh);
$("portal").onclick = () => action(async () => { const result = await api("portal", {}); if (!result.url?.startsWith("https://billing.stripe.com/")) throw Error("Billing portal unavailable."); window.location.assign(result.url); });
action(async () => {
  catalog = await api("catalog");
  if (!catalog.enabled) { $("message").textContent = "Paid signup is not open yet. You can use the separate 14-day no-card trial."; return; }
  if (token()) await refresh();
  else $("message").textContent = "Verify your email, then choose a plan. Your trial will not convert to paid automatically.";
});
