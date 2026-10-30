const edge = "https://sktzydyiwqylpstxjicf.supabase.co/functions/v1/savepulse-billing-sandbox";
const operations = new Set(["catalog", "status", "checkout", "portal", "profile", "tax-document", "readiness"]);
export default async (request, context) => {
  if (context.deploy.context !== "deploy-preview" || context.site.id !== "ddc6313e-a711-4a4f-be1f-46887301fd80") return Response.json({ error: "not_found" }, { status: 404 });
  const operation = new URL(request.url).pathname.split("/").filter(Boolean).at(-1);
  if (!operations.has(operation) || !["GET", "POST"].includes(request.method)) return Response.json({ error: "not_found" }, { status: 404 });
  const raw = request.method === "POST" ? await request.text() : undefined;
  if (raw && raw.length > 2048) return Response.json({ error: "request_too_large" }, { status: 413 });
  try {
    const response = await fetch(`${edge}/${operation}`, { method: request.method, headers: { "content-type": "application/json", authorization: request.headers.get("authorization") || "" }, body: raw, signal: AbortSignal.timeout(25000) });
    return new Response(await response.text(), { status: response.status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (_) { return Response.json({ error: "billing_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } }); }
};
export const config = { path: "/sandbox-billing/*", rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 30 } };
