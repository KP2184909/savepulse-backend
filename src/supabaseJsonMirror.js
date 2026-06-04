"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createSupabasePersistence } = require("./persistence");

const STATE_FILES = {
  signals: "signals.json",
  subscribers: "subscribers.json",
  notifications: "notifications.json",
  invoices: "invoices.json",
  scheduler: "scheduler.json"
};

function statePaths(dataDir) {
  return Object.fromEntries(
    Object.entries(STATE_FILES).map(([key, file]) => [key, path.resolve(dataDir, file)])
  );
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function snapshotHasData(snapshot) {
  return Boolean(
    Object.keys(snapshot?.signalsBySymbol || {}).length ||
      (snapshot?.subscribers || []).length ||
      (snapshot?.notificationQueue || []).length ||
      (snapshot?.invoices || []).length ||
      Object.keys(snapshot?.schedulerState || {}).length
  );
}

function loadLocalSnapshot(paths) {
  return {
    signalsBySymbol: readJson(paths.signals, {}),
    subscribers: readJson(paths.subscribers, []),
    notificationQueue: readJson(paths.notifications, []),
    invoices: readJson(paths.invoices, []),
    schedulerState: readJson(paths.scheduler, {})
  };
}

async function seedSupabaseFromSnapshot(persistence, snapshot) {
  await Promise.all([
    persistence.saveSignals(snapshot.signalsBySymbol || {}),
    persistence.saveSubscribers(snapshot.subscribers || []),
    persistence.saveNotifications(snapshot.notificationQueue || []),
    persistence.saveInvoices(snapshot.invoices || []),
    persistence.saveSchedulerState(snapshot.schedulerState || {})
  ]);
}

async function hydrateJsonFilesFromSupabase({ dataDir, persistence = createSupabasePersistence() } = {}) {
  if (!persistence.enabled) {
    return { enabled: false };
  }

  const paths = statePaths(dataDir || path.resolve(__dirname, "..", "state"));
  fs.mkdirSync(path.dirname(paths.signals), { recursive: true });

  const remoteSnapshot = await persistence.loadAll();
  if (snapshotHasData(remoteSnapshot)) {
    writeJson(paths.signals, remoteSnapshot.signalsBySymbol || {});
    writeJson(paths.subscribers, remoteSnapshot.subscribers || []);
    writeJson(paths.notifications, remoteSnapshot.notificationQueue || []);
    writeJson(paths.invoices, remoteSnapshot.invoices || []);
    writeJson(paths.scheduler, remoteSnapshot.schedulerState || {});
    return { enabled: true, source: "supabase" };
  }

  const localSnapshot = loadLocalSnapshot(paths);
  if (snapshotHasData(localSnapshot)) {
    await seedSupabaseFromSnapshot(persistence, localSnapshot);
    return { enabled: true, source: "local_seed" };
  }

  return { enabled: true, source: "empty" };
}

function parseWrittenJson(value) {
  try {
    if (Buffer.isBuffer(value)) {
      return JSON.parse(value.toString("utf8"));
    }

    if (typeof value === "string") {
      return JSON.parse(value);
    }
  } catch (error) {
    return undefined;
  }

  return undefined;
}

function saveMirroredState(persistence, kind, value) {
  if (kind === "signals") {
    return persistence.saveSignals(value || {});
  }
  if (kind === "subscribers") {
    return persistence.saveSubscribers(Array.isArray(value) ? value : []);
  }
  if (kind === "notifications") {
    return persistence.saveNotifications(Array.isArray(value) ? value : []);
  }
  if (kind === "invoices") {
    return persistence.saveInvoices(Array.isArray(value) ? value : []);
  }
  if (kind === "scheduler") {
    return persistence.saveSchedulerState(value || {});
  }
  return Promise.resolve(null);
}

function installSupabaseJsonMirror({ dataDir, persistence = createSupabasePersistence() } = {}) {
  if (!persistence.enabled) {
    return { enabled: false };
  }

  if (fs.__savepulseSupabaseJsonMirrorInstalled) {
    return { enabled: true, alreadyInstalled: true };
  }

  const paths = statePaths(dataDir || path.resolve(__dirname, "..", "state"));
  const kindByPath = new Map(Object.entries(paths).map(([kind, filePath]) => [filePath, kind]));
  const originalWriteFileSync = fs.writeFileSync;

  fs.writeFileSync = function patchedWriteFileSync(filePath, data, ...args) {
    const result = originalWriteFileSync.call(this, filePath, data, ...args);
    const resolvedPath = path.resolve(String(filePath));
    const kind = kindByPath.get(resolvedPath);

    if (kind) {
      const parsed = parseWrittenJson(data) ?? readJson(resolvedPath, kind === "signals" || kind === "scheduler" ? {} : []);
      saveMirroredState(persistence, kind, parsed).catch((error) => {
        console.warn(`Supabase mirror sync failed for ${kind}: ${error.message}`);
      });
    }

    return result;
  };

  fs.__savepulseSupabaseJsonMirrorInstalled = true;
  return { enabled: true };
}

module.exports = {
  hydrateJsonFilesFromSupabase,
  installSupabaseJsonMirror,
  statePaths
};
