import { TRACK_EVENTS, bump, chinaDay, json, normalizeSource } from "./_stats.js";

// Anonymous, aggregate-only counters: no IPs or identifiers are stored.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false }, 500);
  if (!(request.headers.get("content-type") || "").includes("application/json")) return json({ ok: false }, 415);
  const body = await request.json().catch(() => ({}));
  const event = String(body.event || "");
  if (!TRACK_EVENTS.has(event)) return json({ ok: false, message: "Unknown event." }, 400);
  try {
    await bump(env.DB, chinaDay(), "xiaosimen-" + normalizeSource(body.source), event);
  } catch {
    return json({ ok: false }, 500);
  }
  return json({ ok: true });
}
