// Shared helpers for traffic statistics (files starting with "_" are not routes).
export const TRACK_EVENTS = new Set([
  "visit",
  "purchase_view",
  "trial_done",
  "cross_click",
  "free_print",
  "free_phone",
  "daily_answer",
  "daily_correct",
  "daily_share",
  "daily_answer_junior",
  "daily_correct_junior",
  "earlybird_done",
  "earlybird_75",
  "xsc_done",
  "xsc_75",
]);

export function normalizeSource(value) {
  const source = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
  return source || "direct";
}

export function chinaDay(offsetDays = 0, now = Date.now()) {
  const shifted = new Date(now + 8 * 60 * 60 * 1000 - offsetDays * 24 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function chinaDayStartIso(offsetDays = 0, now = Date.now()) {
  return new Date(Date.parse(`${chinaDay(offsetDays, now)}T00:00:00Z`) - 8 * 60 * 60 * 1000).toISOString();
}

export async function bump(DB, day, source, event) {
  await DB.prepare(
    `INSERT INTO daily_stats (day, source, event, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(day, source, event) DO UPDATE SET count = count + 1`
  ).bind(day, source, event).run();
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
