import { validateSignal, signalView } from "./validator.mjs";
const rules = {
  versions: Object.fromEntries(
    ["CS11!", "CS21!", "CS31!", "CS41!", "CS51!", "CS61!", "BDI", "ZIM"].map(
      (s) => [
        s,
        s.startsWith("CS")
          ? [
              "freightpulse.container.next4.transport.v3",
              "freightpulse.container.next4.transport.v4",
            ]
          : s === "BDI" ? ["freightpulse.context.telemetry.v1", "freightpulse.bulk.next4.transport.v1"] : ["freightpulse.context.telemetry.v1"],
      ],
    ),
  ),
};
const response = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
const digest = async (text) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
function equalHash(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export function createHandler(env, fetcher = fetch, now = Date.now) {
  const url = env.get("SUPABASE_URL"),
    key = env.get("SUPABASE_SERVICE_ROLE_KEY");
  async function db(path, body) {
    const r = await fetcher(`${url}/rest/v1/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(2200),
    });
    if (!r.ok) throw Error("sandbox_storage_unavailable");
    return r.json();
  }
  return async (req) => {
    if (req.method === "GET")
      return response(200, {
        service: "freightpulse-tv-sandbox",
        mode: "test",
        customerNotifications: false,
        liveSales: false,
        sourceFreshness: "unknown",
        receiptIsNotCurrentSignal: true,
      });
    if (req.method !== "POST") return response(405, { error: "post_required" });
    try {
      const declared = Number(req.headers.get("content-length") || 0);
      if (declared > 16384)
        return response(413, { error: "payload_too_large" });
      // Bound the actual streamed bytes too, even if Content-Length is missing/incorrect.
      const reader = req.body?.getReader();
      let chunks = [],
        size = 0;
      if (reader)
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 16384) {
            await reader.cancel();
            return response(413, { error: "payload_too_large" });
          }
          chunks.push(part.value);
        }
      const all = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        all.set(c, offset);
        offset += c.byteLength;
      }
      let body;
      try {
        body = JSON.parse(new TextDecoder().decode(all));
      } catch {
        return response(400, { error: "invalid_json" });
      }
      if (
        !body ||
        Array.isArray(body) ||
        typeof body !== "object" ||
        typeof body.secret_key !== "string" ||
        !/^[A-Za-z0-9_-]{24,128}$/.test(body.secret_key)
      )
        return response(401, { error: "unauthorized" });
      const config = (
        await db(
          "freightpulse_sandbox_config?id=eq.receiver&select=token_hash,enabled",
        )
      )[0];
      if (!config?.enabled)
        return response(503, { error: "sandbox_receiver_disabled" });
      if (!equalHash(await digest(body.secret_key), config.token_hash))
        return response(401, { error: "unauthorized" });
      if (
        Object.keys(body).some((k) => !["secret_key", "payload"].includes(k)) ||
        body.payload?.dataMode !== "test"
      )
        return response(422, { error: "test_envelope_required" });
      const signal = validateSignal(body.payload, now(), rules);
      // Canonical identity deliberately excludes eventId, never includes credentials.
      const canonical = { ...signal };
      delete canonical.eventId;
      const result = await db("rpc/freightpulse_sandbox_ingest", {
        p_payload: signal,
        p_fingerprint: await digest(JSON.stringify(canonical)),
      });
      if (result.error)
        return response(result.error === "sandbox_rate_limited" ? 429 : 409, {
          error: result.error,
        });
      const view = signalView(signal, now(), undefined);
      return response(200, {
        ...result,
        mode: "test",
        symbol: signal.symbol,
        current: false,
        dataStatus: view.dataStatus,
        customerNotifications: false,
      });
    } catch (e) {
      const code = e?.status ? e.message : "sandbox_storage_unavailable";
      return response(e?.status || 503, { error: code });
    }
  };
}
if (typeof Deno !== "undefined") Deno.serve(createHandler(Deno.env));
