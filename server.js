"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const { TRACKED_ASSETS, applyAutoDemotion, createDefaultSignal, createSignal } = require("./src/signalEngine");
const { broadcastStrongBuy } = require("./src/emailDispatcher");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || "state");
const PUBLIC_DIR = path.join(__dirname, "public");
const SIGNALS_FILE = path.join(DATA_DIR, "signals.json");
const SUBSCRIBERS_FILE = path.join(DATA_DIR, "subscribers.json");
const DAILY_FREE_QUOTA = Number(process.env.DAILY_FREE_QUOTA || 50);
const WEBHOOK_SECRET =
  process.env.WEBHOOK_SECRET ||
  (process.env.NODE_ENV === "production" ? "" : "SAVEPULSE_MASTER_KEY_2026");

fs.mkdirSync(DATA_DIR, { recursive: true });

let signalsBySymbol = loadJson(SIGNALS_FILE, {});
let subscribers = loadJson(SUBSCRIBERS_FILE, []);

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-savepulse-secret",
    "content-type": "application/json; charset=utf-8"
  });
  res.end(body);
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "content-type": contentType
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function bearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function incomingSecret(req, body) {
  return body.secret_key || body.secretKey || req.headers["x-savepulse-secret"] || bearerToken(req);
}

function publicSignal(signal) {
  const effective = applyAutoDemotion(signal);
  return {
    ...effective,
    legalBoundary:
      "Decision intelligence only. Not financial advice, trading instruction, or return guarantee."
  };
}

function quotaSnapshot() {
  const used = Math.min(DAILY_FREE_QUOTA, subscribers.length);
  return {
    limit: DAILY_FREE_QUOTA,
    used,
    remaining: Math.max(0, DAILY_FREE_QUOTA - used)
  };
}

function listAssets() {
  const signals = {
    ...Object.fromEntries(TRACKED_ASSETS.map((symbol) => [symbol, createDefaultSignal(symbol)])),
    ...signalsBySymbol
  };

  const order = new Map(TRACKED_ASSETS.map((symbol, index) => [symbol, index]));

  return Object.values(signals)
    .map(publicSignal)
    .sort((a, b) => {
      const aOrder = order.has(a.symbol) ? order.get(a.symbol) : Number.MAX_SAFE_INTEGER;
      const bOrder = order.has(b.symbol) ? order.get(b.symbol) : Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder || a.symbol.localeCompare(b.symbol);
    });
}

function emailIsValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml"
    }[extension] || "application/octet-stream"
  );
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, file) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    sendText(res, 200, file, contentTypeFor(filePath));
  });
}

async function handleWebhook(req, res) {
  const body = await parseBody(req);

  if (!WEBHOOK_SECRET || incomingSecret(req, body) !== WEBHOOK_SECRET) {
    sendJson(res, 401, { error: "unauthorized_webhook" });
    return;
  }

  const signal = createSignal(body);
  signalsBySymbol[signal.symbol] = signal;
  saveJson(SIGNALS_FILE, signalsBySymbol);

  const effectiveSignal = publicSignal(signal);
  let emailDispatch = { skipped: true, reason: "not_strong_buy" };

  if (signal.action === "STRONG_BUY") {
    emailDispatch = await broadcastStrongBuy({
      signal,
      effectiveSignal,
      subscribers
    });
  }

  sendJson(res, 202, {
    accepted: true,
    signal: effectiveSignal,
    emailDispatch
  });
}

async function handleSubscribe(req, res) {
  const body = await parseBody(req);
  const email = String(body.email || "").trim().toLowerCase();

  if (!emailIsValid(email)) {
    sendJson(res, 422, { error: "valid_email_required" });
    return;
  }

  const existing = subscribers.find((subscriber) => subscriber.email === email);
  const record = {
    id: existing?.id || crypto.randomUUID(),
    email,
    locale: body.locale === "th" ? "th" : "en",
    interest: String(body.interest || "general").slice(0, 40),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existing) {
    subscribers = subscribers.map((subscriber) => (subscriber.email === email ? record : subscriber));
  } else {
    subscribers.push(record);
  }

  saveJson(SUBSCRIBERS_FILE, subscribers);

  sendJson(res, 201, {
    subscribed: true,
    subscriber: { email: record.email, locale: record.locale, interest: record.interest },
    quota: quotaSnapshot()
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/api/v1/health") {
      sendJson(res, 200, {
        ok: true,
        name: "SavePulse Analytics Network",
        now: new Date().toISOString()
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/assets") {
      sendJson(res, 200, {
        assets: listAssets(),
        quota: quotaSnapshot(),
        generatedAt: new Date().toISOString()
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/status") {
      const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
      const signal = signalsBySymbol[symbol];
      sendJson(res, signal ? 200 : 404, signal ? { signal: publicSignal(signal) } : { error: "symbol_not_found" });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/webhook/tradingview") {
      await handleWebhook(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/subscribe") {
      await handleSubscribe(req, res);
      return;
    }

    if (req.method === "GET") {
      serveStatic(req, res, url.pathname);
      return;
    }

    sendJson(res, 405, { error: "method_not_allowed" });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

const server = http.createServer(handleRequest);

if (!WEBHOOK_SECRET) {
  console.warn("WEBHOOK_SECRET is not configured. TradingView webhook writes will be rejected.");
}

server.listen(PORT, HOST, () => {
  console.log(`SavePulse running on http://${HOST}:${PORT}`);
});

module.exports = {
  handleRequest,
  listAssets,
  quotaSnapshot,
  server
};
