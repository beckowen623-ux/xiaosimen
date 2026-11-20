// 分享得 5 元（两个题库共用，文件内容保持一致）。
// 页面里放一个 <div data-share-offer data-price="14.9" data-message="分享文案"></div>，这里会自动挂上组件。
// 访客带着 ?s=<id> 打开网站时，自动上报一次“打开”，服务器按网络、设备去重并排除分享者本人。
(() => {
  const DEVICE_KEY = "share-device";
  const ID_RE = /^[A-Z2-9]{8}$/;
  let deviceId = "";
  try {
    deviceId = localStorage.getItem(DEVICE_KEY) || "";
    if (!/^[a-z0-9-]{16,64}$/i.test(deviceId)) {
      deviceId = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2) + "xxxxxxxx").slice(0, 36);
      localStorage.setItem(DEVICE_KEY, deviceId);
    }
  } catch {
    deviceId = "tmp-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
  }

  const post = (path, body) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, device: deviceId }), cache: "no-store" })
    .then((r) => r.json()).catch(() => ({ ok: false }));

  // 1. 访客打开分享链接：每个链接在本浏览器只上报一次
  try {
    const s = (new URLSearchParams(location.search).get("s") || "").trim().toUpperCase();
    if (ID_RE.test(s) && !localStorage.getItem("share-opened-" + s)) {
      post("/api/share/open", { s }).then(() => { try { localStorage.setItem("share-opened-" + s, "1"); } catch {} });
    }
  } catch {}

  // 2. 分享者自己的进度
  let cache = null;
  let cacheAt = 0;
  async function loadMine(force) {
    if (!force && cache && Date.now() - cacheAt < 30000) return cache;
    const data = await post("/api/share/me", {});
    if (data.ok) { cache = data; cacheAt = Date.now(); }
    return data;
  }

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    try { const t = el("textarea"); t.value = text; document.body.append(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok; } catch { return false; }
  }

  function shareLink(id) {
    const url = new URL(location.origin + "/");
    url.searchParams.set("from", "share");
    url.searchParams.set("s", id);
    return url.href;
  }

  async function mount(box) {
    if (box.dataset.shareMounted) return;
    box.dataset.shareMounted = "1";
    const price = box.dataset.price || "14.9";
    const message = box.dataset.message || "";
    box.classList.add("share-offer");
    box.replaceChildren(el("p", "share-offer-loading", "正在生成你的专属分享链接……"));
    const data = await loadMine(false);
    if (!data.ok) {
      box.replaceChildren(el("p", "share-offer-tip", "分享优惠暂时加载不了，请稍后刷新再试；也可以在闲鱼联系作者。"));
      return;
    }
    render(box, data, price, message);
  }

  function render(box, data, price, message) {
    const link = shareLink(data.id);
    const text = message ? message + "\n" + link : link;
    const head = el("div", "share-offer-head");
    head.append(el("strong", "", "分享得 ¥5 优惠"), el("b", "", "¥" + price));
    const intro = el("p", "", `把下面这段话（带你的专属链接）发到朋友圈、学习群或家长群。有 ${data.required} 位不同的朋友点开链接，就会解锁分享验证码；在闲鱼把验证码发给作者，按 ¥${price} 购买。`);
    const pre = el("div", "share-offer-text", text);
    const copyBtn = el("button", "share-offer-btn primary", "复制分享文案");
    copyBtn.type = "button";
    const status = el("p", "share-offer-status");
    copyBtn.addEventListener("click", async () => { status.textContent = (await copyText(text)) ? "已复制，去朋友圈或群里粘贴发送吧。" : "复制失败，请长按上面的文字手动复制。"; });

    const bar = el("div", "share-offer-bar");
    const fill = el("i");
    fill.style.width = Math.round(Math.min(data.opens, data.required) / data.required * 100) + "%";
    bar.append(fill);
    const progress = el("p", "share-offer-progress", data.unlocked ? "✅ 已有 " + data.required + " 位朋友打开，分享优惠已解锁！" : `已有 ${data.opens} / ${data.required} 位朋友打开`);
    const refresh = el("button", "share-offer-btn", "刷新进度");
    refresh.type = "button";
    refresh.addEventListener("click", async () => { refresh.disabled = true; const d = await loadMine(true); refresh.disabled = false; if (d.ok) { box.dataset.shareMounted = ""; render(box, d, price, message); box.dataset.shareMounted = "1"; } });

    const parts = [head, intro, pre, copyBtn, status, bar, progress];
    if (data.unlocked) {
      const codeBox = el("div", "share-offer-code");
      codeBox.append(el("span", "", "分享验证码"), el("b", "", data.verifyCode));
      const copyCode = el("button", "share-offer-btn primary", "复制验证码");
      copyCode.type = "button";
      copyCode.addEventListener("click", async () => { status.textContent = (await copyText(data.verifyCode)) ? "验证码已复制，在闲鱼发给作者即可。" : "复制失败，请手动记下验证码。"; });
      parts.push(codeBox, copyCode, el("p", "share-offer-tip", data.used ? "这个验证码已经用过了。" : `在闲鱼把验证码发给作者，按 ¥${price} 购买兑换码。每个验证码限用一次。`));
    } else {
      parts.push(refresh);
    }
    parts.push(el("p", "share-offer-tip", "自己点开不算；同一个 Wi-Fi 下的多位朋友只算 1 位。朋友圈不要设成“仅自己可见”，否则朋友看不到链接。"));
    box.replaceChildren(...parts);
  }

  function scan(root) {
    (root.querySelectorAll ? root.querySelectorAll("[data-share-offer]") : []).forEach((box) => { if (!box.dataset.shareMounted) mount(box); });
  }

  const style = el("style");
  style.textContent = `.share-offer{display:grid;gap:8px;padding:14px;border:2px solid #f59e0b;border-radius:12px;background:#fffbeb;color:#422006;text-align:left}
.share-offer-head{display:flex;justify-content:space-between;align-items:baseline}.share-offer-head strong{font-size:1.05rem}.share-offer-head b{color:#b45309;font-size:1.15rem}
.share-offer p{margin:0;line-height:1.6;font-size:.92rem}.share-offer-text{white-space:pre-wrap;word-break:break-all;padding:10px;border-radius:8px;background:#fff;border:1px dashed #f59e0b;font-size:.88rem;line-height:1.6;user-select:all}
.share-offer-btn{justify-self:start;padding:8px 14px;border-radius:8px;border:1px solid #d97706;background:#fff;color:#92400e;font:inherit;font-weight:700;cursor:pointer}.share-offer-btn.primary{background:#d97706;color:#fff}
.share-offer-bar{height:8px;border-radius:99px;background:#fde68a;overflow:hidden}.share-offer-bar i{display:block;height:100%;background:#d97706}
.share-offer-progress{font-weight:700}.share-offer-code{display:flex;gap:12px;align-items:center;padding:10px;border-radius:8px;background:#fff}.share-offer-code b{font-size:1.4rem;letter-spacing:4px;color:#b45309}
.share-offer-tip{color:#78350f;font-size:.82rem!important}.share-offer-status{color:#15803d;font-size:.85rem!important}`;
  document.head.append(style);

  const start = () => {
    scan(document);
    new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches?.("[data-share-offer]")) mount(n); scan(n); } }))).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.ShareOffer = { refresh: () => loadMine(true) };
})();
