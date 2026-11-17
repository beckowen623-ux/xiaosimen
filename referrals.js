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
    const progress = profile.rewardCode
      ? `已发放${target.label}奖励。`
      : profile.invited >= profile.required
        ? "邀请已达标，等待作者发放奖励。"
        : `已经有 ${profile.invited} 位朋友用你的邀请码买了题库，还差 ${Math.max(0, profile.required - profile.invited)} 位。`;

    const box = node("details", "", "referral-box");
    try { box.open = localStorage.getItem(OPEN_KEY) === "1"; } catch { /* 隐私模式 */ }
    box.addEventListener("toggle", () => { try { localStorage.setItem(OPEN_KEY, box.open ? "1" : "0"); } catch { /* 隐私模式 */ } });
    const done = Math.min(profile.invited, profile.required);
    const summary = node("summary", "", "referral-summary");
    summary.append(node("span", "🎁 邀请好友", "referral-title"),
      node("span", profile.rewardCode ? "奖励已发放" : `朋友省 5 元 · 已邀 ${done}/${profile.required}`, "referral-badge"));
    box.append(summary);

    const steps = node("ol", "", "referral-steps");
    steps.append(
      node("li", "把下面的邀请码（或分享图）发给想买题库的朋友。"),
      node("li", "朋友在闲鱼下单时，在备注里写上邀请码，就能便宜 5 元。"),
      node("li", "朋友收到兑换码、在题库里解锁时，再填一次邀请码，就算你邀请成功。"),
      node("li", `成功邀请 ${profile.required} 位，送你${target.label}完整版。`));
    box.append(node("p", progress, "referral-progress"), steps, node("strong", profile.code, "referral-code"));
    const actions = node("div", "", "referral-actions");
    actions.append(button("复制邀请文案", () => copyText(share, message)),
      button("保存分享图", () => saveCard(profile.code, site, url, message)));
    box.append(actions);

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
