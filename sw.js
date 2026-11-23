/* 爱丽克丝题库 Service Worker（中考题库、考证题库共用同一份，改一边要复制到另一边）
 * 目的：第二次打开不用再等网络。
 * - 网页本身：先走网络（拿最新版本），3 秒没回来或断网，用上次存的版本打开。
 * - 网址带内容哈希版本号的脚本、样式、题库（?v=8 位以上十六进制）：内容变了网址就变，直接用本机存的，不再请求。
 * - 其他静态文件（图片、?v=8 这类手写版本号）：先用本机存的马上打开，后台再更新一份。
 * - /api/、后台、视频、Cloudflare 统计一律不碰，照常走网络。
 * 要停用：把下面 ENABLED 改成 false 发布，访客下次打开时会自动注销并清空缓存。
 */
const ENABLED = true;
const CACHE = "elx-quiz-v13";
const PAGE_TIMEOUT_MS = 1800;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => !ENABLED || name !== CACHE).map((name) => caches.delete(name)));
    if (!ENABLED) {
      await self.registration.unregister();
      return;
    }
    await self.clients.claim();
  })());
});

function skip(url, request) {
  if (request.method !== "GET" || url.origin !== self.location.origin) return true;
  if (request.headers.has("range")) return true;
  const path = url.pathname;
  return path.startsWith("/api/") || path.startsWith("/cdn-cgi/") || path.startsWith("/admin") ||
    path === "/sw.js" || path.startsWith("/assets/video/") || path.endsWith(".mp4") || path.startsWith("/media/");
}

function hashed(url) {
  return /^[0-9a-f]{8,}$/i.test(url.searchParams.get("v") || "");
}

function cacheable(response) {
  return response && response.ok && response.type === "basic" && !response.redirected;
}

// 同一个文件只留最新的一个版本，旧版本删掉，避免缓存越积越多
async function put(cache, request, response) {
  const url = new URL(request.url);
  if (hashed(url)) {
    const old = await cache.keys();
    await Promise.all(old.filter((item) => {
      const key = new URL(item.url);
      return key.pathname === url.pathname && key.search !== url.search;
    }).map((item) => cache.delete(item)));
  }
  await cache.put(request, response);
}

async function page(event) {
  const cache = await caches.open(CACHE);
  const key = new URL(event.request.url);
  key.search = "";
  key.hash = "";
  const network = fetch(event.request).then(async (response) => {
    if (cacheable(response)) await cache.put(key.href, response.clone());
    return response;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, PAGE_TIMEOUT_MS, "timeout"));
  const first = await Promise.race([network.catch(() => "failed"), timeout]);
  if (first !== "timeout" && first !== "failed") return first;
  const saved = await cache.match(key.href);
  if (saved) {
    event.waitUntil(network.catch(() => {}));
    return saved;
  }
  return network;
}

async function asset(event, url) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(event.request);
  if (saved && hashed(url)) return saved;
  const network = fetch(event.request).then(async (response) => {
    if (cacheable(response)) await put(cache, event.request, response.clone());
    return response;
  });
  if (saved) {
    event.waitUntil(network.catch(() => {}));
    return saved;
  }
  return network;
}

self.addEventListener("fetch", (event) => {
  if (!ENABLED) return;
  const url = new URL(event.request.url);
  if (skip(url, event.request)) return;
  if (event.request.mode === "navigate") event.respondWith(page(event));
  else event.respondWith(asset(event, url));
});
