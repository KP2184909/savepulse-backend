"use strict";
const $ = id => document.getElementById(id);
let token = localStorage.getItem("savepulse_session") || "";
let verifiedEmail = "";
let busy = false;
const membershipRequested = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("next") === "membership";
const messages = { authentication_required: "Verify your email to continue.", invalid_or_expired_code: "Code invalid or expired. Request a new code after 60 seconds.", wait_before_resending: "Wait 60 seconds before requesting another code.", too_many_requests: "Too many requests. Please try again later.", trial_not_available: "Trial service is unavailable. No trial or payment has been created.", trial_email_unavailable: "Email delivery was not confirmed. Please wait 60 seconds and try again.", trial_storage_unavailable: "Could not confirm the database result. Refresh status before retrying." };
async function api(path, body) {
  const response = await fetch(`/api/v1/trial/${path}`, { method: body === undefined ? "GET" : "POST", cache: "no-store", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path === "status") { token = ""; localStorage.removeItem("savepulse_session"); }
    throw Error(messages[data.error] || "The server could not confirm this action. Please try again.");
  }
  return data;
}
function draw(data) {
  if (!data || !["free", "plus", "pro", "business"].includes(data.plan) || !data.email || !data.trial || !["active", "expired", "cancelled", "not_started"].includes(data.trial.status)) throw Error("The server has not confirmed your access.");
  if (data.trial.active && (!Number.isFinite(Date.parse(data.trial.startedAt)) || !Number.isFinite(Date.parse(data.trial.endsAt)) || Date.parse(data.trial.endsAt) <= Date.now() || Date.parse(data.trial.endsAt) <= Date.parse(data.trial.startedAt))) throw Error("The server has not confirmed an unexpired trial. Refresh status.");
  $("login").hidden = true; $("account").hidden = false;
  const trial = data.trial;
  $("details").textContent = `Email: ${data.email}\nCurrent access: ${data.plan}\nTrial: ${trial.status}\n${trial.startedAt ? `Started: ${new Date(trial.startedAt).toLocaleString()}\nEnds: ${new Date(trial.endsAt).toLocaleString()}\n` : ""}${trial.cancelledAt ? `Cancelled: ${new Date(trial.cancelledAt).toLocaleString()}\n` : ""}Automatic renewal: off · No charge\n${data.paidPlan !== "free" ? "Your separate paid membership is unchanged." : "After trial: Free"}`;
  $("start").hidden = trial.status !== "not_started" || data.paidPlan !== "free";
  $("cancel").hidden = !trial.active;
  $("qaReminder").hidden = data.email !== "savepulse.cloud@gmail.com";
}
async function action(fn) {
  if (busy) return; busy = true;
  document.querySelectorAll("button").forEach(b => b.disabled = true);
  $("message").textContent = "Checking with the server…";
  try { await fn(); } catch (error) { $("message").textContent = error.message; }
  finally { busy = false; document.querySelectorAll("button").forEach(b => b.disabled = false); }
}
$("requestForm").onsubmit = event => { event.preventDefault(); action(async () => {
  const email = $("email").value.trim().toLowerCase();
  await api("code", { email }); verifiedEmail = email;
  $("verifyForm").hidden = false; $("message").textContent = "Verification email accepted by the provider. Check your inbox and spam folder. Your trial has not started yet."; $("code").focus();
}); };
$("verifyForm").onsubmit = event => { event.preventDefault(); action(async () => {
  const data = await api("verify", { email: verifiedEmail, code: $("code").value });
  token = data.token; localStorage.setItem("savepulse_session", token); $("code").value = "";
  draw(data); $("message").textContent = "Email verified. Your access is shown below.";
  if (membershipRequested) window.location.assign("/membership/");
}); };
$("start").onclick = () => action(async () => { const data = await api("start", {}); draw(data); $("message").textContent = data.trial.active ? "Trial activated by the server. No card, no automatic renewal." : "Your existing trial history or paid membership has been preserved."; });
$("cancel").onclick = () => action(async () => { const data = await api("cancel", {}); draw(data); $("message").textContent = "Trial cancelled by the server. No payment has been created. Your paid membership, if any, is unchanged."; });
$("refresh").onclick = () => action(async () => { draw(await api("status")); $("message").textContent = "Status refreshed from the server."; });
$("qaReminder").onclick = () => action(async () => { const result = await api("qa-reminder", {}); $("message").textContent = `Isolated virtual-time QA: ${result.reminder?.status || "not confirmed"}. First pass sent ${result.first.sent || 0}; duplicate pass sent ${result.duplicate.sent || 0}. Your real trial is unchanged. Check the test mailbox for the [TEST] email.`; });
$("logout").onclick = () => action(async () => { await api("logout", {}); token = ""; localStorage.removeItem("savepulse_session"); $("account").hidden = true; $("login").hidden = false; $("email").value = ""; $("code").value = ""; $("verifyForm").hidden = true; verifiedEmail = ""; $("message").textContent = "Signed out on this device. Enter the email you want to verify. Your previous trial history is unchanged."; $("email").focus(); });
if (token) action(async () => { try { draw(await api("status")); $("message").textContent = "Status confirmed by the server."; if (membershipRequested) window.location.assign("/membership/"); } catch (error) { $("login").hidden = false; throw error; } });
else $("login").hidden = false;
setInterval(() => { if (token && !busy) action(async () => { draw(await api("status")); $("message").textContent = "Status confirmed by the server."; }); }, 60000);
