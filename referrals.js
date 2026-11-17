(() => {
  "use strict";
  const targets = {
    full: { label: "考证题库", url: "https://tinawin.cc.cd/" },
    xiaosimen: { label: "小四门题库", url: "https://x4m.cc.cd/" },
  };
  const discount = "朋友在闲鱼下单时备注这个邀请码，立减 5 元。";
  const OPEN_KEY = "quiz-referral-open";

  function incoming() {
    const code = new URLSearchParams(location.search).get("invite")?.trim().toUpperCase() || "";
    return /^ALIX-[A-Z0-9]{8}$/.test(code) ? code : "";
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
    text("闲鱼下单备注邀请码 · 立减 5 元", 56, 320, 33, 700, "#24574b");
    text("收到兑换码后，兑换时再填一次。", 56, 371, 28, 500, "#24574b");
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

  function sprintCard(profile, message) {
    const card = node("div", "", "referral-sprint" + (profile.sprint ? " unlocked" : ""));
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
      if (!profile.cashPaid) box.append(node("p", `请在闲鱼给卖家留言你的邀请码 ${profile.code}，卖家核对后转账给你。`));
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

  function paperHTML(paper, showAnswers) {
    let n = 0;
    const answers = [];
    const body = paper.sections.map(section => {
      const items = section.items.map(item => {
        n += 1;
        const tag = item.tag ? `<span class="sprint-tag${item.tag === "考点冲刺" ? " hot" : ""}">${esc(item.tag)}</span>` : "";
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
    return `<header class="sprint-head"><h2>${esc(paper.title)}</h2><p>姓名________ 用时________ 得分________</p></header>${body}` +
      `<section class="sprint-answers${showAnswers ? "" : " hidden-answers"}"><h3>参考答案与解析</h3><ol class="sprint-key">${answers.join("")}</ol></section>`;
  }

  function showSprint(papers) {
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
    if (!panel) return;
    panel.hidden = !profile;
    panel.replaceChildren();
    if (!profile) return;

    const site = targets[key];
    const target = targets[profile.target];
    const url = new URL(site.url);
    url.searchParams.set("from", "referral");
    url.searchParams.set("invite", profile.code);
    const share = `我在用的${site.label}，推荐给你。\n在闲鱼下单时备注我的邀请码 ${profile.code}，立减 5 元；收到兑换码解锁时再填一次。\n先免费试试：${url.href}`;
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
      node("li", "把下面的邀请码（或分享图）发给想买题库的朋友。"),
      node("li", "朋友在闲鱼下单时，在备注里写上邀请码，就能便宜 5 元。"),
      node("li", "朋友收到兑换码、在题库里解锁时，再填一次邀请码，就算你邀请成功。"),
      node("li", `邀请成功 1 位：解锁冲刺卷${sprintHint(key)}。`),
      node("li", `邀请满 ${profile.required} 位：返现 ${profile.cashAmount || 15} 元，或送你${target.label}完整版，二选一。`));
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

  window.QuizReferrals = { incoming, load, mount };
})();
