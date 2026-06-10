#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://savepulse-backend.onrender.com";
const SYMBOLS = [
  "USDTHB",
  "JPYTHB",
  "EURTHB",
  "XAUTHB",
  "BTCTHB",
  "USDJPY",
  "EURUSD",
  "XAUUSD",
  "BTCUSD"
];

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.SAVEPULSE_BASE_URL || DEFAULT_BASE_URL,
    maxAgeHours: Number(process.env.SAVEPULSE_SIGNAL_MAX_AGE_HOURS || 36)
  };

  for (const arg of argv) {
    if (arg.startsWith("--base-url=")) options.baseUrl = arg.slice("--base-url=".length);
    if (arg.startsWith("--max-age-hours=")) options.maxAgeHours = Number(arg.slice("--max-age-hours=".length));
  }

  options.baseUrl = options.baseUrl.replace(/\/+$/, "");
  if (!Number.isFinite(options.maxAgeHours) || options.maxAgeHours <= 0) {
    options.maxAgeHours = 36;
  }
  return options;
}

function bangkokTime(iso) {
  if (!iso) return "--";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function hoursSince(iso) {
  if (!iso) return Infinity;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return Infinity;
  return (Date.now() - time) / 36e5;
}

async function fetchSignal(baseUrl, symbol) {
  const url = `${baseUrl}/api/v1/status?symbol=${encodeURIComponent(symbol)}`;
  const response = await fetch(url, {
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    return {
      symbol,
      ok: false,
      status: `HTTP_${response.status}`,
      action: "--",
      receivedAt: null,
      detail: "--",
      ageHours: Infinity
    };
  }

  const payload = await response.json();
  const signal = payload?.signal || {};
  return {
    symbol,
    ok: true,
    status: signal.receivedAt ? "ARRIVED" : "MISSING",
    action: signal.action || "--",
    price: signal.price ?? "--",
    timeframe: signal.timeframe || "--",
    receivedAt: signal.receivedAt || null,
    detail: signal.pine?.detail || "--",
    ageHours: hoursSince(signal.receivedAt)
  };
}

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : `${text}${" ".repeat(width - text.length)}`;
}

function printTable(rows, maxAgeHours) {
  const headers = ["symbol", "status", "action", "timeframe", "price", "received_bkk", "age_h", "pine_detail"];
  const widths = [8, 10, 12, 9, 12, 20, 7, 28];
  console.log(headers.map((h, index) => pad(h, widths[index])).join(" "));
  console.log(widths.map((w) => "-".repeat(w)).join(" "));

  for (const row of rows) {
    const stale = row.ageHours > maxAgeHours;
    const status = row.status === "ARRIVED" && stale ? "STALE" : row.status;
    const age = Number.isFinite(row.ageHours) ? row.ageHours.toFixed(1) : "--";
    console.log([
      pad(row.symbol, widths[0]),
      pad(status, widths[1]),
      pad(row.action, widths[2]),
      pad(row.timeframe, widths[3]),
      pad(row.price, widths[4]),
      pad(bangkokTime(row.receivedAt), widths[5]),
      pad(age, widths[6]),
      pad(row.detail, widths[7])
    ].join(" "));
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`Checking SavePulse production signals from ${options.baseUrl}`);
  console.log(`Expected symbols: ${SYMBOLS.join(", ")}`);
  console.log(`Max fresh age: ${options.maxAgeHours} hours\n`);

  const rows = await Promise.all(SYMBOLS.map((symbol) => fetchSignal(options.baseUrl, symbol)));
  printTable(rows, options.maxAgeHours);

  const missing = rows.filter((row) => row.status !== "ARRIVED");
  const stale = rows.filter((row) => row.status === "ARRIVED" && row.ageHours > options.maxAgeHours);

  console.log("");
  if (missing.length === 0 && stale.length === 0) {
    console.log(`OK: all ${SYMBOLS.length} symbols have fresh TradingView data.`);
    return;
  }

  if (missing.length > 0) {
    console.log(`Missing or failed: ${missing.map((row) => row.symbol).join(", ")}`);
  }
  if (stale.length > 0) {
    console.log(`Stale: ${stale.map((row) => row.symbol).join(", ")}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Signal check failed: ${error.message}`);
  process.exitCode = 1;
});
