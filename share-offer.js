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

  // 3. 带二维码的分享海报：朋友圈正文里的链接点不开，发朋友圈要用图片，朋友扫码打开同样计数
  function loadQr() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "./qrcode.js";
      script.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error("qr")));
      script.onerror = reject;
      document.head.append(script);
    });
  }

  function wrap(ctx, text, width) {
    const lines = [];
    let line = "";
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > width && line) { lines.push(line); line = ch; } else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  }

  async function makePoster(box, link, status) {
    status.textContent = "正在生成海报……";
    let qr;
    try {
      const make = await loadQr();
      qr = make(0, "M");
      qr.addData(link);
      qr.make();
    } catch {
      status.textContent = "海报暂时生成不了，可以先复制文案发到群里。";
      return;
    }
    const title = box.dataset.posterTitle || "爱丽克丝的题库";
    const sub = box.dataset.posterSub || "扫码免费试做";
    const points = (box.dataset.posterPoints || "").split("|").map((s) => s.trim()).filter(Boolean);
    const colors = (box.dataset.posterColors || "#0f766e,#134e4a").split(",");
    const W = 1080;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) { status.textContent = "海报暂时生成不了。"; return; }
    const font = (size, weight) => `${weight} ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.font = font(38, 500);
    const wrapped = points.map((p) => wrap(ctx, p, W - 230));
    const pointsH = wrapped.reduce((s, l) => s + l.length * 54 + 24, 0);
    ctx.font = font(84, 800);
    const titleLines = wrap(ctx, title, W - 160).slice(0, 2);
    const subY = 230 + titleLines.length * 96 - 10;
    const pointsTop = Math.max(420, subY + 90);
    const qrTop = pointsTop + pointsH + 30;
    const H = qrTop + 520 + 220;
    canvas.width = W;
    canvas.height = H;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, colors[0]);
    bg.addColorStop(1, colors[1] || colors[0]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const text = (v, x, y, size, weight, color, align = "left") => { ctx.fillStyle = color; ctx.font = font(size, weight); ctx.textAlign = align; ctx.fillText(v, x, y); };
    text("爱丽克丝的小站 · 朋友推荐", 80, 120, 34, 500, "#e2f3ee");
    titleLines.forEach((l, i) => text(l, 80, 230 + i * 96, 84, 800, "#ffffff"));
    text(sub, 80, subY, 40, 600, "#ffe5aa");
    let y = pointsTop;
    wrapped.forEach((lines) => {
      text("✓", 80, y, 38, 700, "#ffe5aa");
      lines.forEach((l, i) => text(l, 135, y + i * 54, 38, 500, "#ffffff"));
      y += lines.length * 54 + 24;
    });
    const size = 440;
    const left = (W - size) / 2;
    const top = qrTop;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(left - 30, top - 30, size + 60, size + 60);
    const count = qr.getModuleCount();
    const cell = size / count;
    ctx.fillStyle = "#111111";
    for (let r = 0; r < count; r += 1) for (let c = 0; c < count; c += 1) if (qr.isDark(r, c)) ctx.fillRect(left + c * cell, top + r * cell, Math.ceil(cell), Math.ceil(cell));
    text("长按识别二维码，免费试做", W / 2, top + size + 90, 40, 700, "#ffffff", "center");
    text(new URL(link).host, W / 2, top + size + 145, 30, 500, "#cfe7e0", "center");
    text("打不开或很慢？换个网络或多试几次就好", W / 2, top + size + 195, 28, 500, "#cfe7e0", "center");
    const url = canvas.toDataURL("image/png");
    const overlay = el("div", "share-poster-overlay");
    const card = el("div", "share-poster-card");
    const img = el("img");
    img.src = url;
    img.alt = "分享海报";
    const tip = el("p", "", "长按图片保存到相册，再发朋友圈或群里；电脑上可以点“下载海报”。");
    const actions = el("div", "share-poster-actions");
    const download = el("a", "share-offer-btn primary", "下载海报");
    download.href = url;
    download.download = "share-poster.png";
    const close = el("button", "share-offer-btn", "关闭");
    close.type = "button";
    close.addEventListener("click", () => overlay.remove());
    actions.append(download, close);
    card.append(tip, img, actions);
    overlay.append(card);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.append(overlay);
    status.textContent = "海报已生成，长按保存后发朋友圈；朋友扫码打开同样算数。";
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
    const text = (message ? message + "\n" + link : link) + "\n（打不开或很慢的话，换个网络或多试几次就好）";
    const head = el("div", "share-offer-head");
    head.append(el("strong", "", "分享得 ¥5 优惠"), el("b", "", "¥" + price));
    const intro = el("p", "", `把下面这段话（带你的专属链接）发到朋友圈、学习群或家长群。有 ${data.required} 位不同的朋友点开链接，就会解锁分享验证码；在闲鱼把验证码发给作者，按 ¥${price} 购买。`);
    const pre = el("div", "share-offer-text", text);
    const copyBtn = el("button", "share-offer-btn primary", "复制分享文案");
    copyBtn.type = "button";
    const status = el("p", "share-offer-status");
    copyBtn.addEventListener("click", async () => { status.textContent = (await copyText(text)) ? "已复制，去群里粘贴发送吧。发朋友圈建议用下面的二维码海报。" : "复制失败，请长按上面的文字手动复制。"; });
    const posterBtn = el("button", "share-offer-btn primary", "生成二维码海报（发朋友圈用）");
    posterBtn.type = "button";
    posterBtn.addEventListener("click", () => makePoster(box, link, status));
    const btnRow = el("div", "share-offer-row");
    btnRow.append(copyBtn, posterBtn);

    const bar = el("div", "share-offer-bar");
    const fill = el("i");
    fill.style.width = Math.round(Math.min(data.opens, data.required) / data.required * 100) + "%";
    bar.append(fill);
    const progress = el("p", "share-offer-progress", data.unlocked ? "✅ 已有 " + data.required + " 位朋友打开，分享优惠已解锁！" : `已有 ${data.opens} / ${data.required} 位朋友打开`);
    const refresh = el("button", "share-offer-btn", "刷新进度");
    refresh.type = "button";
    refresh.addEventListener("click", async () => { refresh.disabled = true; const d = await loadMine(true); refresh.disabled = false; if (d.ok) { box.dataset.shareMounted = ""; render(box, d, price, message); box.dataset.shareMounted = "1"; } });

    const parts = [head, intro, pre, btnRow, status, bar, progress];
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
    parts.push(el("p", "share-offer-tip", "发群里用文案（链接能直接点开），发朋友圈用二维码海报（朋友圈里的文字链接点不开）。自己点开不算；同一个 Wi-Fi 下的多位朋友只算 1 位；朋友圈不要设成“仅自己可见”。"));
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
.share-offer-row{display:flex;flex-wrap:wrap;gap:8px}.share-poster-overlay{position:fixed;inset:0;z-index:9999;background:#000a;display:grid;place-items:center;padding:16px}.share-poster-card{max-width:420px;width:100%;max-height:92vh;overflow:auto;background:#fff;border-radius:12px;padding:12px;display:grid;gap:10px;color:#333;font-size:.9rem}.share-poster-card img{width:100%;border-radius:8px}.share-poster-actions{display:flex;gap:10px;justify-content:center}
.share-offer-tip{color:#78350f;font-size:.82rem!important}.share-offer-status{color:#15803d;font-size:.85rem!important}`;
  document.head.append(style);

  const start = () => {
    scan(document);
    new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches?.("[data-share-offer]")) mount(n); scan(n); } }))).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.ShareOffer = { refresh: () => loadMine(true) };
})();
