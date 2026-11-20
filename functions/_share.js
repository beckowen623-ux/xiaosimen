// 分享得 5 元（两个题库共用，文件内容保持一致）。
// 每个浏览器一个专属分享链接 ?s=<id>；3 位不同的人（网络、设备都不同，且不是分享者自己）打开后解锁 6 位分享验证码。
// 只存哈希后的网络和设备标识，不存 IP。站长在 tinawin.cc.cd/admin 输入验证码核对并标记已使用。
export const SHARE_REQUIRED = 3;
const ID_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const DEVICE_RE = /^[a-z0-9-]{16,64}$/i;
const ID_RE = /^[A-Z2-9]{8}$/;

export async function handleShare(context, site) {
  const { request, env } = context;
  const path = new URL(request.url).pathname;
  if (request.method !== "POST") return json({ ok: false }, 405);
  if (!env.DB) return json({ ok: false, reason: "UNAVAILABLE" }, 503);
  const body = await request.json().catch(() => ({}));
  const device = String(body.device || "");
  if (!DEVICE_RE.test(device)) return json({ ok: false, message: "BAD_DEVICE" }, 400);
  const dev = await sha256(`share-device:${device}`);
  const net = await sha256(`share-net:${networkKey(request)}`);
  if (path === "/api/share/me") return mine(env.DB, site, dev, net);
  if (path === "/api/share/open") return open(env.DB, String(body.s || "").toUpperCase(), dev, net);
  return json({ ok: false }, 404);
}

async function mine(DB, site, dev, net) {
  let row = await DB.prepare("SELECT * FROM share_offers WHERE site = ? AND owner_device = ?").bind(site, dev).first();
  for (let attempt = 0; !row && attempt < 5; attempt += 1) {
    const id = randomText(8);
    const code = randomText(6);
    const now = new Date().toISOString();
    await DB.prepare("INSERT OR IGNORE INTO share_offers (id, site, owner_device, owner_net, verify_code, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, site, dev, net, code, now).run();
    row = await DB.prepare("SELECT * FROM share_offers WHERE site = ? AND owner_device = ?").bind(site, dev).first();
  }
  if (!row) return json({ ok: false, reason: "UNAVAILABLE" }, 503);
  const unlocked = Boolean(row.unlocked_at);
  return json({ ok: true, id: row.id, opens: Math.min(row.opens, SHARE_REQUIRED), required: SHARE_REQUIRED, unlocked,
    verifyCode: unlocked ? row.verify_code : "", used: Boolean(row.used_at) });
}

async function open(DB, id, dev, net) {
  if (!ID_RE.test(id)) return json({ ok: true, counted: false });
  const row = await DB.prepare("SELECT id, owner_device, owner_net, opens FROM share_offers WHERE id = ?").bind(id).first();
  // 分享者自己打开（同设备或同网络）不算
  if (!row || row.owner_device === dev || row.owner_net === net || row.opens >= 50) return json({ ok: true, counted: false });
  const result = await DB.prepare("INSERT OR IGNORE INTO share_opens (share_id, net_hash, device_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, net, dev, new Date().toISOString()).run();
  if (!result.meta?.changes) return json({ ok: true, counted: false });
  await DB.prepare("UPDATE share_offers SET opens = opens + 1, unlocked_at = CASE WHEN unlocked_at IS NULL AND opens + 1 >= ? THEN ? ELSE unlocked_at END WHERE id = ?")
    .bind(SHARE_REQUIRED, new Date().toISOString(), id).run();
  return json({ ok: true, counted: true });
}

// IPv6 取前 64 位（同一家庭宽带下的设备算同一个网络）
function networkKey(request) {
  const ip = request.headers.get("cf-connecting-ip") || "";
  if (ip.includes(":")) return ip.split(":").slice(0, 4).join(":");
  return ip;
}

function randomText(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join("");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
