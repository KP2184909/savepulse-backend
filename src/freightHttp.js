"use strict";
const crypto = require("node:crypto");
const { PRICE } = require("./freightpulse");
function constantEqual(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function createFreightHttp({
  service,
  stripe,
  auth,
  env = process.env,
  parseBody,
  readRawBody,
  sendJson,
  demo,
}) {
  return async function handle(req, res, url) {
    if (!url.pathname.startsWith("/api/v1/freightpulse/")) return false;
    res.setHeader("cache-control", "no-store");
    const path = url.pathname.slice("/api/v1/freightpulse/".length),
      token = String(req.headers.authorization || "").replace(/^Bearer /, "");
    if (req.method === "GET" && path === "catalog") {
      sendJson(res, 200, {
        price: PRICE,
        mode: "development",
        sandboxEnabled: env.FREIGHTPULSE_SANDBOX_ENABLED === "true",
        liveSales: false,
        feedContract: "draft",
        discord: "not_enabled",
      });
      return true;
    }
    if (req.method === "GET" && path === "demo") {
      sendJson(res, 200, demo());
      return true;
    }
    if (env.FREIGHTPULSE_SANDBOX_ENABLED !== "true") {
      sendJson(res, 503, { error: "freight_sandbox_disabled" });
      return true;
    }
    if (req.method === "POST" && ["auth/code", "auth/verify"].includes(path)) {
      const body = await parseBody(req);
      if (
        String(body.email || "")
          .trim()
          .toLowerCase() !== "savepulse.cloud@gmail.com"
      ) {
        sendJson(res, 403, { error: "sandbox_test_mailbox_required" });
        return true;
      }
      if (!auth) {
        sendJson(res, 503, { error: "sandbox_identity_not_configured" });
        return true;
      }
      sendJson(
        res,
        200,
        path === "auth/code"
          ? await auth.code(body.email, req)
          : await auth.verify(body.email, body.code),
      );
      return true;
    }
    if (req.method === "POST" && path === "billing/webhook") {
      if (!stripe) {
        sendJson(res, 503, { error: "stripe_sandbox_not_configured" });
        return true;
      }
      let event;
      try {
        event = stripe.verify(
          await readRawBody(req),
          req.headers["stripe-signature"],
        );
      } catch (_) {
        sendJson(res, 400, { error: "invalid_freight_stripe_signature" });
        return true;
      }
      sendJson(res, 200, await service.billingEvent(event));
      return true;
    }
    if (
      req.method === "POST" &&
      ["signals/test", "notifications/tick"].includes(path)
    ) {
      const secret =
        path === "signals/test"
          ? env.FREIGHT_TEST_FEED_SECRET
          : env.FREIGHT_JOB_SECRET;
      if (
        !constantEqual(
          req.headers.authorization,
          secret ? `Bearer ${secret}` : "",
        )
      ) {
        sendJson(res, 401, { error: "freight_worker_unauthorized" });
        return true;
      }
      sendJson(
        res,
        200,
        path === "signals/test"
          ? await service.ingest(await parseBody(req))
          : await service.notifications(),
      );
      return true;
    }
    if (req.method === "POST" && path === "signals/live") {
      sendJson(res, 503, {
        error: "real_feed_contract_and_licensing_not_approved",
      });
      return true;
    }
    if (req.method === "GET" && path === "account") {
      sendJson(res, 200, { company: await service.account(token) });
      return true;
    }
    if (req.method === "GET" && path === "report") {
      sendJson(res, 200, await service.report(token));
      return true;
    }
    if (req.method === "POST" && path === "company") {
      const b = await parseBody(req);
      sendJson(res, 200, {
        company: await service.createCompany(token, b.name),
      });
      return true;
    }
    if (req.method === "POST" && path === "preferences") {
      sendJson(res, 200, {
        company: await service.preferences(token, await parseBody(req)),
      });
      return true;
    }
    if (req.method === "POST" && path === "checkout") {
      sendJson(res, 200, await service.checkout(token));
      return true;
    }
    if (req.method === "POST" && path === "portal") {
      sendJson(res, 200, await service.portal(token));
      return true;
    }
    sendJson(res, 404, { error: "freight_route_not_found" });
    return true;
  };
}
module.exports = { createFreightHttp };
