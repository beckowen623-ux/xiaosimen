/* 知识点补缺：按学期 → 章 → 知识点浏览，看知识点卡片，诊断薄弱点，集中练薄弱的知识点。做题沿用主程序的做题页。 */
(() => {
  'use strict';
  const version = '__KNOWLEDGE_VERSION__';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const SELECT_KEY = 'xiaosimen-kp-marked-v1'; // 家长手动勾选的薄弱知识点
  const STATUS = {
    none: { label: '未练', cls: 'kp-none' },
    weak: { label: '薄弱', cls: 'kp-weak' },
    shaky: { label: '待巩固', cls: 'kp-shaky' },
    ok: { label: '基本掌握', cls: 'kp-ok' },
    good: { label: '已掌握', cls: 'kp-good' },
  };
  const state = { subject: 'math', semester: '', view: 'list', point: '', selecting: false, open: new Set() };
  let app;
  const pending = new Map();

  function load(url) {
    if (pending.has(url)) return pending.get(url);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url; s.onload = resolve;
      s.onerror = () => { s.remove(); pending.delete(url); reject(new Error('知识点资料加载失败，请检查网络后重试。')); };
      document.head.appendChild(s);
    });
    pending.set(url, p);
    return p;
  }
  const loadIndex = () => window.KNOWLEDGE_INDEX ? Promise.resolve(window.KNOWLEDGE_INDEX) : load(`./data/knowledge-index.js?v=${version}`).then(() => window.KNOWLEDGE_INDEX);
  async function loadSemester(subject, key) {
    const id = `${subject}-${key}`;
    if (!window.KNOWLEDGE_DATA?.[id]) await load(`./data/knowledge-${id}.js?v=${version}`);
    return window.KNOWLEDGE_DATA[id];
  }

  function readMarked() { try { const v = JSON.parse(localStorage.getItem(SELECT_KEY) || '[]'); return new Set(Array.isArray(v) ? v : []); } catch { return new Set(); } }
  function saveMarked(set) { try { localStorage.setItem(SELECT_KEY, JSON.stringify([...set])); } catch { /* 隐私模式 */ } }

  // 一个知识点的掌握情况：只看做过的题最近一次对不对
  function pointStatus(ids, progress, marked, pointId) {
    let done = 0; let right = 0;
    for (const id of ids) {
      const r = progress.banks?.[id];
      if (!r?.done || (r.revealed && !(r.attempts > 0))) continue;
      done++; if (r.correct) right++;
    }
    const rate = done ? right / done : 0;
    let key = 'none';
    if (done) key = rate < 0.6 ? 'weak' : (rate < 0.85 ? 'shaky' : (done >= 5 ? 'good' : 'ok'));
    if (marked.has(pointId) && (key === 'none' || key === 'ok')) key = 'weak';
    return { key, done, right, total: ids.length, marked: marked.has(pointId) };
  }
  function semesterStats(sem, progress = app.progress()) {
    const marked = readMarked();
    const out = { none: 0, weak: 0, shaky: 0, ok: 0, good: 0, total: 0 };
    for (const c of sem.chapters || []) for (const p of c.points) { out[pointStatus(p.ids, progress, marked, p.id).key]++; out.total++; }
    return out;
  }

  // ---- 首页大卡片 ----
  function homeCardHTML(stage) {
    const idx = window.KNOWLEDGE_INDEX;
    const subj = idx?.subjects?.find(s => s.key === state.subject) || idx?.subjects?.[0];
    const sem = subj?.semesters.find(s => s.stage === stage && s.ready) || subj?.semesters.find(s => s.ready) || subj?.semesters[0];
    const ready = subj?.semesters.filter(s => s.ready) || [];
    const math = subj;
    let body;
    if (!math) {
      body = '<p class="muted">正在加载知识点目录…</p>';
    } else if (sem?.ready) {
      const st = semesterStats(sem);
      const weak = st.weak + st.shaky;
      body = `
        <div class="kp-home-stats">
          <span><b>${st.total}</b>个知识点</span>
          <span class="kp-weak-text"><b>${weak}</b>个待补</span>
          <span><b>${st.ok + st.good}</b>个已掌握</span>
          <span><b>${st.none}</b>个未练</span>
        </div>
        <div class="kp-home-actions">
          <button class="btn primary" type="button" data-kp-go="diag">${st.none === st.total ? '先做一次诊断' : '再诊断一次'}</button>
          <button class="btn" type="button" data-kp-go="${weak ? 'weak' : 'mark'}">${weak ? `练薄弱点（${weak} 个）` : '我来选薄弱点'}</button>
          <button class="btn" type="button" data-kp-sem="sp">专题与压轴</button>
          <button class="btn text-button" type="button" data-kp-go="list">看全部知识点 ›</button>
        </div>`;
    } else {
      body = `<p class="muted">${esc(sem?.label || '')}数学知识点正在整理，已上线：${ready.map(s => esc(s.label)).join('、') || '—'}。</p>
        <div class="kp-home-actions">${ready.map(s => `<button class="btn primary" type="button" data-kp-sem="${s.key}">看${esc(s.label)}样板</button>`).join('')}</div>`;
    }
    return `<section class="card kp-home" id="knowledgeHome">
      <div class="kp-home-head"><span class="kp-badge">主线</span><h2>按知识点补缺补漏</h2></div>
      <div class="kp-sem-tabs" style="margin:8px 0 6px">${(idx?.subjects || []).map(s => `<button type="button" class="btn ${s.key === (subj?.key || 'math') ? 'primary' : ''}" data-kp-subj="${s.key}">${esc(s.label)}</button>`).join('')}</div>
      <p class="kp-home-lead">哪里不会补哪里：先诊断找出薄弱知识点，看一张知识点卡片，再集中练这个点的基础、提高、拓展题，练完再测。</p>
      ${sem ? `<p class="kp-home-sem">当前：<b>${esc(sem.label)}</b>${sem.ready ? ` · ${sem.chapters.length} 章` : ''}</p>` : ''}
      ${body}
    </section>`;
  }
  function wireHome(root) {
    root.querySelectorAll('[data-kp-go]').forEach(b => b.addEventListener('click', () => {
      const go = b.dataset.kpGo;
      void open({ stage: app.stage(), action: go });
    }));
    root.querySelectorAll('[data-kp-sem]').forEach(b => b.addEventListener('click', () => { void open({ subject: state.subject, semester: b.dataset.kpSem }); }));
    root.querySelectorAll('[data-kp-subj]').forEach(b => b.addEventListener('click', () => { state.subject = b.dataset.kpSubj; const el = document.getElementById('knowledgeHome'); if (el) { const wrap = document.createElement('div'); wrap.innerHTML = homeCardHTML(app.stage()); el.replaceWith(wrap.firstElementChild); wireHome(document.getElementById('knowledgeHome')); } }));
  }

  // ---- 页面 ----
  function shell(inner) {
    document.body.classList.remove('practice');
    app.view.innerHTML = `
      <div class="national-header">
        <button type="button" class="btn text-button" data-kp-home>← 返回首页</button>
        <h1 id="kpTitle" tabindex="-1">按知识点补缺补漏</h1>
        <p class="muted">人教版 · 先诊断，再补薄弱点。题目分基础、提高、拓展三档，每题都有解析。</p>
      </div>${inner}`;
    app.view.querySelector('[data-kp-home]').addEventListener('click', () => { leave(); app.home(); });
  }
  function semTabs(idx) {
    const subj = idx.subjects.find(s => s.key === state.subject) || idx.subjects[0];
    const subjBar = idx.subjects.length > 1 ? `<div class="kp-sem-tabs" role="tablist" aria-label="切换学科">${idx.subjects.map(s => `<button type="button" class="btn ${s.key === subj.key ? 'primary' : ''}" data-subj="${s.key}">${esc(s.label)}</button>`).join('')}</div>` : "";
    return subjBar + `<div class="kp-sem-tabs" role="tablist">${subj.semesters.map(s => `<button type="button" class="btn ${s.key === state.semester ? 'primary' : ''}" data-sem="${s.key}" ${s.ready ? '' : 'aria-disabled="true"'}>${esc(s.label)}${s.ready ? '' : '<small>整理中</small>'}</button>`).join('')}</div>`;
  }
  function levelOf(q) { return q.knowledge ? (q.level || 1) : 4; }
  function pointQuestions(data, point, onlyUndone = false) {
    const byId = new Map(data.questions.map(q => [q.id, q]));
    const progress = app.progress();
    let list = [...point.qids, ...point.refs].map(id => byId.get(id)).filter(Boolean)
      .sort((a, b) => levelOf(a) - levelOf(b));
    if (onlyUndone) list = list.filter(q => !progress.banks?.[q.id]?.correct);
    return list;
  }
  function startList(list, emptyMsg) {
    if (!list.length) { app.toast(emptyMsg || '这里没有要练的题了。'); return; }
    if (!app.hasAccess()) {
      const free = list.filter(app.isTrial);
      if (!free.length) { app.unlock('这些知识点的练习题属于完整版：每个知识点前 3 题和诊断题免费，完整版全部开放。'); return; }
      if (free.length < list.length) app.toast(`免费可练 ${free.length} 题，完整版可练全部 ${list.length} 题。`);
    }
    app.practice(list);
  }
  function diagQuestions(data, chapterName = '') {
    const out = [];
    for (const c of data.chapters) {
      if (chapterName && c.name !== chapterName) continue;
      for (const p of c.points) {
        const qs = p.qids.map(id => data.questions.find(q => q.id === id));
        const pick = qs.find(q => q.kpDiag) || qs[0];
        if (pick) out.push(pick);
        if (chapterName) { const second = qs.find(q => q.level === 1); if (second && second !== pick) out.push(second); }
      }
    }
    return out;
  }
  function weakPoints(data) {
    const progress = app.progress(); const marked = readMarked();
    const out = [];
    for (const c of data.chapters) for (const p of c.points) {
      const st = pointStatus([...p.qids, ...p.refs], progress, marked, p.id);
      if (st.key === 'weak' || st.key === 'shaky') out.push(p);
    }
    return out;
  }

  // ---- 薄弱知识点一键 A4 打印卷（卡片 + 分层题 + 独立答案解析页） ----
  function openPrintSheet(data, points, title) {
    if (!points.length) { app.toast("当前没有可打印的知识点。"); return; }
    const paid = app.hasAccess();
    const byId = new Map(data.questions.map(q => [q.id, q]));
    const sections = [];
    const answers = [];
    let qNo = 0;
    let omitted = 0;
    for (const p of points) {
      const allQs = [...p.qids, ...p.refs].map(id => byId.get(id)).filter(Boolean).sort((a, b) => levelOf(a) - levelOf(b));
      const picked = (paid ? allQs : allQs.filter(app.isTrial)).slice(0, paid ? 8 : 4);
      if (allQs.length > picked.length) omitted += (allQs.length - picked.length);
      const qHtml = picked.map(q => {
        qNo++;
        const opts = q.type === "single" && q.options?.length
          ? `<div class="kp-pr-opts">${q.options.map(o => `<span><b>${esc(o.key)}.</b> ${esc(o.text)}</span>`).join("")}</div>` : "";
        const img = q.image ? `<img class="kp-pr-fig" src="${esc(q.image)}" alt="题目配图">` : "";
        const ansStr = Array.isArray(q.answer) ? q.answer.join(" / ") : String(q.answer || "");
        answers.push(`<div class="kp-pr-ans-item"><b>${qNo}.</b> 答案：<b>${esc(ansStr)}</b>　解析：${esc(q.explanation || "")}</div>`);
        return `<div class="kp-pr-q"><p class="kp-pr-stem"><b>${qNo}.</b> ${esc(q.stem)}</p>${img}${opts}</div>`;
      }).join("");
      const c = p.card;
      sections.push(`<section class="kp-pr-sec">
        <div class="kp-pr-card">
          <h3>${esc(p.name)}${p.tag ? ` <small>${esc(p.tag)}</small>` : ""}</h3>
          <p><b>要点：</b>${c.concept.map(esc).join(" ")}</p>
          <p><b>方法：</b>${c.formula.map(esc).join(" ")}</p>
          <p><b>易错：</b>${c.pitfall.map(esc).join(" ")}</p>
        </div>
        ${qHtml || "<p class=\"muted\">（本点暂无可打印题目）</p>"}
      </section>`);
    }
    const old = document.getElementById("kpPrintOverlay");
    if (old) old.remove();
    const overlay = document.createElement("div");
    overlay.id = "kpPrintOverlay";
    overlay.className = "kp-print-overlay";
    overlay.innerHTML = `
      <div class="kp-pr-bar no-print">
        <div class="kp-pr-bar-info"><b>A4 打印预览</b> · 共 ${points.length} 个知识点、${qNo} 道题${!paid && omitted ? `（当前为免费体验版，完整版可印全部 ${qNo + omitted} 题）` : ""}</div>
        <div class="kp-pr-bar-btns">
          ${!paid && omitted ? `<button type="button" class="btn" id="kpPrUnlock">解锁完整版</button>` : ""}
          <button type="button" class="btn primary" id="kpPrGo">立即打印 / 存 PDF</button>
          <button type="button" class="btn" id="kpPrClose">关闭</button>
        </div>
      </div>
      <div class="kp-pr-page">
        <header class="kp-pr-head">
          <h1>${esc(title)}</h1>
          <p>爱丽克丝中考题库（x4m.cc.cd）· ${esc(data.label)} · 姓名：__________　日期：__________　得分：______ / ${qNo}</p>
        </header>
        ${sections.join("")}
        <div class="kp-pr-ans">
          <h2>参考答案与解析（可单独打印给家长核对）</h2>
          ${answers.join("")}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.body.classList.add("kp-printing");
    overlay.querySelector("#kpPrClose").addEventListener("click", () => { overlay.remove(); document.body.classList.remove("kp-printing"); });
    overlay.querySelector("#kpPrGo").addEventListener("click", () => window.print());
    overlay.querySelector("#kpPrUnlock")?.addEventListener("click", () => { overlay.remove(); document.body.classList.remove("kp-printing"); app.unlock("开通完整版（¥19.9 一次买断），即可无限打印全部 221 个知识点的完整练习卷与解析。"); });
  }

  function weakQueue(data, points) {
    const lists = points.map(p => pointQuestions(data, p, true).slice(0, 8));
    return lists.flat();
  }

  async function render() {
    const rev = ++renderRev;
    shell('<p class="muted">正在加载知识点…</p>');
    let idx; let data;
    try {
      idx = await loadIndex();
      const math = idx.subjects.find(s => s.key === state.subject);
      const sem = math.semesters.find(s => s.key === state.semester);
      if (!sem?.ready) { if (rev === renderRev) drawNotReady(idx, sem); return; }
      data = await loadSemester(state.subject, state.semester);
    } catch (error) { if (rev === renderRev) shell(`<p class="card">${esc(error.message)}</p>`); return; }
    if (rev !== renderRev) return;
    if (state.view === 'point') drawPoint(idx, data); else drawList(idx, data);
    window.scrollTo(0, 0);
  }
  let renderRev = 0;

  function drawNotReady(idx, sem) {
    shell(`${semTabs(idx)}<section class="card kp-empty"><h2>${esc(sem?.label || '')}知识点正在整理</h2><p class="muted">先上线的是初一上学期样板（6 章、40 个知识点）。其余学期会按同样的方式陆续补齐。</p><button class="btn primary" type="button" data-sem="7a">看初一上学期</button></section>`);
    wireTabs();
  }
  function wireTabs() {
    app.view.querySelectorAll('[data-subj]').forEach(b => b.addEventListener('click', () => {
      state.subject = b.dataset.subj;
      state.semester = semesterForStage(window.KNOWLEDGE_INDEX, app.stage());
      state.view = 'list'; state.selecting = false; void render();
    }));
    app.view.querySelectorAll('[data-sem]').forEach(b => b.addEventListener('click', () => { state.semester = b.dataset.sem; state.view = 'list'; state.selecting = false; void render(); }));
  }

  function drawList(idx, data) {
    const progress = app.progress(); const marked = readMarked();
    const stats = { none: 0, weak: 0, shaky: 0, ok: 0, good: 0 };
    const rows = data.chapters.map(c => {
      const items = c.points.map(p => {
        const st = pointStatus([...p.qids, ...p.refs], progress, marked, p.id); stats[st.key]++;
        const sel = state.selecting ? `<input type="checkbox" class="kp-check" data-mark="${p.id}" ${marked.has(p.id) ? 'checked' : ''} aria-label="标记为薄弱：${esc(p.name)}">` : '';
        return `<li class="kp-row">${sel}<button type="button" class="kp-point" data-point="${p.id}"><span class="kp-name">${esc(p.name)}${p.tag ? `<em class="kp-tag">${esc(p.tag)}</em>` : ''}</span><span class="kp-meta">${p.qids.length + p.refs.length} 题 · <i class="${STATUS[st.key].cls}">${STATUS[st.key].label}${st.done ? ` ${st.right}/${st.done}` : ''}</i></span></button></li>`;
      }).join('');
      const open = state.open.has(c.name) || state.selecting;
      return `<details class="card kp-chapter" data-chapter="${esc(c.name)}" ${open ? 'open' : ''}><summary><b>${esc(c.name)}</b><span>${c.points.length} 个知识点 ›</span></summary><ol class="kp-list">${items}</ol><div class="kp-chapter-actions"><button class="btn" type="button" data-diag-chapter="${esc(c.name)}">本章诊断（${diagQuestions(data, c.name).length} 题）</button></div></details>`;
    }).join('');
    const weak = weakPoints(data);
    const total = data.chapters.reduce((s, c) => s + c.points.length, 0);
    shell(`${semTabs(idx)}
      <section class="card kp-summary">
        <div class="kp-home-stats"><span><b>${total}</b>个知识点</span><span class="kp-weak-text"><b>${stats.weak + stats.shaky}</b>个待补</span><span><b>${stats.ok + stats.good}</b>个已掌握</span><span><b>${stats.none}</b>个未练</span></div>
        <p class="muted kp-how">怎么用：① 做一次学期诊断（每个知识点 1 题），系统标出薄弱点；② 或者家长直接勾选孩子不会的知识点；③ 点“练薄弱点”集中补，每个点先看卡片再练题；④ 练完再诊断，看薄弱点是否变少。</p>
        <div class="kp-home-actions">
          <button class="btn primary" type="button" data-kp-act="diag">学期诊断（${diagQuestions(data).length} 题）</button>
          <button class="btn" type="button" data-kp-act="weak" ${weak.length ? '' : 'disabled'}>练薄弱点（${weak.length} 个）</button>
          <button class="btn" type="button" data-kp-act="print-weak" ${weak.length ? '' : 'disabled'}>打印薄弱 A4 卷</button>
          <button class="btn ${state.selecting ? 'primary' : ''}" type="button" data-kp-act="select">${state.selecting ? '勾选完成' : '我来选薄弱点'}</button>
        </div>
        ${state.selecting ? '<p class="kp-select-tip">在下面勾选孩子不会的知识点，勾上的会算作“薄弱”，可随时取消。</p>' : ''}
      </section>
      ${rows}
      <p class="muted kp-foot">知识点按人教版新教材整理；带 ★ 的是中考高频，◆ 是易错点。每个知识点前 3 题和诊断题免费，完整版全部开放。</p>`);
    wireTabs();
    app.view.querySelectorAll('details[data-chapter]').forEach(d => d.addEventListener('toggle', () => { if (d.open) state.open.add(d.dataset.chapter); else state.open.delete(d.dataset.chapter); }));
    app.view.querySelectorAll('[data-point]').forEach(b => b.addEventListener('click', () => { state.point = b.dataset.point; state.view = 'point'; void render(); }));
    app.view.querySelectorAll('[data-mark]').forEach(box => box.addEventListener('change', () => {
      const set = readMarked(); if (box.checked) set.add(box.dataset.mark); else set.delete(box.dataset.mark); saveMarked(set);
    }));
    app.view.querySelectorAll('[data-diag-chapter]').forEach(b => b.addEventListener('click', () => startList(diagQuestions(data, b.dataset.diagChapter))));
    app.view.querySelector('[data-kp-act="diag"]').addEventListener('click', () => startList(diagQuestions(data)));
    app.view.querySelector('[data-kp-act="weak"]').addEventListener('click', () => startList(weakQueue(data, weakPoints(data)), '薄弱知识点的题都做对了，可以再诊断一次。'));
    app.view.querySelector('[data-kp-act="print-weak"]').addEventListener('click', () => openPrintSheet(data, weakPoints(data), `${data.label} · 薄弱知识点补缺卷`));
    app.view.querySelector('[data-kp-act="select"]').addEventListener('click', () => { state.selecting = !state.selecting; drawList(idx, data); });
  }

  function drawPoint(idx, data) {
    let point; let chapter;
    for (const c of data.chapters) for (const p of c.points) if (p.id === state.point) { point = p; chapter = c; }
    if (!point) { state.view = 'list'; drawList(idx, data); return; }
    const progress = app.progress(); const marked = readMarked();
    const st = pointStatus([...point.qids, ...point.refs], progress, marked, point.id);
    const all = pointQuestions(data, point);
    const undone = pointQuestions(data, point, true);
    const basic = all.filter(q => levelOf(q) <= 2);
    const adv = all.filter(q => levelOf(q) >= 3);
    const card = point.card;
    const li = arr => arr.map(t => `<li>${esc(t)}</li>`).join('');
    const levels = [1, 2, 3].map(lv => all.filter(q => q.knowledge && q.level === lv).length);
    const flat = chapter.points;
    const i = flat.indexOf(point);
    shell(`${semTabs(idx)}
      <button type="button" class="btn text-button kp-back" data-back>← ${esc(chapter.name)} · 全部知识点</button>
      <article class="card kp-card">
        <p class="kp-crumb">${esc(data.label)} · ${esc(chapter.name)}</p>
        <h2>${esc(point.name)}${point.tag ? `<em class="kp-tag">${esc(point.tag)}</em>` : ''}</h2>
        <p class="kp-state">掌握情况：<i class="${STATUS[st.key].cls}">${STATUS[st.key].label}</i>${st.done ? `（做过 ${st.done} 题，对 ${st.right} 题）` : ''}</p>
        <section><h3>知识要点</h3><ul>${li(card.concept)}</ul></section>
        <section><h3>公式与方法</h3><ul>${li(card.formula)}</ul></section>
        <section class="kp-pitfall"><h3>易错点</h3><ul>${li(card.pitfall)}</ul></section>
        <section class="kp-example"><h3>例题</h3><p>${esc(card.example.q)}</p>${card.example.img ? `<img class="kp-fig" src="${esc(card.example.img)}" alt="例题配图" loading="lazy">` : ''}
          <details><summary>看解答</summary><p>${esc(card.example.a)}</p></details></section>
      </article>
      <section class="card kp-practice">
        <h3>练这个知识点</h3>
        <p class="muted">共 ${all.length} 题：基础 ${levels[0]}、提高 ${levels[1]}、拓展 ${levels[2]}${point.refs.length ? `，另有真题和卷子里的同类题 ${point.refs.length} 道` : ''}。</p>
        <div class="kp-home-actions">
          <button class="btn primary" type="button" data-start="all">从基础练起（${all.length} 题）</button>
          <button class="btn" type="button" data-start="basic" ${basic.length ? '' : 'disabled'}>保底：基础+提高（${basic.length} 题）</button>
          <button class="btn" type="button" data-start="adv" ${adv.length ? '' : 'disabled'}>冲高：拓展/压轴（${adv.length} 题）</button>
          <button class="btn" type="button" data-start="undone" ${undone.length && undone.length < all.length ? '' : 'disabled'}>只练没做对的（${undone.length} 题）</button>
          <button class="btn" type="button" data-start="print-one">打印本点 A4 卷</button>
          <label class="kp-mark"><input type="checkbox" data-mark-one ${marked.has(point.id) ? 'checked' : ''}> 标记为薄弱点</label>
        </div>
      </section>
      <nav class="kp-nav">${i > 0 ? `<button class="btn text-button" type="button" data-goto="${flat[i - 1].id}">‹ ${esc(flat[i - 1].name)}</button>` : '<span></span>'}${i < flat.length - 1 ? `<button class="btn text-button" type="button" data-goto="${flat[i + 1].id}">${esc(flat[i + 1].name)} ›</button>` : ''}</nav>`);
    wireTabs();
    app.view.querySelector('[data-back]').addEventListener('click', () => { state.view = 'list'; state.open.add(chapter.name); void render(); });
    app.view.querySelector('[data-start="all"]').addEventListener('click', () => startList(all));
    app.view.querySelector('[data-start="basic"]').addEventListener('click', () => startList(basic));
    app.view.querySelector('[data-start="adv"]').addEventListener('click', () => startList(adv));
    app.view.querySelector('[data-start="undone"]').addEventListener('click', () => startList(undone));
    app.view.querySelector('[data-start="print-one"]').addEventListener('click', () => openPrintSheet(data, [point], `${data.label} · ${point.name}（补缺专练卷）`));
    app.view.querySelector('[data-mark-one]').addEventListener('change', e => { const set = readMarked(); if (e.target.checked) set.add(point.id); else set.delete(point.id); saveMarked(set); });
    app.view.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => { state.point = b.dataset.goto; void render(); }));
  }

  function semesterForStage(idx, stage) {
    const subj = idx.subjects.find(s => s.key === state.subject) || idx.subjects[0];
    return (subj.semesters.find(s => s.stage === stage && s.ready) || subj.semesters.find(s => s.ready) || subj.semesters[0]).key;
  }

  async function open(opts = {}) {
    const idx = await loadIndex().catch(() => null);
    if (!idx) { app.toast('知识点资料加载失败，请检查网络后重试。'); return; }
    if (opts.subject) state.subject = opts.subject;
    if (opts.semester) state.semester = opts.semester;
    else if (opts.stage) state.semester = semesterForStage(idx, opts.stage);
    else if (!state.semester) state.semester = semesterForStage(idx, app.stage());
    if (opts.point) { state.point = opts.point; state.view = 'point'; } else if (opts.action || opts.stage || opts.semester) state.view = 'list';
    state.selecting = opts.action === 'mark';
    if (location.hash !== '#knowledge') history.replaceState(null, '', '#knowledge');
    const subjObj = idx.subjects.find(s => s.key === state.subject) || idx.subjects[0];
    if (!subjObj.semesters.some(s => s.key === state.semester)) state.semester = semesterForStage(idx, app.stage());
    const sem = subjObj.semesters.find(s => s.key === state.semester);
    if ((opts.action === 'diag' || opts.action === 'weak') && sem?.ready) {
      try {
        const data = await loadSemester(state.subject, state.semester);
        if (opts.action === 'diag') { startList(diagQuestions(data)); return; }
        startList(weakQueue(data, weakPoints(data)), '薄弱知识点的题都做对了，可以再诊断一次。'); return;
      } catch (error) { app.toast(error.message); }
    }
    await render();
    app.view.querySelector('#kpTitle')?.focus({ preventScroll: true });
  }
  function leave() { renderRev++; if (location.hash === '#knowledge') history.replaceState(null, '', location.pathname + location.search); }


  // ---- 诊断交卷“数学提分处方卡” ----
  function analyzeSession(queue, results) {
    const qMap = new Map((queue || []).map(q => [q.id, q]));
    const byKp = new Map();
    for (const [id, r] of results || []) {
      const q = qMap.get(id);
      if (!q?.kpId) continue;
      if (!byKp.has(q.kpId)) byKp.set(q.kpId, { id: q.kpId, name: q.kp || q.kpId, done: 0, right: 0 });
      const item = byKp.get(q.kpId);
      item.done++;
      if (r?.correct) item.right++;
    }
    const tested = [...byKp.values()];
    const weak = tested.filter(x => x.right < x.done);
    const passed = tested.length - weak.length;
    return { tested, weak, passed };
  }
  function summaryRxHTML(queue, results) {
    const { tested, weak, passed } = analyzeSession(queue, results);
    if (!tested.length) return "";
    const minGain = Math.min(35, weak.length * 3);
    const maxGain = Math.min(45, weak.length * 5);
    const listHtml = weak.slice(0, 6).map(x => `<div class="kp-rx-row"><span><b>${esc(x.name)}</b><small>本次对 ${x.right}/${x.done}</small></span><button class="btn" type="button" data-rx-point="${esc(x.id)}">看卡片补漏洞 →</button></div>`).join("");
    const headline = weak.length
      ? `本次共检测 <b>${tested.length}</b> 个知识点：已过关 <b>${passed}</b> 个，发现 <b>${weak.length}</b> 个薄弱漏洞（优先补齐预计可抢回 <b>${minGain}～${maxGain} 分</b>）。`
      : `本次检测的 <b>${tested.length}</b> 个知识点全部过关！建议直接进入“专题与压轴”挑战中考拉分题。`;
    const upsell = !app.hasAccess() && weak.length
      ? `<div class="kp-rx-upsell"><span>完整版 ¥19.9 一次买断，解锁全部 221 个知识点、1,768 道分层题＋压轴专题＋无限 A4 打印（3 台设备共用）。</span><button class="btn primary" type="button" id="kpRxUnlock">解锁完整版</button></div>`
      : "";
    return `<div class="kp-rx">
      <div class="kp-rx-head"><span class="kp-badge">提分处方</span><h3>本次学情诊断建议</h3></div>
      <p class="kp-rx-lead">${headline}</p>
      ${listHtml ? `<div class="kp-rx-list">${listHtml}</div>` : ""}
      <div class="kp-rx-actions">
        ${weak.length ? `<button class="btn primary" type="button" id="kpRxPractice">集中练这 ${weak.length} 个薄弱点</button><button class="btn" type="button" id="kpRxPrint">一键打印本次薄弱 A4 卷</button>` : `<button class="btn primary" type="button" id="kpRxSp">去挑战专题与压轴 →</button>`}
      </div>
      ${upsell}
    </div>`;
  }
  function wireSummaryRx(root, queue, results) {
    const { weak } = analyzeSession(queue, results);
    const firstParts = (queue?.[0]?.kpId || "").split("-");
    const subjKey = firstParts[0] || state.subject || "math";
    const semKey = firstParts[1] || state.semester || "8a";
    root.querySelectorAll("[data-rx-point]").forEach(b => b.addEventListener("click", () => {
      const pid = b.dataset.rxPoint;
      const parts = pid.split("-");
      void open({ subject: parts[0] || subjKey, semester: parts[1] || semKey, point: pid });
    }));
    root.querySelector("#kpRxPractice")?.addEventListener("click", async () => {
      const data = await loadSemester(subjKey, semKey);
      const idSet = new Set(weak.map(x => x.id));
      const pts = [];
      for (const c of data.chapters) for (const p of c.points) if (idSet.has(p.id)) pts.push(p);
      startList(weakQueue(data, pts), "这些薄弱点的题目都已做对。");
    });
    root.querySelector("#kpRxPrint")?.addEventListener("click", async () => {
      const data = await loadSemester(subjKey, semKey);
      const idSet = new Set(weak.map(x => x.id));
      const pts = [];
      for (const c of data.chapters) for (const p of c.points) if (idSet.has(p.id)) pts.push(p);
      openPrintSheet(data, pts, `${data.label} · 本次诊断薄弱知识点补缺卷`);
    });
    root.querySelector("#kpRxSp")?.addEventListener("click", () => { void open({ semester: "sp" }); });
    root.querySelector("#kpRxUnlock")?.addEventListener("click", () => app.unlock("开通完整版（¥19.9 一次买断），即可做完整套薄弱知识点分层题、压轴专题并无限打印 A4 补缺卷。"));
  }

  window.KnowledgeHub = { attach: options => { app = options; }, open, leave, loadIndex, homeCardHTML, wireHome, summaryRxHTML, wireSummaryRx };
})();
