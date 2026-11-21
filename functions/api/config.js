import { json } from "./_stats.js";

// 整卷计时的考试时长（分钟），后台“整卷计时”里改，存在 site_config.exam_minutes。
// kz = 考证题库，x4m = 中考题库；只收 10～300 的整数，其余忽略（页面用自己的默认值）。
export const EXAM_MINUTE_KEYS = {
  kz: ["junior_shiwu", "junior_jingjifa", "mid_shiwu", "mid_caiguan", "mid_jingjifa", "mid_mock_objective", "audit"],
  x4m: ["sync", "eb_chinese", "eb_math", "eb_english", "eb_physics", "eb_chemistry", "eb_other", "paper_chinese", "paper_math", "paper_english", "paper_physics", "paper_chemistry"],
};

export function parseExamMinutes(value) {
  let data = {};
  try {
    data = JSON.parse(value || "{}") || {};
  } catch {
    data = {};
  }
  const out = { kz: {}, x4m: {} };
  for (const site of Object.keys(EXAM_MINUTE_KEYS)) {
    for (const key of EXAM_MINUTE_KEYS[site]) {
      const n = Number(data?.[site]?.[key]);
      if (Number.isInteger(n) && n >= 10 && n <= 300) out[site][key] = n;
    }
  }
  return out;
}


export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false }, 503);
  try {
    const { results } = await env.DB.prepare(
      "SELECT key, value FROM site_config WHERE key IN (?, ?, ?, ?, ?)"
    ).bind("xiaosimen_purchase_link", "xiaosimen_purchase_text", "bundle_purchase_link", "bundle_purchase_text", "exam_minutes").all();
    const config = new Map(results.map(({ key, value }) => [key, value]));
    return json({
      ok: true,
      xiaosimen: { link: config.get("xiaosimen_purchase_link") || "", text: config.get("xiaosimen_purchase_text") || "" },
      bundle: { link: config.get("bundle_purchase_link") || "", text: config.get("bundle_purchase_text") || "" },
      examMinutes: parseExamMinutes(config.get("exam_minutes")).x4m,
    });
  } catch {
    return json({ ok: false }, 503);
  }
}
