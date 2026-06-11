"use strict";

const DEFAULT_TABLES = {
  signals: "signals",
  subscribers: "subscribers",
  notifications: "notification_jobs",
  invoices: "invoices",
  scheduler: "scheduler_state",
  stripeEvents: "stripe_events",
  emailLogs: "email_logs"
};

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function supabaseKey(env = process.env) {
  return (
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_KEY ||
    env.SUPABASE_ANON_KEY ||
    ""
  ).trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function isoOrNull(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringOrNull(value) {
  const string = String(value || "").trim();
  return string || null;
}

function createSupabasePersistence({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const url = normalizeBaseUrl(env.SUPABASE_URL || env.SUPABASE_PROJECT_URL);
  const key = supabaseKey(env);
  const tables = { ...DEFAULT_TABLES };
  const enabled = Boolean(url && key && fetchImpl);

  async function request(path, options = {}) {
    if (!enabled) {
      return null;
    }

    const headers = {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(options.headers || {})
    };

    if (options.prefer) {
      headers.prefer = options.prefer;
    }

    const response = await fetchImpl(`${url}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Supabase ${options.method || "GET"} ${path} failed: ${response.status} ${text}`);
    }

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function loadRows(table, select = "*") {
    const rows = await request(`/rest/v1/${table}?select=${encodeURIComponent(select)}`);
    return Array.isArray(rows) ? rows : [];
  }

  function payloadRows(rows) {
    return rows.map((row) => asObject(row.payload)).filter(Boolean);
  }

  async function loadSignals() {
    const rows = await loadRows(tables.signals, "symbol,payload");
    return rows.reduce((acc, row) => {
      const payload = asObject(row.payload);
      const symbol = stringOrNull(row.symbol || payload?.symbol);
      if (symbol && payload) {
        acc[symbol] = payload;
      }
      return acc;
    }, {});
  }

  async function loadSchedulerState() {
    const rows = await request(`/rest/v1/${tables.scheduler}?key=eq.default&select=key,value&limit=1`);
    const value = Array.isArray(rows) ? rows[0]?.value : null;
    return asObject(value) || {};
  }

  async function loadAll() {
    if (!enabled) {
      return {
        signalsBySymbol: null,
        subscribers: null,
        notificationQueue: null,
        invoices: null,
        schedulerState: null,
        emailLogs: null
      };
    }

    const [signalsBySymbol, subscriberRows, notificationRows, invoiceRows, schedulerState, emailLogRows] = await Promise.all([
      loadSignals(),
      loadRows(tables.subscribers, "email,payload"),
      loadRows(tables.notifications, "id,payload"),
      loadRows(tables.invoices, "id,payload"),
      loadSchedulerState(),
      loadRows(tables.emailLogs, "id,payload")
    ]);

    return {
      signalsBySymbol,
      subscribers: payloadRows(subscriberRows),
      notificationQueue: payloadRows(notificationRows),
      invoices: payloadRows(invoiceRows),
      schedulerState,
      emailLogs: payloadRows(emailLogRows)
    };
  }

  async function upsert(table, rows) {
    const payload = Array.isArray(rows) ? rows : [rows];
    if (!payload.length) {
      return null;
    }

    return request(`/rest/v1/${table}`, {
      method: "POST",
      body: payload,
      prefer: "resolution=merge-duplicates,return=minimal"
    });
  }

  async function saveSignals(signalsBySymbol = {}) {
    const rows = Object.entries(signalsBySymbol).map(([symbol, signal]) => ({
      symbol,
      action: stringOrNull(signal?.action),
      timeframe: stringOrNull(signal?.timeframe),
      price: numberOrNull(signal?.price),
      received_at: isoOrNull(signal?.receivedAt),
      effective_until: isoOrNull(signal?.effectiveUntil),
      updated_at: new Date().toISOString(),
      payload: signal
    }));

    return upsert(tables.signals, rows);
  }

  async function saveSubscribers(subscribers = []) {
    const rows = subscribers
      .filter((subscriber) => stringOrNull(subscriber?.email))
      .map((subscriber) => ({
        email: String(subscriber.email).trim().toLowerCase(),
        subscriber_id: stringOrNull(subscriber.id),
        plan: stringOrNull(subscriber.plan || "free"),
        locale: stringOrNull(subscriber.locale || "en"),
        interest: stringOrNull(subscriber.interest || "general"),
        watchlist: Array.isArray(subscriber.watchlist) ? subscriber.watchlist : [],
        channels: Array.isArray(subscriber.channels) ? subscriber.channels : ["email"],
        preferences: asObject(subscriber.preferences) || {},
        billing: asObject(subscriber.billing) || {},
        created_at: isoOrNull(subscriber.createdAt),
        updated_at: isoOrNull(subscriber.updatedAt) || new Date().toISOString(),
        payload: subscriber
      }));

    return upsert(tables.subscribers, rows);
  }

  async function saveNotifications(notificationQueue = []) {
    const rows = notificationQueue
      .map((job) => ({
        id: stringOrNull(job?.id),
        status: stringOrNull(job?.status || "pending"),
        type: stringOrNull(job?.type || "signal_alert"),
        scheduled_for: isoOrNull(job?.scheduledFor),
        created_at: isoOrNull(job?.createdAt),
        finished_at: isoOrNull(job?.finishedAt),
        payload: job
      }))
      .filter((row) => row.id);

    return upsert(tables.notifications, rows);
  }

  async function saveInvoices(invoices = []) {
    const rows = invoices
      .map((invoice) => ({
        id: stringOrNull(invoice?.id),
        subscriber_id: stringOrNull(invoice?.subscriberId),
        email: stringOrNull(invoice?.email),
        symbol: stringOrNull(invoice?.symbol),
        currency: stringOrNull(invoice?.currency),
        target_currency: stringOrNull(invoice?.targetCurrency),
        amount: numberOrNull(invoice?.amount),
        due_date: isoOrNull(invoice?.dueDate),
        vendor: stringOrNull(invoice?.vendor),
        created_at: isoOrNull(invoice?.createdAt),
        updated_at: isoOrNull(invoice?.updatedAt) || new Date().toISOString(),
        payload: invoice
      }))
      .filter((row) => row.id);

    return upsert(tables.invoices, rows);
  }

  async function saveSchedulerState(schedulerState = {}) {
    return upsert(tables.scheduler, {
      key: "default",
      value: schedulerState,
      updated_at: new Date().toISOString()
    });
  }

  async function saveEmailLogs(emailLogs = []) {
    const rows = emailLogs
      .map((log) => ({
        id: stringOrNull(log?.id),
        subscriber_id: stringOrNull(log?.subscriber_id || log?.subscriberId),
        email: stringOrNull(log?.email),
        plan: stringOrNull(log?.plan),
        template_type: stringOrNull(log?.template_type || log?.templateType),
        status: stringOrNull(log?.status || "pending"),
        skipped_reason: stringOrNull(log?.skipped_reason || log?.skippedReason),
        error_message: stringOrNull(log?.error_message || log?.errorMessage),
        provider_message_id: stringOrNull(log?.provider_message_id || log?.providerMessageId),
        signal_snapshot_date: stringOrNull(log?.signal_snapshot_date || log?.signalSnapshotDate),
        created_at: isoOrNull(log?.created_at || log?.createdAt) || new Date().toISOString(),
        sent_at: isoOrNull(log?.sent_at || log?.sentAt),
        payload: log
      }))
      .filter((row) => row.id);

    return upsert(tables.emailLogs, rows);
  }

  async function recordStripeEvent(event = {}, result = {}) {
    const id = stringOrNull(event.id);
    if (!id) {
      return null;
    }

    return upsert(tables.stripeEvents, {
      id,
      type: stringOrNull(event.type),
      payload: event,
      result,
      processed_at: new Date().toISOString()
    });
  }

  async function listStripeEvents(limit = 10) {
    const boundedLimit = Math.min(25, Math.max(1, Math.floor(Number(limit) || 10)));
    const rows = await request(
      `/rest/v1/${tables.stripeEvents}?select=id,type,result,processed_at&order=processed_at.desc&limit=${boundedLimit}`
    );

    return Array.isArray(rows) ? rows : [];
  }

  async function listEmailLogs(limit = 25) {
    const boundedLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 25)));
    const rows = await request(
      `/rest/v1/${tables.emailLogs}?select=id,subscriber_id,email,plan,template_type,status,skipped_reason,error_message,provider_message_id,signal_snapshot_date,created_at,sent_at&order=created_at.desc&limit=${boundedLimit}`
    );

    return Array.isArray(rows) ? rows : [];
  }

  return {
    enabled,
    listEmailLogs,
    listStripeEvents,
    loadAll,
    recordStripeEvent,
    saveEmailLogs,
    saveInvoices,
    saveNotifications,
    saveSchedulerState,
    saveSignals,
    saveSubscribers,
    tables
  };
}

module.exports = { createSupabasePersistence };
