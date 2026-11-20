(() => {
  "use strict";
  const targets = {
    full: { label: "考证题库", url: "https://tinawin.cc.cd/" },
    xiaosimen: { label: "中考提分题库", url: "https://x4m.cc.cd/" },
  };
  const discount = "朋友点你的专属链接，用好友价在闲鱼下单，省 5 元。";
  const OPEN_KEY = "quiz-referral-open";

  const INVITE_KEY = "quiz-invite";
  const INVITE_DAYS = 60;
  function incoming() {
    const valid = value => /^ALIX-[A-Z0-9]{8}$/.test(value) ? value : "";
    const fromLink = valid(new URLSearchParams(location.search).get("invite")?.trim().toUpperCase() || "");
    try {
      if (fromLink) {
        localStorage.setItem(INVITE_KEY, JSON.stringify({ code: fromLink, at: Date.now() }));
        return fromLink;
      }
      const saved = JSON.parse(localStorage.getItem(INVITE_KEY) || "null");
      if (saved && Date.now() - saved.at < INVITE_DAYS * 864e5) return valid(saved.code);
    } catch {
      // 隐私模式下只认链接里的邀请码。
    }
    return fromLink;
  }

  async function load() {
    try {
      const response = await fetch("/api/access/referral", { method: "POST", cache: "no-store" });
      const data = await response.json();
      return response.ok && data.ok ? data.referral : null;
    } catch {
      return null;
    }
  }

  function node(tag, value, className) {
    const item = document.createElement(tag);
    if (value) item.textContent = value;
    if (className) item.className = className;
    return item;
  }

  function link(label, value) {
    const item = node("a", label, "referral-action");
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return null;
      item.href = url.href;
      item.target = "_blank";
      item.rel = "noopener noreferrer";
      return item;
    } catch {
      return null;
    }
  }

  async function copyText(text, message) {
    try {
      await navigator.clipboard.writeText(text);
      message.textContent = "已复制。";
    } catch {
      message.textContent = "复制失败，请长按选择文字。";
    }
  }

  function button(label, action) {
    const control = node("button", label, "referral-action");
    control.type = "button";
    control.addEventListener("click", action);
    return control;
  }

  // ---- 转发海报：卖点 + 邀请价 + 带邀请码的二维码；手机上弹出图片，长按保存或转发 ----
  const POSTER = {
    xiaosimen: {
      sub: "精编模拟卷 + 全国中考真题 · 能打印",
      points: ["英语、语文、数学、物理精编模拟卷，题量难度对标中考", "全国各地中考原卷，免费看、免费打印", "打印出来纸上做，回来点错题号，错题本照样记"],
      colors: ["#0f5b4b", "#1f8a70"],
    },
    full: {
      sub: "初级 / 中级会计 · 中级审计 · 软考 · 税务师",
      points: ["作者一年内 4 门考试，全部一次通过：", "法考　客观题 210 · 主观题 135", "初级会计　实务 97 · 经济法基础 89", "中级会计　财管 92 · 经济法 91 · 实务 90", "中级审计　相关基础知识 98 · 理论与实务 85", "精编模拟卷 + 章节精练 + 错题自动复习"],
      colors: ["#163a5c", "#246b8f"],
    },
  };
  let qrLoading = null;
  function loadQr() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (!qrLoading) {
      qrLoading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "./qrcode.js";
        script.onload = () => window.qrcode ? resolve(window.qrcode) : reject(new Error("qr"));
        script.onerror = () => { qrLoading = null; reject(new Error("qr")); };
        document.head.appendChild(script);
      });
    }
    return qrLoading;
  }
  function wrapText(context, value, maxWidth) {
    const lines = [];
    let line = "";
    for (const ch of value) {
      if (context.measureText(line + ch).width > maxWidth && line) { lines.push(line); line = ch; }
      else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  }
  function showPoster(dataUrl, code) {
    const overlay = node("div", "", "poster-overlay");
    const card = node("div", "", "poster-card");
    const img = node("img", "", "poster-img");
    img.src = dataUrl;
    img.alt = "转发海报";
    const tip = node("p", "长按图片，可以保存到相册或直接转发给朋友、家长群。", "poster-tip");
    const bar = node("div", "", "poster-actions");
    const download = node("a", "下载海报", "referral-action");
    download.href = dataUrl;
    download.download = "转发海报-" + code + ".png";
    bar.append(download, button("关闭", () => overlay.remove()));
    card.append(img, tip, bar);
    overlay.append(card);
    overlay.addEventListener("click", event => { if (event.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }
  async function saveCard(code, site, address, message) {
    message.textContent = "正在生成海报…";
    let qr;
    try {
      const make = await loadQr();
      qr = make(0, "M");
      qr.addData(address.href);
      qr.make();
    } catch {
      message.textContent = "海报暂时无法生成，可以先用“复制邀请文案”。";
      return;
    }
    const W = 1080;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    const context = canvas.getContext("2d");
    if (!context) { message.textContent = "海报暂时无法生成。"; return; }
    const style = POSTER[siteKey] || POSTER.full;
    const font = (size, weight) => `${weight} ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    // 先量一遍卖点占多高，再定海报高度，卖点多的时候二维码不会被挤出画面
    context.font = font(38, 500);
    const pointLines = style.points.reduce((sum, point) => sum + wrapText(context, point, W - 220).length, 0);
    const pointsBottom = 420 + pointLines * 54 + style.points.length * 26;
    const H = Math.max(1690, Math.max(pointsBottom + 10, 700) + 150 + 50 + 460 + 250);
    canvas.height = H;
    const text = (value, x, y, size, weight, color, align = "left") => {
      context.fillStyle = color;
      context.font = font(size, weight);
      context.textAlign = align;
      context.fillText(value, x, y);
    };
    const bg = context.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, style.colors[0]);
    bg.addColorStop(1, style.colors[1]);
    context.fillStyle = bg;
    context.fillRect(0, 0, W, H);
    text("爱丽克丝的小站 · 朋友推荐", 80, 120, 34, 500, "#d7efe7");
    text(site.label, 80, 240, 96, 800, "#ffffff");
    text(style.sub, 80, 316, 40, 600, "#ffe5aa");
    let y = 420;
    context.font = font(38, 500);
    for (const point of style.points) {
      const lines = wrapText(context, point, W - 220);
      text("✓", 80, y, 38, 700, "#ffe5aa");
      lines.forEach((line, i) => text(line, 130, y + i * 54, 38, 500, "#ffffff"));
      y += lines.length * 54 + 26;
    }
    // 价格条
    const priceY = Math.max(y + 10, 700);
    context.fillStyle = "#ffe5aa";
    context.beginPath();
    context.roundRect ? context.roundRect(80, priceY, W - 160, 150, 24) : context.rect(80, priceY, W - 160, 150);
    context.fill();
    text("扫码用邀请价  ¥14.9", W / 2, priceY + 78, 56, 800, "#3a2a05", "center");
    text("原价 ¥19.9 · 立省 5 元 · 可以先免费试用", W / 2, priceY + 126, 32, 600, "#5a4413", "center");
    // 二维码
    const size = 460, qrX = (W - size) / 2, qrY = priceY + 200;
    context.fillStyle = "#ffffff";
    context.fillRect(qrX - 30, qrY - 30, size + 60, size + 60);
    const count = qr.getModuleCount();
    const cell = size / count;
    context.fillStyle = "#111111";
    for (let r = 0; r < count; r += 1) {
      for (let c = 0; c < count; c += 1) {
        if (qr.isDark(r, c)) context.fillRect(qrX + c * cell, qrY + r * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    text("长按识别二维码", W / 2, qrY + size + 100, 40, 700, "#ffffff", "center");
    text(`邀请码 ${code}`, W / 2, qrY + size + 156, 34, 500, "#d7efe7", "center");
    text("打不开或很慢？换个网络或多试几次就好", W / 2, qrY + size + 206, 28, 500, "#d7efe7", "center");
    let dataUrl;
    try { dataUrl = canvas.toDataURL("image/png"); } catch { message.textContent = "海报暂时无法生成。"; return; }
    message.textContent = "";
    showPoster(dataUrl, code);
  }

  const SPRINT_HINTS = {
    xiaosimen: "（道法、历史、地理、生物每科每册一套，可打印）",
    full: "（按高频考点组卷，可在线做、可打印）",
  };
  const sprintHint = key => SPRINT_HINTS[key] || "";
  const SPRINT_STORY = {
    xiaosimen: "这套卷子，是我陪孩子备考时一题一题攒出来的：对照课标和中考考点，把每一册过了一遍，从中考真题里挑出最该做的题，再针对易错点编写变式题。孩子先做了一遍——哪儿没掌握，一套做完一目了然。真心好用，忍不住想分享给你。",
    full: "这套卷子，是我一路备考攒下来的心得：对照考试大纲的高频考点，从历年真题里挑出最该做的题，再针对易错点编写概念和判断变式题。我自己先刷了一遍——哪个考点不稳，一套做完清清楚楚。真心好用，忍不住想分享给你。",
  };
  let siteKey = "full";
  const BYLINE = "编写：爱丽克丝 · 结合备考经验紧贴大纲编写，难度不拔高、不降低 ｜ 上线前本人逐题自测";
  let lastShare = "";
  const EXTRA = {
    xiaosimen: { text: "还会根据大家的留言需求，不定期加更主科抓考点的精编模拟卷。", from: "x4m" },
    full: { text: "还会根据大家的留言需求，不定期加更其他考试科目的抓考点模拟卷。", from: "tinawin" },
  };
  function extraNode() {
    const extra = EXTRA[siteKey] || EXTRA.full;
    const line = node("p", extra.text + " ", "sprint-promise");
    const ask = node("a", "去留言提需求 →", "sprint-ask");
    ask.href = `https://elx.cc.cd/?panel=feedback&from=${extra.from}`;
    ask.target = "_blank";
    ask.rel = "noopener";
    line.append(ask);
    return line;
  }
  const PROMISE = "每月至少更新一次，考前 2—3 个月加密更新。邀请成功 1 位朋友，就永久解锁全部卷子和以后的每一次更新。";

  function sprintCard(profile, message) {
    const card = node("div", "", "referral-sprint" + (profile.sprint ? " unlocked" : ""));
    card.append(node("p", SPRINT_STORY[siteKey] || SPRINT_STORY.full, "sprint-story"), node("p", PROMISE, "sprint-promise"), extraNode());
    if (profile.sprint) {
      card.append(node("strong", "📝 冲刺卷已解锁"), button("📱 在线做 / 打印冲刺卷", () => openSprint(message)));
    } else {
      card.append(node("strong", "📝 冲刺卷 · 邀请 1 位朋友即可解锁"));
    }
    return card;
  }

  function bigReward(panel, profile, key, target, message) {
    if (profile.invited < profile.required || profile.rewardCode) return null;
    const box = node("div", "", "referral-offer referral-big");
    const cash = profile.cashAmount || 15;
    if (profile.rewardChoice === "cash") {
      box.append(node("strong", profile.cashPaid ? `🎉 返现 ${cash} 元已转给你` : `已选择返现 ${cash} 元`));
      if (profile.cashPaid) {
        if (profile.cashProof) box.append(button("查看转账截图", () => showProof(message)));
        return box;
      }
      box.append(node("p", profile.cashQr
        ? "收款码已上传。作者确认后 24 小时内打款，打款截图会放在这里。想换一张也可以重新上传。"
        : "上传你的微信或支付宝收款码。作者确认后 24 小时内打款，并在这里回传打款截图。"));
      const label = node("label", "", "referral-action");
      const input = node("input");
      input.type = "file";
      input.accept = "image/*";
      input.hidden = true;
      label.append(profile.cashQr ? "重新上传收款码" : "上传收款码", input);
      input.addEventListener("change", async () => {
        if (!input.files[0]) return;
        message.textContent = "正在上传…";
        try {
          const image = await shrink(input.files[0], 900);
          const response = await fetch("/api/access/cash-qr", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }),
          });
          const data = await response.json();
          if (!response.ok || !data.ok) { message.textContent = data.message || "上传失败，请重试。"; return; }
          mount(panel, data.referral, key);
        } catch {
          message.textContent = "上传失败，请换一张图片再试。";
        }
      });
      box.append(label);
      return box;
    }
    if (profile.rewardChoice === "bank") {
      box.append(node("strong", `已选择${target.label}完整版`), node("p", "卖家发放奖励码后会显示在这里，也可以在闲鱼提醒卖家。"));
      return box;
    }
    box.append(node("strong", `🎉 邀满 ${profile.required} 位，选一份大奖（选定后不能改）`));
    const choose = async choice => {
      message.textContent = "正在提交…";
      try {
        const response = await fetch("/api/access/reward-choice", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) { message.textContent = data.message || "提交失败，请重试。"; return; }
        mount(panel, data.referral, key);
      } catch {
        message.textContent = "网络暂时不可用，请重试。";
      }
    };
    box.append(button(`返现 ${cash} 元`, () => {
      if (confirm(`确定选择返现 ${cash} 元吗？选定后不能改成题库。`)) choose("cash");
    }), button(`要${target.label}完整版`, () => {
      if (confirm(`确定选择${target.label}完整版吗？选定后不能改成返现。`)) choose("bank");
    }));
    return box;
  }


  async function shrink(file, maxSide) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.88);
  }

  async function showProof(message) {
    try {
      const response = await fetch("/api/access/cash-proof", { method: "POST", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) { message.textContent = "截图暂时打不开，请稍后再试。"; return; }
      const overlay = node("div", "", "sprint-overlay proof-overlay");
      const bar = node("div", "", "sprint-bar");
      bar.append(node("strong", "转账截图", "proof-title"), button("关闭", () => overlay.remove()));
      const img = node("img", "", "proof-image");
      img.src = data.image;
      img.alt = "卖家回传的转账截图";
      overlay.append(bar, img);
      document.body.append(overlay);
    } catch {
      message.textContent = "网络暂时不可用，请重试。";
    }
  }

  // 首页入口：所有人都能看到。已解锁的直接看全部；没解锁的看样题（每科第 1 套前 5 题）。

  // ---- 上传新卷子（已购用户）----
  const UPLOAD_TEXT = {
    xiaosimen: {
      body: "学校发的月考卷、期中期末卷、孩子做错没弄懂的题，拍照或传文件上来。我会按考点整理：哪些是高频考点、错在哪、同类题怎么练。整理好的题会更新进冲刺卷，大家的孩子一起练。",
      placeholder: "比如：八年级下 生物 期中卷（选填）",
    },
    full: {
      body: "刚考完、还记得几道原题？机构发的新押题卷？传上来，我按大纲考点对一遍，把高频考点更新进冲刺卷，大家一起提前练。",
      placeholder: "比如：2026 中级会计实务 回忆题（选填）",
    },
  };
  const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  const UPLOAD_MAX = 15 * 1024 * 1024;

  async function photoBlob(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.82));
  }

  function renderMyUploads(list, target) {
    target.replaceChildren();
    if (!list?.length) return;
    target.append(node("p", "我传过的：", "upload-mine-title"));
    for (const item of list.slice(0, 8)) {
      const line = node("p", "", "upload-mine");
      line.append(node("span", item.name), node("span", item.status === "adopted" ? "🎉 已采用，冲刺卷已永久解锁" : "待作者整理", item.status === "adopted" ? "upload-ok" : "upload-wait"));
      target.append(line);
    }
  }

  function uploadBox(key, paid) {
    const box = node("div", "", "upload-box");
    box.append(node("strong", "📮 把新卷子发给我，帮你抓考点"));
    if (!paid) {
      const hint = node("p", "", "referral-message");
      box.append(node("p", "手上有新卷子？买了题库后就能在这里上传。被采用的，送冲刺卷永久解锁。", "upload-small"),
        button("📷 上传卷子", () => {
          hint.replaceChildren(node("span", "购买并解锁题库后就能上传（已经买了的，先在本页输入兑换码解锁）。 "),
            button("我要购买 / 输入兑换码", () => window.dispatchEvent(new CustomEvent("quiz-sprint-buy"))));
        }), hint);
      return box;
    }
    const text = UPLOAD_TEXT[key] || UPLOAD_TEXT.full;
    box.append(node("p", text.body), node("p", "🎁 被采用的，送你冲刺卷永久解锁（和邀请成功 1 位朋友一样）。", "upload-gift"));
    const note = node("input", "", "upload-note");
    note.type = "text";
    note.maxLength = 100;
    note.placeholder = text.placeholder;
    const input = node("input", "", "upload-file");
    input.type = "file";
    input.multiple = true;
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");
    input.accept = "image/*,.pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    // 用真按钮 + 不完全隐藏的文件控件，微信等手机内置浏览器也能弹出选择框。
    const pick = button("📷 拍照 / 选文件上传", () => input.click());
    pick.classList.add("upload-pick");
    const status = node("p", "", "referral-message");
    status.setAttribute("role", "status");
    const mine = node("div", "", "upload-mine-list");
    box.append(note, pick, input, status, mine,
      node("p", "支持照片、PDF、Word（.docx）、TXT，单个不超过 15MB，每天最多 5 个。上传前请遮住姓名、学校、电话等信息。上传即同意题目经改编后用于题库和冲刺卷更新。", "upload-small"));
    input.addEventListener("change", async () => {
      const files = [...input.files].slice(0, 5);
      input.value = "";
      if (!files.length) return;
      let done = 0;
      for (const file of files) {
        status.textContent = `正在上传 ${done + 1}/${files.length}：${file.name}`;
        try {
          let body = file;
          let type = file.type || (/\.txt$/i.test(file.name) ? "text/plain" : /\.pdf$/i.test(file.name) ? "application/pdf" : /\.docx$/i.test(file.name) ? UPLOAD_TYPES[5] : "");
          if (/^image\//.test(type)) { body = await photoBlob(file); type = "image/webp"; }
          if (!UPLOAD_TYPES.includes(type)) { status.textContent = `${file.name}：只支持照片、PDF、Word（.docx）和 TXT。`; continue; }
          if (!body || body.size > UPLOAD_MAX) { status.textContent = `${file.name} 超过 15MB。PDF 太大的话，可以分页拍照上传。`; continue; }
          const response = await fetch("/api/access/upload", {
            method: "POST",
            headers: { "Content-Type": type, "X-Upload": "1", "X-File-Name": encodeURIComponent(file.name), "X-Note": encodeURIComponent(note.value.trim()) },
            body,
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.ok) { status.textContent = data.message || "上传失败，请稍后再试。"; break; }
          done += 1;
          renderMyUploads(data.uploads, mine);
        } catch {
          status.textContent = "上传失败，请换个网络再试。";
          break;
        }
      }
      if (done) status.textContent = `已上传 ${done} 个，谢谢你！作者整理后，被采用的会在这里显示 🎉。`;
    });
    fetch("/api/access/my-uploads", { method: "POST", cache: "no-store" })
      .then(r => r.json()).then(data => { if (data.ok) renderMyUploads(data.uploads, mine); }).catch(() => {});
    return box;
  }

  async function friendBanner(container) {
    const code = incoming();
    if (!code) return;
    let offer = {};
    try {
      const response = await fetch("/api/access/friend-offer", { method: "POST", cache: "no-store" });
      if (response.ok) offer = await response.json();
    } catch {
      // 没取到商品入口时，仍提示邀请码已记住。
    }
    const banner = node("div", "", "friend-banner");
    banner.append(node("strong", "🎁 朋友邀请你：好友专享价 14.9 元，省 5 元"),
      node("p", `先免费试用；觉得好再去闲鱼买好友价。买到兑换码后回到这里兑换，邀请码 ${code} 已自动带上。`));
    const actions = node("div", "", "referral-actions");
    const status = node("p", "", "referral-message");
    const buy = link("去闲鱼买好友价", offer.link);
    if (buy) actions.append(buy);
    if (offer.text) actions.append(button("复制闲鱼口令", () => copyText(offer.text, status)));
    if (actions.childElementCount) banner.append(actions, status);
    container.prepend(banner);
  }

  function mountTeaser(container, key, options = {}) {
    if (!container) return;
    siteKey = key;
    container.replaceChildren();
    if (options.showFriend) friendBanner(container);
    // 默认折叠，只露一行：标题 + 数量 + “打开”按钮；展开后才看到说明、更新承诺和上传卷子。
    const card = node("details", "", "sprint-teaser");
    const TEASER_KEY = "sprint-teaser-open";
    try { card.open = localStorage.getItem(TEASER_KEY) === "1"; } catch { /* 隐私模式 */ }
    card.addEventListener("toggle", () => { try { localStorage.setItem(TEASER_KEY, card.open ? "1" : "0"); } catch { /* 隐私模式 */ } });
    const status = node("p", "", "referral-message");
    status.setAttribute("role", "status");
    const head = node("summary", "", "sprint-teaser-head");
    const open = button("打开", event => { event.preventDefault(); event.stopPropagation(); openAny(status); });
    open.classList.add("sprint-open");
    head.append(node("strong", "📝 考点冲刺卷"), node("span", options.count || "", "referral-badge"), open);
    card.append(head, status, node("p", SPRINT_STORY[key] || SPRINT_STORY.full, "sprint-story"), node("p", PROMISE, "sprint-promise"), extraNode(),
      button("📱 在线做 / 打印冲刺卷", () => openAny(status)));
    card.append(uploadBox(key, Boolean(options.paid)));
    container.append(card);
  }

  async function openAny(message) {
    message.textContent = "正在打开…";
    try {
      const full = await fetch("/api/access/sprint", { method: "POST", cache: "no-store" });
      if (full.ok) {
        const data = await full.json();
        sprintCache = data.papers || [];
        message.textContent = "";
        if (sprintCache.length) showSprint(sprintCache);
        return;
      }
      const preview = await fetch("/api/access/sprint-preview", { method: "POST", cache: "no-store" });
      const data = await preview.json();
      message.textContent = "";
      if (preview.ok && data.ok) showSprint(data.papers || [], { preview: true, unlocked: full.status === 403, fullCount: data.total });
    } catch {
      message.textContent = "网络暂时不可用，请重试。";
    }
  }

  // ---- 冲刺卷：在线看、显示答案、打印 ----
  let sprintCache = null;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  async function openSprint(message) {
    if (!sprintCache) {
      message.textContent = "正在打开冲刺卷…";
      try {
        const response = await fetch("/api/access/sprint", { method: "POST", cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.ok) { message.textContent = "冲刺卷暂时打不开，请刷新后再试。"; return; }
        sprintCache = data.papers || [];
        message.textContent = "";
      } catch {
        message.textContent = "网络暂时不可用，请重试。";
        return;
      }
    }
    if (!sprintCache.length) {
      message.textContent = "冲刺卷正在出题，上线后会出现在这里。";
      return;
    }
    showSprint(sprintCache);
  }

  let previewHint = "";
  function paperHTML(paper, showAnswers) {
    let n = 0;
    const answers = [];
    const body = paper.sections.map(section => {
      const items = section.items.map(item => {
        n += 1;
        const tag = item.tag ? `<span class="sprint-tag${/变式/.test(item.tag) ? " hot" : ""}">${esc(item.tag)}</span>` : "";
        const lead = (item.passage ? `<blockquote class="sprint-passage">${esc(item.passage).replace(/\n/g, "<br>")}</blockquote>` : "") +
          (item.image ? `<img class="sprint-fig" src="${esc(item.image)}" alt="题目配图">` : "");
        if (item.type === "choice") {
          answers.push(`<li><b>${n}. ${esc(item.answer)}</b> ${esc(item.explanation)}${item.source ? `<small>（${esc(item.source)}）</small>` : ""}</li>`);
          return `<li class="sprint-q">${lead}<p>${n}. ${esc(item.stem)} ${item.multi ? '<span class="sprint-tag">多选</span>' : ""}${tag}</p><ol class="sprint-options">${item.options.map(o => `<li>${esc(o.key)}. ${esc(o.text)}</li>`).join("")}</ol></li>`;
        }
        if (item.type === "judge") {
          answers.push(`<li><b>${n}. ${esc(item.answer)}</b> ${esc(item.explanation)}${item.source ? `<small>（${esc(item.source)}）</small>` : ""}</li>`);
          return `<li class="sprint-q"><p>${n}. ${esc(item.stem)} ${tag}</p></li>`;
        }
        if (item.type === "blank") {
          answers.push(`<li><b>${n}. ${esc(item.answer.join("；"))}</b> ${esc(item.explanation)}</li>`);
          return `<li class="sprint-q">${lead}<p>${n}. ${esc(item.stem)}</p></li>`;
        }
        const points = item.points.map(p => `${esc(p.text)}（${p.score}分）`).join("；");
        answers.push(`<li><b>${n}. 得分点：</b>${points}${item.sample ? `<br>参考答案：${esc(item.sample)}` : ""}${item.source ? `<small>（${esc(item.source)}）</small>` : ""}</li>`);
        return `<li class="sprint-q">${lead}<p>${n}. ${esc(item.kind || "主观题")}（${item.score}分）${tag}</p>${item.material ? `<blockquote>${esc(item.material)}</blockquote>` : ""}<p>${esc(item.stem)}</p><div class="sprint-lines"></div></li>`;
      }).join("");
      return `<section><h3>${esc(section.title)}</h3>${section.note ? `<p class="sprint-note">${esc(section.note)}</p>` : ""}<ol class="sprint-list">${items}</ol></section>`;
    }).join("");
    const lock = paper.preview ? `<div class="sprint-lock">这是样题（前 5 题）。${previewHint}</div>` : "";
    return `<header class="sprint-head"><h2>${esc(paper.title)}</h2><p class="sprint-byline">${esc(BYLINE)}</p><p>姓名________ 用时________ 得分________</p></header>${body}${lock}` +
      `<section class="sprint-answers${showAnswers ? "" : " hidden-answers"}"><h3>参考答案与解析</h3><ol class="sprint-key">${answers.join("")}</ol></section>`;
  }

  // ---- 在线做题：点选即判对错、看解析，底部计分；做完给出下一步 ----
  const SCORE_KEY = "sprint-score-";
  const readScore = id => { try { return localStorage.getItem(SCORE_KEY + id) || ""; } catch { return ""; } };
  const saveScore = (id, value) => { try { localStorage.setItem(SCORE_KEY + id, value); } catch { /* 隐私模式 */ } };
  const practiceState = new Map();

  function practiceHTML(paper) {
    const st = practiceState.get(paper.id) || {};
    let n = 0;
    const body = paper.sections.map(section => {
      const items = section.items.map(item => {
        n += 1;
        const s = st[n] || {};
        const tag = item.tag ? `<span class="sprint-tag${/变式/.test(item.tag) ? " hot" : ""}">${esc(item.tag)}</span>` : "";
        const reveal = s.done ? `<div class="sp-explain">${item.type === "essay"
          ? `<b>得分点：</b>${item.points.map(p => `${esc(p.text)}（${p.score}分）`).join("；")}${item.sample ? `<br><b>参考答案：</b>${esc(item.sample)}` : ""}`
          : `<b>答案：${esc(Array.isArray(item.answer) ? item.answer.join("；") : item.answer)}</b> ${esc(item.explanation || "")}`}${item.source ? `<small>（${esc(item.source)}）</small>` : ""}</div>` : "";
        const mark = s.done && s.correct !== undefined ? `<span class="sp-mark ${s.correct ? "ok" : "bad"}">${s.correct ? "✓ 答对" : "✗ 答错"}</span>` : "";
        let control = "";
        if (item.type === "choice") {
          const picked = s.picked || [];
          control = `<div class="sp-options">${item.options.map(o => {
            let cls = picked.includes(o.key) ? " picked" : "";
            if (s.done && item.answer.includes(o.key)) cls += " right";
            else if (s.done && picked.includes(o.key)) cls += " wrong";
            return `<button type="button" class="sp-opt${cls}" data-n="${n}" data-key="${esc(o.key)}" ${s.done ? "disabled" : ""}>${esc(o.key)}. ${esc(o.text)}</button>`;
          }).join("")}</div>${item.multi && !s.done ? `<button type="button" class="sp-submit" data-submit="${n}">提交</button>` : ""}`;
        } else if (item.type === "judge") {
          control = `<div class="sp-options sp-judge">${["√", "×"].map(v => {
            let cls = s.picked === v ? " picked" : "";
            if (s.done && item.answer === v) cls += " right";
            else if (s.done && s.picked === v) cls += " wrong";
            return `<button type="button" class="sp-opt${cls}" data-n="${n}" data-judge="${v}" ${s.done ? "disabled" : ""}>${v === "√" ? "√ 正确" : "× 错误"}</button>`;
          }).join("")}</div>`;
        } else if (item.type === "blank") {
          control = s.done ? "" : `<button type="button" class="sp-submit" data-reveal="${n}">想好了，看答案</button>`;
        } else {
          control = `<textarea class="sp-text" rows="4" placeholder="先自己写，再对照得分点" data-text="${n}">${esc(s.text || "")}</textarea>${s.done ? "" : `<button type="button" class="sp-submit" data-reveal="${n}">对照得分点</button>`}`;
        }
        const material = item.material ? `<blockquote>${esc(item.material)}</blockquote>` : "";
        const head = item.type === "essay" ? `${n}. ${esc(item.kind || "主观题")}（${item.score}分）${tag}${material}<br>${esc(item.stem)}` : `${n}. ${esc(item.stem)} ${item.multi ? '<span class="sprint-tag">多选</span>' : ""}${tag}`;
        const lead = (item.passage ? `<blockquote class="sprint-passage">${esc(item.passage).replace(/\n/g, "<br>")}</blockquote>` : "") +
          (item.image ? `<img class="sprint-fig" src="${esc(item.image)}" alt="题目配图">` : "");
        return `<li class="sprint-q">${lead}<p>${head} ${mark}</p>${control}${reveal}</li>`;
      }).join("");
      return `<section><h3>${esc(section.title)}</h3>${section.note ? `<p class="sprint-note">${esc(section.note)}</p>` : ""}<ol class="sprint-list">${items}</ol></section>`;
    }).join("");
    return `<header class="sprint-head"><h2>${esc(paper.title)}</h2><p class="sprint-byline">${esc(BYLINE)}</p></header>${body}<div class="sp-finish" data-finish></div>`;
  }

  function tally(paper) {
    const st = practiceState.get(paper.id) || {};
    let n = 0, total = 0, done = 0, right = 0;
    for (const section of paper.sections) for (const item of section.items) {
      n += 1;
      if (item.type !== "choice" && item.type !== "judge") continue;
      total += 1;
      if (st[n]?.done) { done += 1; if (st[n].correct) right += 1; }
    }
    return { total, done, right };
  }

  function itemAt(paper, index) {
    let n = 0;
    for (const section of paper.sections) for (const item of section.items) { n += 1; if (n === index) return item; }
    return null;
  }

  function showSprint(papers, mode = {}) {
    const preview = Boolean(mode.preview);
    const fullCount = mode.fullCount || papers.length;
    previewHint = mode.unlocked
      ? "完整卷子：把“🎁 邀请好友”里的专属链接发给朋友，有 1 位用它买了题库，就永久解锁全部卷子和以后的每次更新（每月至少一次，考前加密）。"
      : "完整卷子：购买题库后，邀请 1 位朋友，就永久解锁全部卷子和以后的每次更新（每月至少一次，考前加密）。";
    document.querySelector(".sprint-overlay")?.remove();
    const groups = [...new Set(papers.map(p => p.group))];
    const overlay = node("div", "", "sprint-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "冲刺卷");
    const bar = node("div", "", "sprint-bar");
    const groupSelect = node("select");
    groupSelect.setAttribute("aria-label", "科目");
    groups.forEach(g => groupSelect.append(new Option(g, g)));
    const paperSelect = node("select");
    paperSelect.setAttribute("aria-label", "哪一套");
    let practice = !mode.print;
    let showAnswers = false;
    const modeToggle = button("打印版", () => {
      practice = !practice;
      modeToggle.textContent = practice ? "打印版" : "在线做题";
      answerToggle.hidden = practice;
      printButton.hidden = practice;
      render();
    });
    const answerToggle = button("显示答案", () => {
      showAnswers = !showAnswers;
      answerToggle.textContent = showAnswers ? "隐藏答案" : "显示答案";
      render();
    });
    const printButton = button("打印", () => window.print());
    answerToggle.hidden = practice;
    printButton.hidden = practice;
    if (!practice) modeToggle.textContent = "在线做题";
    const close = () => { overlay.remove(); document.body.classList.remove("sprint-printing"); };
    bar.append(groupSelect, paperSelect, modeToggle, answerToggle, printButton, button("关闭", close));
    const sheet = node("article", "", "sprint-paper");
    const scoreBar = node("div", "", "sp-score");
    overlay.append(bar, sheet, scoreBar);
    const current = () => papers.find(p => p.id === paperSelect.value) || papers[0];
    const fillPapers = () => {
      const selected = paperSelect.value;
      paperSelect.replaceChildren();
      papers.filter(p => p.group === groupSelect.value).forEach(p => {
        const score = readScore(p.id);
        paperSelect.append(new Option((p.term || p.title) + (score ? ` ✓${score}` : ""), p.id));
      });
      if (selected && [...paperSelect.options].some(o => o.value === selected)) paperSelect.value = selected;
    };
    const updateScore = () => {
      const paper = current();
      if (!practice) { scoreBar.hidden = true; return; }
      const { total, done, right } = tally(paper);
      scoreBar.hidden = false;
      scoreBar.textContent = `已做 ${done}/${total} · 答对 ${right}`;
      const finish = sheet.querySelector("[data-finish]");
      if (!finish || !total || done < total) return;
      const pct = Math.round((right / total) * 100) + "%";
      if (!preview) saveScore(paper.id, pct);
      finish.innerHTML = "";
      const box = node("div", "", "sp-finish-box");
      if (preview) {
        box.append(node("strong", `样题做完：答对 ${right}/${total}。`),
          node("p", `这一套完整版还有更多题，全部 ${fullCount} 套都在等你。${previewHint}`));
        if (!mode.unlocked) box.append(button("我要完整卷", () => { close(); window.dispatchEvent(new CustomEvent("quiz-sprint-buy")); }));
        else box.append(button("去邀请朋友", () => { close(); openReferral(); }));
      } else {
        box.append(node("strong", `这套做完了：答对 ${right}/${total}（${pct}）。`),
          node("p", right / total >= 0.8 ? "稳！换一套继续，或者把它分享给正在备考的朋友。" : "错的题看一眼解析，过两天再做一遍，进步最快。"));
        if (lastShare) {
          const status = node("p", "", "referral-message");
          box.append(button("把卷子推荐给朋友（复制邀请文案）", () => copyText(lastShare, status)), status);
        }
      }
      finish.append(box);
      fillPapers();
    };
    const render = () => {
      const paper = current();
      sheet.innerHTML = practice ? practiceHTML(paper) : paperHTML(paper, showAnswers);
      sheet.scrollTop = 0;
      updateScore();
    };
    sheet.addEventListener("click", event => {
      if (!practice) return;
      const paper = current();
      const st = practiceState.get(paper.id) || {};
      practiceState.set(paper.id, st);
      const opt = event.target.closest(".sp-opt");
      const submit = event.target.closest("[data-submit]");
      const reveal = event.target.closest("[data-reveal]");
      let index = 0;
      if (opt) {
        index = Number(opt.dataset.n);
        const item = itemAt(paper, index);
        const s = st[index] ||= {};
        if (s.done) return;
        if (opt.dataset.judge) {
          s.picked = opt.dataset.judge;
          s.correct = s.picked === item.answer;
          s.done = true;
        } else if (item.multi) {
          s.picked ||= [];
          const key = opt.dataset.key;
          s.picked = s.picked.includes(key) ? s.picked.filter(k => k !== key) : [...s.picked, key];
        } else {
          s.picked = [opt.dataset.key];
          s.correct = item.answer === opt.dataset.key;
          s.done = true;
        }
      } else if (submit) {
        index = Number(submit.dataset.submit);
        const item = itemAt(paper, index);
        const s = st[index] ||= {};
        if (!s.picked?.length) return;
        s.correct = [...s.picked].sort().join("") === String(item.answer).split("").sort().join("");
        s.done = true;
      } else if (reveal) {
        index = Number(reveal.dataset.reveal);
        const s = st[index] ||= {};
        const text = sheet.querySelector(`[data-text="${index}"]`);
        if (text) s.text = text.value;
        s.done = true;
      } else {
        return;
      }
      const y = sheet.scrollTop;
      sheet.innerHTML = practiceHTML(paper);
      sheet.scrollTop = y;
      updateScore();
    });
    groupSelect.addEventListener("change", () => { fillPapers(); render(); });
    paperSelect.addEventListener("change", render);
    overlay.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
    fillPapers();
    render();
    document.body.append(overlay);
    document.body.classList.add("sprint-printing");
    groupSelect.focus();
  }

  function openReferral() {
    const box = document.querySelector("#referralPanel details");
    if (box) { box.open = true; box.scrollIntoView({ behavior: "smooth", block: "start" }); }
  }

  function mount(panel, profile, key) {
    siteKey = key;
    if (!panel) return;
    panel.hidden = !profile;
    panel.replaceChildren();
    if (!profile) return;

    const site = targets[key];
    const target = targets[profile.target];
    const url = new URL(site.url);
    url.searchParams.set("from", "referral");
    url.searchParams.set("invite", profile.code);
    const share = lastShare = `我在用的${site.label}，推荐给你。\n点我的专属链接，可以先免费试，再用好友价 14.9 元买（省 5 元）：\n${url.href}\n（打不开或很慢的话，换个网络或多试几次就好）\n如果兑换时提示填邀请码，填 ${profile.code}`;
    const message = node("p", "", "referral-message");
    message.setAttribute("role", "status");
    const left = Math.max(0, profile.required - profile.invited);
    const progress = profile.invited >= profile.required
      ? `已经有 ${profile.invited} 位朋友用你的邀请码买了题库，两档奖励都拿到了。`
      : profile.invited > 0
        ? `已经有 ${profile.invited} 位朋友用你的邀请码买了题库，冲刺卷已解锁；再邀 ${left} 位，可领大奖。`
        : "还没有朋友用你的邀请码。邀请 1 位就能解锁冲刺卷。";

    const box = node("details", "", "referral-box");
    try { box.open = localStorage.getItem(OPEN_KEY) === "1"; } catch { /* 隐私模式 */ }
    box.addEventListener("toggle", () => { try { localStorage.setItem(OPEN_KEY, box.open ? "1" : "0"); } catch { /* 隐私模式 */ } });
    const done = Math.min(profile.invited, profile.required);
    const summary = node("summary", "", "referral-summary");
    summary.append(node("span", "🎁 邀请好友", "referral-title"),
      node("span", profile.sprint ? `冲刺卷已解锁 · 已邀 ${done}/${profile.required}` : `朋友省 5 元 · 已邀 ${done}/${profile.required}`, "referral-badge"));
    box.append(summary);

    const steps = node("ol", "", "referral-steps");
    steps.append(
      node("li", "点“生成转发海报”，长按保存后转发到朋友圈、家长群；或者点“复制邀请文案”直接发给朋友。海报上的二维码带着你的邀请码。"),
      node("li", "朋友点开链接，页面上就有好友价 14.9 元的购买入口，省 5 元。"),
      node("li", "朋友买到兑换码、解锁题库后，自动算你邀请成功，不用你做任何事。"),
      node("li", `邀请成功 1 位：马上解锁冲刺卷${sprintHint(key)}，以后每月的更新也永久免费。`),
      node("li", `邀请成功 ${profile.required} 位：这里会出现两个选项，二选一——返现 ${profile.cashAmount || 15} 元，或送你${target.label}完整版。`),
      node("li", `选返现的：上传你的微信或支付宝收款码，作者确认后 24 小时内打款，并在这里回传打款截图。`));
    box.append(node("p", progress, "referral-progress"));
    box.append(sprintCard(profile, message));
    box.append(steps, node("strong", profile.code, "referral-code"));
    const actions = node("div", "", "referral-actions");
    actions.append(button("复制邀请文案", () => copyText(share, message)),
      button("生成转发海报", () => { void saveCard(profile.code, site, url, message); }));
    box.append(actions);

    const big = bigReward(panel, profile, key, target, message);
    if (big) box.append(big);
    if (profile.rewardCode) {
      const gift = node("div", "", "referral-offer");
      const redeem = link("去" + target.label + "兑换", target.url);
      gift.append(node("strong", "奖励兑换码 " + profile.rewardCode),
        button("复制奖励码", () => copyText(profile.rewardCode, message)), redeem);
      box.append(gift);
    } else {
      const offer = node("div", "", "referral-offer");
      offer.append(node("strong", "已购专享 · " + target.label + " 9.9 元"));
      const purchase = link("查看闲鱼商品", profile.offer?.link);
      if (purchase) offer.append(purchase);
      if (profile.offer?.text) offer.append(button("复制闲鱼口令", () => copyText(profile.offer.text, message)));
      if (!purchase && !profile.offer?.text) offer.append(node("p", "购买时可向作者询问已购专享入口。"));
      box.append(offer);
    }
    box.append(message);
    panel.append(box);
  }

  window.QuizReferrals = { incoming, load, mount, mountTeaser, showPapers: (papers, mode) => showSprint(papers, mode) };
})();
