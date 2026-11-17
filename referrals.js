(() => {
  "use strict";
  const targets = {
    full: { label: "考证题库", url: "https://tinawin.cc.cd/" },
    xiaosimen: { label: "小四门题库", url: "https://x4m.cc.cd/" },
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

  function saveCard(code, site, address, message) {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    if (!context) {
      message.textContent = "分享图暂时无法生成。";
      return;
    }
    context.fillStyle = "#edf5ef";
    context.fillRect(0, 0, 900, 480);
    context.fillStyle = "#17473d";
    context.fillRect(0, 0, 900, 12);
    const text = (value, x, y, size, weight, color) => {
      context.fillStyle = color;
      context.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
      context.fillText(value, x, y);
    };
    text("爱丽克丝的小站", 56, 80, 28, 600, "#246456");
    text("一起练习 · " + site.label, 56, 150, 43, 700, "#163b33");
    text(code, 56, 255, 76, 750, "#17473d");
    text("好友专享价 14.9 元 · 立省 5 元", 56, 320, 33, 700, "#24574b");
    text("打开下面的网址，或兑换时填上方邀请码", 56, 371, 28, 500, "#24574b");
    text(address.host, 56, 433, 25, 500, "#24574b");
    canvas.toBlob(blob => {
      if (!blob) {
        message.textContent = "分享图暂时无法生成。";
        return;
      }
      const url = URL.createObjectURL(blob);
      const download = document.createElement("a");
      download.href = url;
      download.download = "邀请卡-" + code + ".png";
      document.body.appendChild(download);
      download.click();
      download.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }


  const SPRINT_HINTS = {
    xiaosimen: "（道法、历史、地理、生物每科每册一套，可打印）",
    full: "（按高频考点组卷，可在线做、可打印）",
  };
  const sprintHint = key => SPRINT_HINTS[key] || "";
  const SPRINT_STORY = {
    xiaosimen: "这套卷子，是我和 Claude（Anthropic 的 Opus 5.5 模型）的一次“与神对话”：它按课标和中考考点把每一册过了一遍，从中考真题里挑出最该做的题，又专门为易错点新出了冲刺题。我先让孩子做了一遍——哪儿没掌握，一套做完一目了然。真心好用，忍不住想分享给你。",
    full: "这套卷子，是我和 Claude（Anthropic 的 Opus 5.5 模型）的一次“与神对话”：它按考试大纲的高频考点，从历年真题里挑出最该做的题，又新出了概念和判断冲刺题。我自己先刷了一遍——哪个考点不稳，一套做完清清楚楚。真心好用，忍不住想分享给你。",
  };
  let siteKey = "full";
  const BYLINE = "出题：Claude · Opus 5.5 根据考点与历年真题精选、改编、新出 ｜ 作者亲测";
  const PROMISE = "每月至少更新一次，考前 2—3 个月加密更新。邀请成功 1 位朋友，就永久解锁全部卷子和以后的每一次更新。";

  function sprintCard(profile, message) {
    const card = node("div", "", "referral-sprint" + (profile.sprint ? " unlocked" : ""));
    card.append(node("p", SPRINT_STORY[siteKey] || SPRINT_STORY.full, "sprint-story"), node("p", PROMISE, "sprint-promise"));
    if (profile.sprint) {
      card.append(node("strong", "📝 冲刺卷已解锁"), button("打开冲刺卷", () => openSprint(message)));
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
    const card = node("div", "", "sprint-teaser");
    const head = node("div", "", "sprint-teaser-head");
    head.append(node("strong", "📝 冲刺卷 · Claude 出题"), node("span", options.count || "", "referral-badge"));
    const status = node("p", "", "referral-message");
    status.setAttribute("role", "status");
    card.append(head, node("p", SPRINT_STORY[key] || SPRINT_STORY.full, "sprint-story"), node("p", PROMISE, "sprint-promise"),
      button("打开冲刺卷", () => openAny(status)), status);
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
      if (preview.ok && data.ok) showSprint(data.papers || [], { preview: true, unlocked: full.status === 403 });
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
        const tag = item.tag ? `<span class="sprint-tag${/冲刺/.test(item.tag) ? " hot" : ""}">${esc(item.tag)}</span>` : "";
        if (item.type === "choice") {
          answers.push(`<li><b>${n}. ${esc(item.answer)}</b> ${esc(item.explanation)}${item.source ? `<small>（${esc(item.source)}）</small>` : ""}</li>`);
          return `<li class="sprint-q"><p>${n}. ${esc(item.stem)} ${item.multi ? '<span class="sprint-tag">多选</span>' : ""}${tag}</p><ol class="sprint-options">${item.options.map(o => `<li>${esc(o.key)}. ${esc(o.text)}</li>`).join("")}</ol></li>`;
        }
        if (item.type === "judge") {
          answers.push(`<li><b>${n}. ${esc(item.answer)}</b> ${esc(item.explanation)}${item.source ? `<small>（${esc(item.source)}）</small>` : ""}</li>`);
          return `<li class="sprint-q"><p>${n}. ${esc(item.stem)} ${tag}</p></li>`;
        }
        if (item.type === "blank") {
          answers.push(`<li><b>${n}. ${esc(item.answer.join("；"))}</b> ${esc(item.explanation)}</li>`);
          return `<li class="sprint-q"><p>${n}. ${esc(item.stem)}</p></li>`;
        }
        const points = item.points.map(p => `${esc(p.text)}（${p.score}分）`).join("；");
        answers.push(`<li><b>${n}. 得分点：</b>${points}${item.sample ? `<br>参考答案：${esc(item.sample)}` : ""}${item.source ? `<small>（${esc(item.source)}）</small>` : ""}</li>`);
        return `<li class="sprint-q"><p>${n}. ${esc(item.kind || "主观题")}（${item.score}分）${tag}</p>${item.material ? `<blockquote>${esc(item.material)}</blockquote>` : ""}<p>${esc(item.stem)}</p><div class="sprint-lines"></div></li>`;
      }).join("");
      return `<section><h3>${esc(section.title)}</h3>${section.note ? `<p class="sprint-note">${esc(section.note)}</p>` : ""}<ol class="sprint-list">${items}</ol></section>`;
    }).join("");
    const lock = paper.preview ? `<div class="sprint-lock">这是样题（前 5 题）。${previewHint}</div>` : "";
    return `<header class="sprint-head"><h2>${esc(paper.title)}</h2><p class="sprint-byline">${esc(BYLINE)}</p><p>姓名________ 用时________ 得分________</p></header>${body}${lock}` +
      `<section class="sprint-answers${showAnswers ? "" : " hidden-answers"}"><h3>参考答案与解析</h3><ol class="sprint-key">${answers.join("")}</ol></section>`;
  }

  function showSprint(papers, mode = {}) {
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
    const answerToggle = button("显示答案", () => {
      showAnswers = !showAnswers;
      answerToggle.textContent = showAnswers ? "隐藏答案" : "显示答案";
      render();
    });
    const close = () => { overlay.remove(); document.body.classList.remove("sprint-printing"); };
    bar.append(groupSelect, paperSelect, answerToggle, button("打印", () => window.print()), button("关闭", close));
    const sheet = node("article", "", "sprint-paper");
    overlay.append(bar, sheet);
    let showAnswers = false;
    const fillPapers = () => {
      paperSelect.replaceChildren();
      papers.filter(p => p.group === groupSelect.value).forEach(p => paperSelect.append(new Option(p.term || p.title, p.id)));
    };
    const render = () => {
      const paper = papers.find(p => p.id === paperSelect.value) || papers[0];
      sheet.innerHTML = paperHTML(paper, showAnswers);
      sheet.scrollTop = 0;
    };
    groupSelect.addEventListener("change", () => { fillPapers(); render(); });
    paperSelect.addEventListener("change", render);
    overlay.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
    fillPapers();
    render();
    document.body.append(overlay);
    document.body.classList.add("sprint-printing");
    groupSelect.focus();
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
    const share = `我在用的${site.label}，推荐给你。\n点我的专属链接，可以先免费试，再用好友价 14.9 元买（省 5 元）：\n${url.href}\n如果兑换时提示填邀请码，填 ${profile.code}`;
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
      node("li", "点“复制邀请文案”，把你的专属链接发给想买题库的朋友。"),
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
      button("保存分享图", () => saveCard(profile.code, site, url, message)));
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

  window.QuizReferrals = { incoming, load, mount, mountTeaser };
})();
