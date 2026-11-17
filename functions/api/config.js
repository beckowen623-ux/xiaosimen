import { json } from "./_stats.js";

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false }, 503);
  try {
    const { results } = await env.DB.prepare(
      "SELECT key, value FROM site_config WHERE key IN (?, ?, ?, ?)"
    ).bind("xiaosimen_purchase_link", "xiaosimen_purchase_text", "bundle_purchase_link", "bundle_purchase_text").all();
    const config = new Map(results.map(({ key, value }) => [key, value]));
    return json({
      ok: true,
      xiaosimen: { link: config.get("xiaosimen_purchase_link") || "", text: config.get("xiaosimen_purchase_text") || "" },
      bundle: { link: config.get("bundle_purchase_link") || "", text: config.get("bundle_purchase_text") || "" },
    });
  } catch {
    return json({ ok: false }, 503);
  }
}
