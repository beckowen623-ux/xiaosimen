import { cashImage, chooseReward, findReferrer, referralDetails, saveCashQr } from "./_referrals.js";
import { SPRINT_PAPERS } from "./_sprint.js";
import { handleShare } from "./_share.js";
import { handleUpload, listMyUploads } from "./_uploads.js";

const COOKIE_NAME = "xiaosimen_access";
const SITE = "xiaosimen";
const PRODUCT_SCOPES = ["xiaosimen", "bundle"];
const scopeParams = PRODUCT_SCOPES.map(() => "?").join(", ");
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const HASH_PREFIX = "sha256:";
const FULL_SCOPE = "full";
const MAX_DEVICES = 2;
const PUBLIC_API_PATHS = new Set(["/api/access/redeem", "/api/access/status", "/api/access/referral",
  "/api/access/reward-choice", "/api/access/sprint", "/api/access/sprint-preview", "/api/access/cash-qr", "/api/access/cash-proof", "/api/access/friend-offer", "/api/access/upload", "/api/access/my-uploads",
  "/api/access/free-status", "/api/access/free-use"]);
const MAX_REDEEM_FAILURES = 20;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.pathname.startsWith("/api/share/")) return handleShare(context, SITE);
  if (!PUBLIC_API_PATHS.has(url.pathname)) return context.next();

  try {
    if (url.pathname === "/api/access/redeem") return await redeem(context);
    if (url.pathname === "/api/access/referral") return await accessReferral(context);
    if (url.pathname === "/api/access/reward-choice") return await rewardChoice(context);
    if (url.pathname === "/api/access/sprint") return await sprintPapers(context);
    if (url.pathname === "/api/access/sprint-preview") return sprintPreview();
    if (url.pathname === "/api/access/cash-qr") return await cashQr(context);
    if (url.pathname === "/api/access/cash-proof") return await cashProof(context);
    if (url.pathname === "/api/access/friend-offer") return await friendOffer(context);
    if (url.pathname === "/api/access/free-status") return await freeStatus(context);
    if (url.pathname === "/api/access/free-use") return await freeUse(context);
    if (url.pathname === "/api/access/upload" || url.pathname === "/api/access/my-uploads") {
      if (!context.env.DB) return json({ ok: false, reason: "UNAVAILABLE" }, 503);
      const row = await accessSession(context);
      if (!row) return json({ ok: false, reason: "UNAUTHENTICATED", message: "购买并解锁题库后才能上传。" }, 401);
      return url.pathname === "/api/access/upload" ? await handleUpload(context, row, SITE) : await listMyUploads(context, row);
    }
    return await accessStatus(context);
  } catch (error) {
    console.error("Access database request failed", SITE, error.message);
    return json({ ok: false, reason: "UNAVAILABLE", message: "Access service unavailable." }, 503);
  }
}

// ---- 免费整卷：每个网络打印 1 次整卷、手机做 1 套整卷；同一套可反复用 ----
const FREE_KINDS = new Set(["print", "phone"]);
async function networkHash(request) {
  let ip = request.headers.get("CF-Connecting-IP") || "";
  if (ip.includes(":")) ip = ip.split(":").slice(0, 4).join(":"); // IPv6 按 /64 网段算，避免换地址重复领
  return ip ? await sha256("x4m-free-v1|" + ip) : "";
}
function deviceKey(body) {
  const id = String(body?.deviceId || "");
  return /^[A-Za-z0-9_-]{16,64}$/.test(id) ? id : "";
}
async function deviceHash(body) {
  const id = deviceKey(body);
  return id ? await sha256("x4m-device-v1|" + id) : "";
}
// 网络和设备两份记录合在一起看：任一处用过，就算用过（先领的那一套为准）。
async function freeRows(env, net, dev) {
  const out = { print: null, phone: null };
  const take = rows => {
    for (const row of rows || []) if (!out[row.kind]) out[row.kind] = { paperId: row.paper_id, title: row.paper_title || "" };
  };
  if (dev) {
    const { results } = await env.DB.prepare(
      "SELECT kind, paper_id, paper_title FROM free_paper_devices WHERE device_hash = ? AND site = ? ORDER BY created_at",
    ).bind(dev, SITE).all();
    take(results);
  }
  if (net) {
    const { results } = await env.DB.prepare(
      "SELECT kind, paper_id, paper_title FROM free_paper_uses WHERE net_hash = ? AND site = ? ORDER BY created_at",
    ).bind(net, SITE).all();
    take(results);
  }
  return out;
}
async function freeStatus({ request, env }) {
  if (request.method !== "POST") return json({ ok: false }, 405);
  if (!env.DB) return json({ ok: false, reason: "UNAVAILABLE" }, 503);
  const body = await request.json().catch(() => ({}));
  const net = await networkHash(request);
  const dev = await deviceHash(body);
  return json({ ok: true, free: await freeRows(env, net, dev) });
}
async function freeUse({ request, env }) {
  if (request.method !== "POST") return json({ ok: false }, 405);
  if (!env.DB) return json({ ok: false, reason: "UNAVAILABLE" }, 503);
  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind || "");
  const paperId = String(body.paperId || "").slice(0, 120);
  const title = String(body.title || "").slice(0, 80);
  if (!FREE_KINDS.has(kind) || !/^[\w.:-]{3,120}$/.test(paperId)) return json({ ok: false, reason: "INVALID" }, 400);
  const net = await networkHash(request);
  const dev = await deviceHash(body);
  if (!net && !dev) return json({ ok: false, reason: "UNAVAILABLE" }, 503);
  const before = await freeRows(env, net, dev);
  if (before[kind] && before[kind].paperId !== paperId) return json({ ok: false, reason: "USED", free: before }, 409);
  const now = new Date().toISOString();
  if (net) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO free_paper_uses (net_hash, site, kind, paper_id, paper_title, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(net, SITE, kind, paperId, title, now).run();
  }
  if (dev) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO free_paper_devices (device_hash, site, kind, paper_id, paper_title, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(dev, SITE, kind, paperId, title, now).run();
  }
  const free = await freeRows(env, net, dev);
  if (free[kind] && free[kind].paperId !== paperId) return json({ ok: false, reason: "USED", free }, 409);
  return json({ ok: true, free });
}

async function redeem({ request, env }) {
  if (request.method !== "POST") return json({ ok: false, message: "METHOD_NOT_ALLOWED" }, 405);
  if (!env.DB) return json({ ok: false, reason: "UNAVAILABLE", message: "Access service unavailable." }, 503);

  let code = "";
  let source = "";
  let referralCode = "";
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    code = body?.code || "";
    source = body?.source || "";
    referralCode = body?.referralCode || "";
  } else {
    const form = await request.formData().catch(() => new FormData());
    code = form.get("code") || "";
    referralCode = form.get("referralCode") || "";
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const since = new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();
  const failures = await env.DB.prepare("SELECT COUNT(*) AS n FROM redeem_failures WHERE ip = ? AND failed_at > ?")
    .bind(ip, since).first();
  if (Number(failures?.n || 0) >= MAX_REDEEM_FAILURES) {
    return json({ ok: false, reason: "RATE_LIMITED", message: "Too many attempts. Please try again later." }, 429);
  }

  const normalizedCode = normalizeCode(code);
  if (!normalizedCode || normalizedCode.length > 64) {
    return json({ ok: false, reason: "INVALID_CODE", message: "Please enter a valid access code." }, 400);
  }

  const codeRow = await env.DB.prepare(
    "SELECT id, used_at, reward_for_code_id, friend_price FROM access_codes WHERE code_hash = ? AND access_scope IN (" + scopeParams + ") LIMIT 1"
  ).bind(await sha256(normalizedCode), ...PRODUCT_SCOPES).first();
  if (!codeRow) {
    await env.DB.prepare("INSERT INTO redeem_failures (ip, failed_at) VALUES (?, ?)").bind(ip, new Date().toISOString()).run();
    return json({ ok: false, reason: "INVALID_CODE", message: "Access code could not be redeemed." }, 403);
  }

  // Re-entering the same code in an unlocked browser keeps its device slot.
  const existingToken = readCookie(request.headers.get("Cookie") || "", COOKIE_NAME);
  if (existingToken) {
    const existing = await env.DB.prepare(
      "SELECT 1 AS ok FROM access_sessions WHERE session_token_hash = ? AND code_id = ? AND site = ? LIMIT 1"
    ).bind(await sha256(existingToken), codeRow.id, SITE).first();
    if (existing) return json(await redemptionPayload(env.DB, codeRow.id));
  }

  let referrer = null;
  // 好友价码首次兑换必须带邀请码（页面会自动带上从邀请链接记住的码）。
  if (codeRow.used_at == null && Number(codeRow.friend_price) === 1 && !String(referralCode).trim()) {
    return json({ ok: false, reason: "REFERRAL_REQUIRED" }, 400);
  }
  if (codeRow.used_at == null && codeRow.reward_for_code_id == null && String(referralCode).trim()) {
    referrer = await findReferrer(env.DB, referralCode, codeRow.id);
    if (!referrer) return json({ ok: false, reason: "INVALID_REFERRAL" }, 400);
  }

  const sessionToken = createToken();
  const sessionHash = await sha256(sessionToken);
  const now = new Date().toISOString();
  const userAgent = (request.headers.get("User-Agent") || "").slice(0, 500);

  // Claim a site-specific slot and record first use in one transaction.
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO access_sessions (code_id, session_token_hash, created_at, ip, user_agent, site) " +
      "SELECT id, ?, ?, ?, ?, ? FROM access_codes WHERE id = ? AND access_scope IN (" + scopeParams + ") " +
      "AND (SELECT COUNT(*) FROM access_sessions WHERE code_id = access_codes.id AND site = ?) < COALESCE(access_codes.max_devices, ?)"
    ).bind(sessionHash, now, ip, userAgent, SITE, codeRow.id, ...PRODUCT_SCOPES, SITE, MAX_DEVICES),
    env.DB.prepare(
      "UPDATE access_codes SET used_at = ?, used_ip = ?, used_user_agent = ?, session_token_hash = ?, " +
      "session_created_at = ?, redeem_source = ?, referred_by = ? WHERE id = ? AND used_at IS NULL " +
      "AND EXISTS (SELECT 1 FROM access_sessions WHERE code_id = access_codes.id AND session_token_hash = ?)"
    ).bind(now, ip, userAgent, sessionHash, now, "xiaosimen-" + normalizeSource(source), referrer?.id ?? null, codeRow.id, sessionHash),
  ]);
  if (inserted?.meta?.changes !== 1) {
    const limit = await env.DB.prepare("SELECT COALESCE(max_devices, ?) AS n FROM access_codes WHERE id = ?").bind(MAX_DEVICES, codeRow.id).first();
    return json({ ok: false, reason: "DEVICE_LIMIT", maxDevices: Number(limit?.n || MAX_DEVICES), message: "Access code device limit reached." }, 403);
  }

  const response = json(await redemptionPayload(env.DB, codeRow.id));
  response.headers.set("Set-Cookie", buildCookie(sessionToken));
  return response;
}

async function accessStatus(context) {
  if (!context.env.DB) return json({ ok: false, reason: "UNAVAILABLE" }, 503);
  const row = await accessSession(context);
  return json({ ok: true, authenticated: Boolean(row), scope: row ? normalizeScope() : null });
}

async function accessReferral(context) {
  if (context.request.method !== "POST") return json({ ok: false }, 405);
  if (!context.env.DB) return json({ ok: false, reason: "UNAVAILABLE" }, 503);
  const row = await accessSession(context);
  if (!row) return json({ ok: false, reason: "UNAUTHENTICATED" }, 401);
  return json({ ok: true, referral: await referralDetails(context.env.DB, row) });
}

async function rewardChoice(context) {
  if (context.request.method !== "POST") return json({ ok: false }, 405);
  if (!context.env.DB) return json({ ok: false, reason: "UNAVAILABLE" }, 503);
  if (!(context.request.headers.get("content-type") || "").includes("application/json")) return json({ ok: false }, 415);
  const row = await accessSession(context);
  if (!row) return json({ ok: false, reason: "UNAUTHENTICATED" }, 401);
  const body = await context.request.json().catch(() => ({}));
  const result = await chooseReward(context.env.DB, row, String(body?.choice || ""));
  if (!result.ok) return json({ ok: false, message: result.message }, result.status);
  return json({ ok: true, referral: result.referral });
}

// 邀请奖励：冲刺卷只发给已解锁、且至少成功邀请 1 位朋友的买家，不放在公开静态文件里。
async function sprintPapers(context) {
  if (context.request.method !== "POST") return json({ ok: false }, 405);
  if (!context.env.DB) return json({ ok: false, reason: "UNAVAILABLE" }, 503);
  const row = await accessSession(context);
  if (!row) return json({ ok: false, reason: "UNAUTHENTICATED" }, 401);
  if (Number(row.sprint_unlocked) !== 1) {
    const referral = await referralDetails(context.env.DB, row);
    if (!referral?.sprint) return json({ ok: false, reason: "LOCKED", required: referral?.sprintRequired || 1 }, 403);
  }
  return json({ ok: true, papers: SPRINT_PAPERS });
}

// 样题：每一套都给 5 道（尽量覆盖不同出处，再带上 变式题），所有人都能看。
function previewItems(paper) {
  const all = paper.sections.flatMap(section => section.items.filter(item => item.type === "choice" || item.type === "judge"));
  const fresh = all.filter(item => /变式/.test(item.tag || ""));
  const picked = [];
  const seen = new Set();
  const year = item => Number(String(item.tag || "").match(/20\d\d/)?.[0] || 0);
  for (const item of [...all].sort((a, b) => year(b) - year(a))) {
    if (picked.length >= 3) break;
    if (/变式/.test(item.tag || "") || seen.has(item.tag)) continue;
    seen.add(item.tag);
    picked.push(item);
  }
  for (const item of [...fresh, ...all]) {
    if (picked.length >= 5) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked;
}
const PREVIEW = SPRINT_PAPERS.map(paper => ({ ...paper, preview: true,
  sections: [{ title: "样题（5 题）", note: "选完立刻判对错、看解析。", items: previewItems(paper) }] }));
function sprintPreview() {
  return json({ ok: true, preview: true, total: SPRINT_PAPERS.length, papers: PREVIEW });
}

async function cashQr(context) {
  if (context.request.method !== "POST") return json({ ok: false }, 405);
  if (!(context.request.headers.get("content-type") || "").includes("application/json")) return json({ ok: false }, 415);
  const row = await accessSession(context);
  if (!row) return json({ ok: false, reason: "UNAUTHENTICATED" }, 401);
  const body = await context.request.json().catch(() => ({}));
  const result = await saveCashQr(context.env.DB, row, body?.image);
  if (!result.ok) return json({ ok: false, message: result.message }, result.status);
  return json({ ok: true, referral: result.referral });
}

// 好友专享价商品入口（后台“闲鱼购买设置”里填写），只给通过邀请链接进来的访客展示。
async function friendOffer({ env }) {
  if (!env.DB) return json({ ok: false }, 503);
  const prefix = SITE === "xiaosimen" ? "xiaosimen_friend" : "accounting_friend";
  const { results } = await env.DB.prepare("SELECT key, value FROM site_config WHERE key IN (?, ?)")
    .bind(prefix + "_purchase_link", prefix + "_purchase_text").all();
  const values = new Map((results || []).map(row => [row.key, row.value]));
  return json({ ok: true, link: values.get(prefix + "_purchase_link") || "", text: values.get(prefix + "_purchase_text") || "" });
}

async function cashProof(context) {
  if (context.request.method !== "POST") return json({ ok: false }, 405);
  const row = await accessSession(context);
  if (!row) return json({ ok: false, reason: "UNAUTHENTICATED" }, 401);
  const image = await cashImage(context.env.DB, row.id, "proof");
  if (!image) return json({ ok: false, reason: "NOT_READY" }, 404);
  return json({ ok: true, image });
}

async function accessSession({ request, env }) {
  const token = readCookie(request.headers.get("Cookie") || "", COOKIE_NAME);
  if (!token) return null;
  return env.DB.prepare(
    "SELECT c.id, c.access_scope, c.referral_code, c.reward_for_code_id, c.sprint_unlocked FROM access_sessions s " +
    "JOIN access_codes c ON c.id = s.code_id WHERE s.session_token_hash = ? AND s.site = ? " +
    "AND c.used_at IS NOT NULL AND c.access_scope IN (" + scopeParams + ") LIMIT 1"
  ).bind(await sha256(token), SITE, ...PRODUCT_SCOPES).first();
}

async function redemptionPayload(DB, codeId) {
  const row = await DB.prepare(
    "SELECT (SELECT COUNT(*) FROM access_sessions WHERE code_id = ? AND site = ?) AS n, " +
    "(SELECT COALESCE(max_devices, ?) FROM access_codes WHERE id = ?) AS max"
  ).bind(codeId, SITE, MAX_DEVICES, codeId).first();
  return { ok: true, scope: normalizeScope(), devices: Number(row?.n || 0), maxDevices: Number(row?.max || MAX_DEVICES) };
}

function normalizeScope() {
  return FULL_SCOPE;
}

function normalizeSource(value) {
  const source = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
  return source || "direct";
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[-_\u2010-\u2015]+/g, "-");
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return HASH_PREFIX + hex;
}

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildCookie(token) {
  return COOKIE_NAME + "=" + token + "; Path=/; Max-Age=" + COOKIE_MAX_AGE + "; HttpOnly; Secure; SameSite=Lax";
}

function readCookie(header, name) {
  return header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + "="))
    ?.slice(name.length + 1);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
