export const REFERRAL_THRESHOLD = 3;
export const SPRINT_THRESHOLD = 1;
export const CASH_REWARD = 15;
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function newReferralCode() {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => alphabet[byte % alphabet.length]);
  return "ALIX-" + suffix.join("");
}

export function canEarnReferralReward(scope) {
  return typeof scope === "string" && scope !== "bundle";
}

export async function findReferrer(DB, value, purchaserId) {
  const code = String(value).trim().toUpperCase();
  if (!/^ALIX-[A-Z0-9]{8}$/.test(code)) return null;
  return DB.prepare("SELECT id FROM referral_progress WHERE referral_code = ? AND id <> ?")
    .bind(code, purchaserId).first();
}

export async function referralDetails(DB, code) {
  if (code.reward_for_code_id != null || !canEarnReferralReward(code.access_scope)) return null;

  if (!code.referral_code) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await DB.prepare("UPDATE OR IGNORE access_codes SET referral_code = ? WHERE id = ? AND referral_code IS NULL")
        .bind(newReferralCode(), code.id).run();
      const saved = await DB.prepare("SELECT referral_code FROM access_codes WHERE id = ?").bind(code.id).first();
      if (saved?.referral_code) break;
    }
  }

  const row = await DB.prepare(
    "SELECT referral_code, target_scope, invited, reward_code FROM referral_progress WHERE id = ?"
  ).bind(code.id).first();
  if (!row) throw new Error("Referral profile could not be created.");

  const reward = await DB.prepare(
    "SELECT c.reward_choice, c.cash_paid_at, c.sprint_unlocked, r.qr_at, r.proof_at FROM access_codes c LEFT JOIN referral_cash r ON r.code_id = c.id WHERE c.id = ?"
  ).bind(code.id).first();
  const prefix = row.target_scope === "xiaosimen" ? "xiaosimen_cross" : "accounting_cross";
  const { results } = await DB.prepare("SELECT key, value FROM site_config WHERE key IN (?, ?)")
    .bind(prefix + "_purchase_link", prefix + "_purchase_text").all();
  const offers = new Map(results.map(row => [row.key, row.value]));
  return {
    code: row.referral_code,
    invited: Number(row.invited),
    required: REFERRAL_THRESHOLD,
    target: row.target_scope,
    rewardCode: row.reward_code || "",
    // 邀请成功 1 位，或上传的卷子被作者采用，都永久解锁冲刺卷。
    sprint: Number(row.invited) >= SPRINT_THRESHOLD || Number(reward?.sprint_unlocked) === 1,
    sprintRequired: SPRINT_THRESHOLD,
    rewardChoice: reward?.reward_choice || "",
    cashAmount: CASH_REWARD,
    cashPaid: Boolean(reward?.cash_paid_at),
    cashQr: Boolean(reward?.qr_at),
    cashProof: Boolean(reward?.proof_at),
    offer: {
      link: offers.get(prefix + "_purchase_link") || "",
      text: offers.get(prefix + "_purchase_text") || "",
    },
  };
}

// 邀满 3 位后，买家选择返现或另一个题库；选定后不能再改（站长按选择发放）。
export async function chooseReward(DB, code, choice) {
  if (!["cash", "bank"].includes(choice)) return { ok: false, status: 400, message: "请选择返现或题库。" };
  const details = await referralDetails(DB, code);
  if (!details) return { ok: false, status: 403, message: "这个兑换码不参加邀请奖励。" };
  if (details.invited < REFERRAL_THRESHOLD) return { ok: false, status: 409, message: `还差 ${REFERRAL_THRESHOLD - details.invited} 位朋友。` };
  if (details.rewardCode || details.rewardChoice) return { ok: true, referral: details };
  await DB.prepare("UPDATE access_codes SET reward_choice = ?, reward_choice_at = ? WHERE id = ? AND reward_choice IS NULL")
    .bind(choice, new Date().toISOString(), code.id).run();
  return { ok: true, referral: await referralDetails(DB, code) };
}

// 收款码 / 转账截图：浏览器先压缩成 webp/jpeg/png 的 data URL，再存进 D1。
export const MAX_IMAGE_CHARS = 900000;
export function validImage(value) {
  const text = String(value || "");
  return text.length <= MAX_IMAGE_CHARS && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(text) ? text : "";
}

export async function saveCashQr(DB, code, image) {
  const details = await referralDetails(DB, code);
  if (!details || details.rewardChoice !== "cash" || details.invited < REFERRAL_THRESHOLD) {
    return { ok: false, status: 409, message: "选择返现后才能上传收款码。" };
  }
  if (details.cashPaid) return { ok: false, status: 409, message: "返现已经完成。" };
  const data = validImage(image);
  if (!data) return { ok: false, status: 400, message: "图片无效或太大，请换一张截图。" };
  await DB.prepare(
    "INSERT INTO referral_cash (code_id, qr_image, qr_at) VALUES (?, ?, ?) " +
    "ON CONFLICT(code_id) DO UPDATE SET qr_image = excluded.qr_image, qr_at = excluded.qr_at"
  ).bind(code.id, data, new Date().toISOString()).run();
  return { ok: true, referral: await referralDetails(DB, code) };
}

export async function cashImage(DB, codeId, kind) {
  const column = kind === "proof" ? "proof_image" : "qr_image";
  const row = await DB.prepare(`SELECT ${column} AS image FROM referral_cash WHERE code_id = ?`).bind(codeId).first();
  return row?.image || "";
}
