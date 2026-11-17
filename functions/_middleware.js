import { chooseReward, findReferrer, referralDetails } from "./_referrals.js";
import { SPRINT_PAPERS } from "./_sprint.js";

const COOKIE_NAME = "xiaosimen_access";
const SITE = "xiaosimen";
const PRODUCT_SCOPES = ["xiaosimen", "bundle"];
const scopeParams = PRODUCT_SCOPES.map(() => "?").join(", ");
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const HASH_PREFIX = "sha256:";
const FULL_SCOPE = "full";
const MAX_DEVICES = 2;
const PUBLIC_API_PATHS = new Set(["/api/access/redeem", "/api/access/status", "/api/access/referral",
  "/api/access/reward-choice", "/api/access/sprint"]);

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (!PUBLIC_API_PATHS.has(url.pathname)) return context.next();

  try {
    if (url.pathname === "/api/access/redeem") return await redeem(context);
    if (url.pathname === "/api/access/referral") return await accessReferral(context);
    if (url.pathname === "/api/access/reward-choice") return await rewardChoice(context);
    if (url.pathname === "/api/access/sprint") return await sprintPapers(context);
    return await accessStatus(context);
  } catch (error) {
    console.error("Access database request failed", SITE, error.message);
    return json({ ok: false, reason: "UNAVAILABLE", message: "Access service unavailable." }, 503);
  }
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

  const normalizedCode = normalizeCode(code);
  if (!normalizedCode || normalizedCode.length > 64) {
    return json({ ok: false, reason: "INVALID_CODE", message: "Please enter a valid access code." }, 400);
  }

  const codeRow = await env.DB.prepare(
    "SELECT id, used_at, reward_for_code_id FROM access_codes WHERE code_hash = ? AND access_scope IN (" + scopeParams + ") LIMIT 1"
  ).bind(await sha256(normalizedCode), ...PRODUCT_SCOPES).first();
  if (!codeRow) {
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
  if (codeRow.used_at == null && codeRow.reward_for_code_id == null && String(referralCode).trim()) {
    referrer = await findReferrer(env.DB, referralCode, codeRow.id);
    if (!referrer) return json({ ok: false, reason: "INVALID_REFERRAL" }, 400);
  }

  const sessionToken = createToken();
  const sessionHash = await sha256(sessionToken);
  const now = new Date().toISOString();
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const userAgent = (request.headers.get("User-Agent") || "").slice(0, 500);

  // Claim a site-specific slot and record first use in one transaction.
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO access_sessions (code_id, session_token_hash, created_at, ip, user_agent, site) " +
      "SELECT id, ?, ?, ?, ?, ? FROM access_codes WHERE id = ? AND access_scope IN (" + scopeParams + ") " +
      "AND (SELECT COUNT(*) FROM access_sessions WHERE code_id = access_codes.id AND site = ?) < ?"
    ).bind(sessionHash, now, ip, userAgent, SITE, codeRow.id, ...PRODUCT_SCOPES, SITE, MAX_DEVICES),
    env.DB.prepare(
      "UPDATE access_codes SET used_at = ?, used_ip = ?, used_user_agent = ?, session_token_hash = ?, " +
      "session_created_at = ?, redeem_source = ?, referred_by = ? WHERE id = ? AND used_at IS NULL " +
      "AND EXISTS (SELECT 1 FROM access_sessions WHERE code_id = access_codes.id AND session_token_hash = ?)"
    ).bind(now, ip, userAgent, sessionHash, now, "xiaosimen-" + normalizeSource(source), referrer?.id ?? null, codeRow.id, sessionHash),
  ]);
  if (inserted?.meta?.changes !== 1) {
    return json({ ok: false, reason: "DEVICE_LIMIT", maxDevices: MAX_DEVICES, message: "Access code device limit reached." }, 403);
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
  const referral = await referralDetails(context.env.DB, row);
  if (!referral?.sprint) return json({ ok: false, reason: "LOCKED", required: referral?.sprintRequired || 1 }, 403);
  return json({ ok: true, papers: SPRINT_PAPERS });
}

async function accessSession({ request, env }) {
  const token = readCookie(request.headers.get("Cookie") || "", COOKIE_NAME);
  if (!token) return null;
  return env.DB.prepare(
    "SELECT c.id, c.access_scope, c.referral_code, c.reward_for_code_id FROM access_sessions s " +
    "JOIN access_codes c ON c.id = s.code_id WHERE s.session_token_hash = ? AND s.site = ? " +
    "AND c.used_at IS NOT NULL AND c.access_scope IN (" + scopeParams + ") LIMIT 1"
  ).bind(await sha256(token), SITE, ...PRODUCT_SCOPES).first();
}

async function redemptionPayload(DB, codeId) {
  const row = await DB.prepare("SELECT COUNT(*) AS n FROM access_sessions WHERE code_id = ? AND site = ?")
    .bind(codeId, SITE).first();
  return { ok: true, scope: normalizeScope(), devices: Number(row?.n || 0), maxDevices: MAX_DEVICES };
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
