// 网页直付统一框架（支持面包多 Pay / 爱发电 Webhook 自动发码与秒解锁，免手动发兑换码）。
// 未在 Cloudflare Pages 环境变量配置 PAY_PROVIDER 时自动静默隐藏，不影响现有闲鱼兜底流程。
// 配置说明见 docs/WEB_PAY_SETUP.md。
import { findReferrer } from "./_referrals.js";
import { bump, chinaDay, normalizeSource } from "./api/_stats.js";

const SKU_CONFIG = {
  xiaosimen_full: { scope: "xiaosimen", amountCents: 1990, friendPrice: 0, title: "爱丽克丝中考题库完整版（原价）" },
  xiaosimen_share: { scope: "xiaosimen", amountCents: 1490, friendPrice: 0, title: "爱丽克丝中考题库完整版（分享价）" },
  xiaosimen_friend: { scope: "xiaosimen", amountCents: 1490, friendPrice: 1, title: "爱丽克丝中考题库完整版（好友价）" },
  bundle: { scope: "bundle", amountCents: 2980, friendPrice: 0, title: "爱丽克丝双题库套餐（中考 + 考证）" },
};
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomChars(len) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

function generateAccessCode(scope) {
  const prefix = scope === "bundle" ? "ELXB" : "X4M";
  return `${prefix}-${randomChars(4)}-${randomChars(4)}`;
}

function activeProvider(env) {
  const p = String(env?.PAY_PROVIDER || "").trim().toLowerCase();
  if (p === "mbd" && env.MBD_APP_ID && env.MBD_APP_KEY) return "mbd";
  if (p === "afdian" && env.AFDIAN_USER_ID && env.AFDIAN_TOKEN) return "afdian";
  return "";
}

async function ensurePayTable(DB) {
  await DB.prepare(
    "CREATE TABLE IF NOT EXISTS pay_orders (" +
    "out_trade_no TEXT PRIMARY KEY, site TEXT NOT NULL, sku TEXT NOT NULL, provider TEXT NOT NULL, " +
    "amount_cents INTEGER NOT NULL, status TEXT NOT NULL, share_code TEXT, referral_code TEXT, " +
    "source TEXT, access_code_plain TEXT, access_code_id INTEGER, provider_order_id TEXT, " +
    "created_at TEXT NOT NULL, paid_at TEXT)"
  ).run();
}

export async function handlePay(context, helpers) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (url.pathname === "/api/pay/config") return payConfig(env);
  if (!env.DB) return json({ ok: false, reason: "UNAVAILABLE" }, 503);
  await ensurePayTable(env.DB);
  if (url.pathname === "/api/pay/create") return payCreate(context, helpers);
  if (url.pathname === "/api/pay/status") return payStatus(context, helpers);
  if (url.pathname === "/api/pay/webhook") return payWebhook(context, helpers);
  return json({ ok: false }, 404);
}

function payConfig(env) {
  const provider = activeProvider(env);
  return json({
    ok: true,
    enabled: Boolean(provider),
    provider: provider || null,
    prices: { full: 19.9, discount: 14.9, bundle: 29.8 },
  });
}

async function payCreate(context, helpers) {
  const { request, env } = context;
  if (request.method !== "POST") return json({ ok: false }, 405);
  const provider = activeProvider(env);
  if (!provider) return json({ ok: false, reason: "PAY_DISABLED", message: "网页直付尚未开启，请先通过闲鱼购买。" }, 503);

  const body = await request.json().catch(() => ({}));
  const skuKey = String(body?.sku || "xiaosimen_full");
  const sku = SKU_CONFIG[skuKey];
  if (!sku) return json({ ok: false, reason: "INVALID_SKU", message: "无效的商品套餐。" }, 400);

  const shareCode = String(body?.shareCode || "").trim().toUpperCase();
  const referralCode = String(body?.referralCode || "").trim().toUpperCase();
  const source = normalizeSource(body?.source);

  // 服务端严格校验 14.9 元优惠资格，禁止前端篡改价格
  if (skuKey === "xiaosimen_share") {
    if (!shareCode) return json({ ok: false, reason: "SHARE_REQUIRED", message: "请先完成 3 位好友打开分享链接解锁验证码。" }, 400);
    const shareRow = await env.DB.prepare(
      "SELECT id, unlocked_at, used_at FROM share_offers WHERE site = ? AND verify_code = ? LIMIT 1"
    ).bind(helpers.site, shareCode).first();
    if (!shareRow || !shareRow.unlocked_at || shareRow.used_at) {
      return json({ ok: false, reason: "INVALID_SHARE", message: "分享验证码无效、未解锁或已使用。" }, 400);
    }
  }
  if (skuKey === "xiaosimen_friend") {
    if (!referralCode) return json({ ok: false, reason: "REFERRAL_REQUIRED", message: "好友价需要填写朋友的邀请码（ALIX- 开头）。" }, 400);
    const ref = await findReferrer(env.DB, referralCode, -1);
    if (!ref) return json({ ok: false, reason: "INVALID_REFERRAL", message: "邀请码无效，请核对后再试。" }, 400);
  }

  const outTradeNo = `X4M${Date.now().toString(36).toUpperCase()}${randomChars(6)}`;
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO pay_orders (out_trade_no, site, sku, provider, amount_cents, status, share_code, referral_code, source, created_at) " +
    "VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)"
  ).bind(outTradeNo, helpers.site, skuKey, provider, sku.amountCents, shareCode || null, referralCode || null, source, now).run();

  try { await bump(env.DB, chinaDay(), "xiaosimen-" + source, "pay_create"); } catch {}

  const origin = new URL(request.url).origin;
  if (provider === "afdian") {
    const planUrl = skuKey === "bundle"
      ? (env.AFDIAN_PLAN_BUNDLE || "")
      : (sku.amountCents === 1490 ? (env.AFDIAN_PLAN_DISCOUNT || "") : (env.AFDIAN_PLAN_FULL || ""));
    if (!/^https:\/\//i.test(planUrl)) {
      return json({ ok: false, reason: "MISCONFIGURED", message: "爱发电商品链接尚未配置。" }, 503);
    }
    const target = new URL(planUrl);
    target.searchParams.set("custom_order_id", outTradeNo);
    return json({ ok: true, provider: "afdian", orderId: outTradeNo, amount: sku.amountCents / 100, payUrl: target.href });
  }

  // 面包多 Pay（MBD）：向官方下单接口发起预下单（具体路径可通过 MBD_PAY_URL 覆盖）
  const payEndpoint = env.MBD_PAY_URL || "https://api.niucodata.com/release/main/pay";
  const channel = String(body?.channel || "alipay") === "wx" ? "wx" : "alipay";
  const payload = {
    app_id: env.MBD_APP_ID,
    description: sku.title,
    out_trade_no: outTradeNo,
    amount_total: sku.amountCents,
    callback_url: `${origin}/?paid=${encodeURIComponent(outTradeNo)}`,
    channel,
  };
  payload.sign = await mbdSign(payload, env.MBD_APP_KEY);
  const resp = await fetch(payEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  const payUrl = data.pay_url || data.url || data.h5_url || "";
  if (!resp.ok || !payUrl) {
    return json({ ok: false, reason: "UPSTREAM_ERROR", message: data.error || data.message || "创建支付订单失败，请稍后重试或改用闲鱼购买。" }, 502);
  }
  return json({ ok: true, provider: "mbd", orderId: outTradeNo, amount: sku.amountCents / 100, payUrl });
}

// 支付成功后幂等发码：写入 access_codes 并回填 pay_orders
async function fulfillOrder(env, helpers, outTradeNo, paidCents, providerOrderId = "") {
  const order = await env.DB.prepare("SELECT * FROM pay_orders WHERE out_trade_no = ? AND site = ?").bind(outTradeNo, helpers.site).first();
  if (!order) return { ok: false, reason: "NOT_FOUND" };
  if (order.status === "paid") return { ok: true, alreadyPaid: true, order };
  if (Number.isFinite(paidCents) && paidCents < order.amount_cents) return { ok: false, reason: "AMOUNT_MISMATCH" };

  const sku = SKU_CONFIG[order.sku] || SKU_CONFIG.xiaosimen_full;
  const plainCode = generateAccessCode(sku.scope);
  const codeHash = await helpers.hashAccessCode(plainCode);
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO access_codes (code_hash, access_scope, friend_price, max_devices, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(codeHash, sku.scope, sku.friendPrice, helpers.maxDevices, now).run();
  const codeRow = await env.DB.prepare("SELECT id FROM access_codes WHERE code_hash = ? LIMIT 1").bind(codeHash).first();

  await env.DB.prepare(
    "UPDATE pay_orders SET status = 'paid', access_code_plain = ?, access_code_id = ?, provider_order_id = ?, paid_at = ? " +
    "WHERE out_trade_no = ? AND status = 'pending'"
  ).bind(plainCode, codeRow?.id ?? null, String(providerOrderId || ""), now, outTradeNo).run();

  if (order.share_code) {
    await env.DB.prepare("UPDATE share_offers SET used_at = ? WHERE site = ? AND verify_code = ? AND used_at IS NULL")
      .bind(now, helpers.site, order.share_code).run();
  }
  try { await bump(env.DB, chinaDay(), "xiaosimen-" + (order.source || "direct"), "pay_success"); } catch {}
  return { ok: true, plainCode, codeId: codeRow?.id ?? null };
}

async function payWebhook(context, helpers) {
  const { request, env } = context;
  if (request.method !== "POST") return json({ ok: false }, 405);
  const provider = activeProvider(env);
  if (!provider) return json({ ok: false }, 503);

  const body = await request.json().catch(() => ({}));

  if (provider === "afdian") {
    const orderData = body?.data?.order;
    const outTradeNo = String(orderData?.custom_order_id || "").trim();
    const afdianTradeNo = String(orderData?.out_trade_no || "").trim();
    if (!outTradeNo || !afdianTradeNo) return json({ ec: 200, em: "" });
    // 向爱发电 API 服务端反查订单真实性，防伪造 Webhook
    const verified = await verifyAfdianOrder(env, afdianTradeNo);
    if (verified.ok && verified.customOrderId === outTradeNo) {
      await fulfillOrder(env, helpers, outTradeNo, verified.amountCents, afdianTradeNo);
    }
    return json({ ec: 200, em: "" });
  }

  // 面包多 Pay Webhook 验签
  const sign = String(body?.sign || "");
  const expected = await mbdSign(body, env.MBD_APP_KEY);
  if (!sign || sign !== expected) return json({ ok: false, reason: "BAD_SIGN" }, 403);
  const outTradeNo = String(body?.out_trade_no || "").trim();
  const paidCents = Number(body?.amount_total ?? body?.amount ?? 0);
  if (outTradeNo) {
    await fulfillOrder(env, helpers, outTradeNo, paidCents, String(body?.order_id || body?.charge_id || ""));
  }
  return json({ ok: true });
}

// 前端轮询订单状态：一旦已支付，自动激活当前浏览器会话并下发 Cookie（1 秒自动解锁，免手动输码）
async function payStatus(context, helpers) {
  const { request, env } = context;
  const orderId = String(new URL(request.url).searchParams.get("orderId") || "").trim();
  if (!orderId) return json({ ok: false, reason: "MISSING_ORDER" }, 400);
  const order = await env.DB.prepare(
    "SELECT out_trade_no, status, access_code_plain, access_code_id, referral_code, source FROM pay_orders WHERE out_trade_no = ? AND site = ?"
  ).bind(orderId, helpers.site).first();
  if (!order) return json({ ok: false, reason: "NOT_FOUND" }, 404);
  if (order.status !== "paid" || !order.access_code_id) {
    return json({ ok: true, status: order.status });
  }
  const res = await helpers.activateCodeSession(context, order.access_code_id, order.referral_code || "", order.source || "direct");
  const payload = await res.json();
  const out = json({ ...payload, status: "paid", accessCode: order.access_code_plain || "" }, res.status);
  const cookie = res.headers.get("Set-Cookie");
  if (cookie) out.headers.set("Set-Cookie", cookie);
  return out;
}

async function mbdSign(params, key) {
  const sorted = Object.keys(params || {})
    .filter((k) => k !== "sign" && params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return sha256Hex(`${sorted}&key=${key}`);
}

async function verifyAfdianOrder(env, afdianTradeNo) {
  try {
    const ts = Math.floor(Date.now() / 1000);
    const params = JSON.stringify({ out_trade_no: afdianTradeNo });
    // 爱发电 OpenAPI 签名：md5(token + "params" + params + "ts" + ts + "user_id" + user_id)
    // 为保持零第三方依赖，这里调用 Web Crypto MD5 或由自定义校验网关处理；未支持 MD5 时回退校验 token 头
    const resp = await fetch("https://afdian.com/api/open/query-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: env.AFDIAN_USER_ID, params, ts, sign: md5Hex(`${env.AFDIAN_TOKEN}params${params}ts${ts}user_id${env.AFDIAN_USER_ID}`) }),
    });
    const data = await resp.json().catch(() => ({}));
    const item = data?.data?.list?.[0];
    if (!item || Number(item.status) !== 2) return { ok: false };
    return {
      ok: true,
      customOrderId: String(item.custom_order_id || ""),
      amountCents: Math.round(Number(item.total_amount || 0) * 100),
    };
  } catch {
    return { ok: false };
  }
}

// 轻量纯 JS MD5（仅用于爱发电 OpenAPI query-order 签名，零外部依赖）
function md5Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const len = bytes.length;
  const words = new Int32Array((((len + 8) >>> 6) + 1) << 4);
  for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << ((i % 4) << 3);
  words[len >> 2] |= 0x80 << ((len % 4) << 3);
  words[words.length - 2] = len << 3;
  let a = 0x67452301, b = -0x10325477, c = -0x67452302, d = 0x10325476;
  const S = [7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
  const K = new Int32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) | 0;
  const rotl = (x, n) => (x << n) | (x >>> (32 - n));
  for (let i = 0; i < words.length; i += 16) {
    let A = a, B = b, C = c, D = d;
    for (let j = 0; j < 64; j++) {
      let f, g;
      if (j < 16) { f = (B & C) | (~B & D); g = j; }
      else if (j < 32) { f = (D & B) | (~D & C); g = (5 * j + 1) % 16; }
      else if (j < 48) { f = B ^ C ^ D; g = (3 * j + 5) % 16; }
      else { f = C ^ (B | ~D); g = (7 * j) % 16; }
      const tmp = D;
      D = C;
      C = B;
      B = (B + rotl((A + f + K[j] + words[i + g]) | 0, S[(j >> 4) * 4 + (j % 4)])) | 0;
      A = tmp;
    }
    a = (a + A) | 0; b = (b + B) | 0; c = (c + C) | 0; d = (d + D) | 0;
  }
  return [a, b, c, d].map((n) => {
    let h = "";
    for (let i = 0; i < 4; i++) h += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
    return h;
  }).join("");
}
