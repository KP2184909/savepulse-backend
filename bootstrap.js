"use strict";

const path = require("node:path");
const { hydrateJsonFilesFromSupabase, installSupabaseJsonMirror } = require("./src/supabaseJsonMirror");

const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || "state");

async function boot() {
  try {
    const result = await hydrateJsonFilesFromSupabase({ dataDir: DATA_DIR });
    if (result.enabled) {
      console.log(`Supabase state bootstrap completed (${result.source}).`);
    }
  } catch (error) {
    console.warn(`Supabase state bootstrap failed; continuing with local JSON state: ${error.message}`);
  }

  installSupabaseJsonMirror({ dataDir: DATA_DIR });
  require("./serverRuntime");
}

boot().catch((error) => {
  console.error(`SavePulse boot failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
