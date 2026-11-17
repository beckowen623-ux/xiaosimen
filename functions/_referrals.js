export const REFERRAL_THRESHOLD = 3;
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
    offer: {
      link: offers.get(prefix + "_purchase_link") || "",
      text: offers.get(prefix + "_purchase_text") || "",
    },
  };
}
