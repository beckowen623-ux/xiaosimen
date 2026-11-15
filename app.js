/* 小四门刷题 · 福州人教版 · 纯静态 + localStorage
 * 仿 beckowen623-ux/quiz-bank-app 的结构（懒加载 .js 题库、localStorage 进度、SRS 错题复习），
 * 去掉了付费锁 / 兑换码 / admin / 计算器 / 主观题分支。只做单选、多选、判断。
 */
'use strict';
const STORAGE_KEY = 'xiaosimen-quiz-v1';
const GROWTH_KEY = 'xiaosimen-growth-v1';
const REVIEW_INTERVALS = [1, 3, 7]; // 错题复习间隔（天）：答错后第1天、第3天、第7天
const SUBJECT_ORDER = ['daode', 'lishi', 'dili', 'shengwu'];
const SUBJECTS = {
  daode:   { label: '道德与法治', short: '道法', file: './data/daode.js',   global: 'XIAOSIMEN_BANKS' },
  lishi:   { label: '历史',       short: '历史', file: './data/lishi.js',   global: 'XIAOSIMEN_BANKS' },
  dili:    { label: '地理',       short: '地理', file: './data/dili.js',    global: 'XIAOSIMEN_BANKS' },
  shengwu: { label: '生物',       short: '生物', file: './data/shengwu.js', global: 'XIAOSIMEN_BANKS' },
};
// 年级+学期，共 6 档。stage 是机器值，grade 是中文值，存在每道题上。
const STAGES = [
  { stage: '7-up',   grade: '七上', label: '初一上学期', order: 0 },
  { stage: '7-down', grade: '七下', label: '初一下学期', order: 1 },
  { stage: '8-up',   grade: '八上', label: '初二上学期', order: 2 },
  { stage: '8-down', grade: '八下', label: '初二下学期', order: 3 },
  { stage: '9-up',   grade: '九上', label: '初三上学期', order: 4 },
  { stage: '9-down', grade: '九下', label: '初三下学期', order: 5 },
];
const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.stage, s]));
// 福州：地理、生物在初二下学期会考；道法、历史在初三中考。
const EXAM_STAGE = { dili: '8-down', shengwu: '8-down', daode: '9-down', lishi: '9-down' };

function activeSubjectsForStage(stage) {
  // 初三：地理、生物已考完，自动只留道法、历史。
  if (stage === '9-up' || stage === '9-down') return ['daode', 'lishi'];
  return [...SUBJECT_ORDER];
}
function stageOrder(stage) { return STAGE_MAP[stage] ? STAGE_MAP[stage].order : 0; }
function todayStr(offsetDays) {
  const d = new Date(); d.setDate(d.getDate() + (offsetDays || 0));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function interleave(groups) {
  // 四门轮着刷：每门按章节顺序取一道，轮一圈，再取下一道。保证一门不连续刷到底。
  const out = []; const lists = groups.map(g => [...g]); let i = 0, added = true;
  while (added) { added = false; for (const list of lists) { if (list[i] !== undefined) { out.push(list[i]); added = true; } } i++; }
  return out;
}
function dedupeById(list) { const seen = new Set(); return list.filter(q => { if (seen.has(q.id)) return false; seen.add(q.id); return true; }); }

// ---------- 进度（localStorage） ----------
function loadProgress() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { banks: {} }; } catch (e) { return { banks: {} }; } }
function saveProgress(p) { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
function qProgress(p, qid) { return (p.banks && p.banks[qid]) || null; }
function loadGrowth() { try { return JSON.parse(localStorage.getItem(GROWTH_KEY)) || { studyDays: [] }; } catch (e) { return { studyDays: [] }; } }
function saveGrowth(g) { localStorage.setItem(GROWTH_KEY, JSON.stringify(g)); }
function markStudiedToday() {
  const g = loadGrowth(); const t = todayStr();
  if (!g.studyDays.includes(t)) { g.studyDays.push(t); saveGrowth(g); }
  return g.studyDays.length;
}
function streakDays() {
  const g = loadGrowth(); const days = new Set(g.studyDays); let n = 0; const d = new Date();
  while (true) { const s = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); if (!days.has(s)) break; n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---------- 题库加载（懒加载 .js，全局变量合并） ----------
const loadedScripts = new Set();
function loadScript(src) {
  if (loadedScripts.has(src)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = src; s.onload = () => { loadedScripts.add(src); resolve(); }; s.onerror = reject;
    document.head.appendChild(s);
  });
}
async function ensureBanks(subjectKeys) {
  for (const key of subjectKeys) await loadScript(SUBJECTS[key].file + '?v=1');
  return window.XIAOSIMEN_BANKS || {};
}
function allQuestions(banks, subjectKeys) {
  const out = [];
  for (const key of subjectKeys) {
    const bank = banks[key]; if (!bank) continue;
    for (const q of bank.questions || []) out.push({ ...q, subject: key, subjectLabel: SUBJECTS[key].label });
  }
  return out;
}
function dueQuestions(all, progress) {
  const today = todayStr();
  return all.filter(q => {
    const p = qProgress(progress, q.id);
    return p && p.srs && !p.mastered && p.srs.due && p.srs.due <= today;
  }).sort((a, b) => {
    const pa = qProgress(progress, a.id).srs.due, pb = qProgress(progress, b.id).srs.due;
    return pa < pb ? -1 : pa > pb ? 1 : 0;
  });
}

// ---------- 核心：自动刷题顺序 buildQueue(stage) ----------
// 规则（也在 README.md 里写清楚）：
//  1. 到期错题最先：SRS 到期（1/3/7 天）的题插在队首；
//  2. 平时：当前学期新课按人教版章节顺序，四门轮着刷（interleave）；
//  3. 初二下学期：新课后自动回滚复习七年级到八年级地理、生物（备战会考），
//     包括地理/生物的总复习章（九上/九下章，内容是七、八年级总复习，提前用于会考冲刺）；
//  4. 初三上学期：只留道法、历史新课，之后轻量复习七、八年级道法、历史；
//  5. 初三下学期：新课后自动进七到九年级道法、历史总复习。
function buildQueue(stage, banks, progress) {
  const active = activeSubjectsForStage(stage);
  const all = allQuestions(banks, SUBJECT_ORDER); // 全部题，用于错题/复习判断
  const order = stageOrder(stage);
  const due = dueQuestions(all.filter(q => active.includes(q.subject)), progress);
  // 当前学期新课：按科目分组，每组内按 chapterId、number 排序，再四门轮刷。
  const currentGroups = active.map(key =>
    all.filter(q => q.subject === key && q.stage === stage)
      .sort((a, b) => (a.chapterId - b.chapterId) || (a.number - b.number)));
  const current = interleave(currentGroups);
  let review = [];
  if (stage === '8-down') {
    // 地理、生物会考回滚：七上到八上 + 总复习章（dili/shengwu 的 5、6 章）。
    const rb = ['dili', 'shengwu'].map(key =>
      all.filter(q => q.subject === key && (stageOrder(q.stage) < order || q.chapterId >= 5))
        .sort((a, b) => (a.chapterId - b.chapterId) || (a.number - b.number)));
    review = interleave(rb);
  } else if (stage === '9-up') {
    const rb = ['daode', 'lishi'].map(key =>
      all.filter(q => q.subject === key && stageOrder(q.stage) < order)
        .sort((a, b) => (a.chapterId - b.chapterId) || (a.number - b.number)));
    review = interleave(rb);
  } else if (stage === '9-down') {
    const rb = ['daode', 'lishi'].map(key =>
      all.filter(q => q.subject === key && stageOrder(q.stage) < order)
        .sort((a, b) => (a.chapterId - b.chapterId) || (a.number - b.number)));
    review = interleave(rb);
  } else if (order > 0) {
    // 七下、八上：新课后轻量复习前面学期的同科内容。
    const rb = active.map(key =>
      all.filter(q => q.subject === key && stageOrder(q.stage) < order)
        .sort((a, b) => (a.chapterId - b.chapterId) || (a.number - b.number)));
    review = interleave(rb);
  }
  return dedupeById([...due, ...current, ...review]);
}
// 按模式筛队列。注意：随机 20 题是真截取（原仓库的“随机20题”是假的，只 shuffle 不 slice）。
function applyMode(queue, mode, progress) {
  const p = progress || loadProgress();
  const isDone = q => { const r = qProgress(p, q.id); return r && r.done; };
  const isWrong = q => { const r = qProgress(p, q.id); return r && r.wrong; };
  const isFav = q => { const r = qProgress(p, q.id); return r && r.favorite; };
  switch (mode) {
    case 'random': return shuffle(queue);
    case 'random20': return shuffle(queue).slice(0, 20);
    case 'unfinished': return queue.filter(q => !isDone(q));
    case 'wrong': return queue.filter(isWrong);
    case 'favorite': return queue.filter(isFav);
    case 'everWrong': return queue.filter(q => { const r = qProgress(p, q.id); return r && (r.wrong || (r.wrongCount || 0) > 0); });
    case 'due': return dueQuestions(queue, p);
    case 'all': default: return queue;
  }
}
function isSameSet(a, b) { if (!a || !b || a.length !== b.length) return false; const s = new Set(a); return b.every(x => s.has(x)); }
function recordAnswer(q, selected, correct) {
  const p = loadProgress(); p.banks = p.banks || {};
  const prev = p.banks[q.id] || { attempts: 0, wrongCount: 0 };
  const next = { ...prev, done: true, correct, wrong: !correct, selected: [...selected], attempts: (prev.attempts || 0) + 1, lastAt: Date.now() };
  if (!correct) {
    next.wrongCount = (prev.wrongCount || 0) + 1;
    next.srs = { stage: 0, due: todayStr(REVIEW_INTERVALS[0]) }; // 明天复习
    next.mastered = false;
  } else if (prev.srs && !prev.mastered) {
    const stage = (prev.srs.stage || 0) + 1;
    if (stage >= REVIEW_INTERVALS.length) { next.srs = null; next.mastered = true; }
    else next.srs = { stage, due: todayStr(REVIEW_INTERVALS[stage]) };
  }
  p.banks[q.id] = next; saveProgress(p); markStudiedToday();
  return next;
}
function toggleFavorite(qid) {
  const p = loadProgress(); p.banks = p.banks || {}; const prev = p.banks[qid] || {};
  p.banks[qid] = { ...prev, favorite: !prev.favorite }; saveProgress(p); return p.banks[qid].favorite;
}
// 每日一题：按日期轮换
function dailyQuestion() {
  const d = window.DAILY_QUESTIONS_XIAOSIMEN; if (!d || !d.questions || !d.questions.length) return null;
  const start = new Date(d.startDate + 'T00:00:00+08:00'); const now = new Date();
  const days = Math.max(0, Math.floor((now - start) / 86400000));
  return d.questions[days % d.questions.length];
}

// ---------- 界面 ----------
const view = document.getElementById('view');
const state = { stage: '7-up', mode: 'all', queue: [], idx: 0, selected: [], submitted: false, subjectFilter: '', chapterFilter: '', keyword: '' };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function stageLabel(stage) { const s = STAGE_MAP[stage]; return s ? s.label : stage; }
function refreshStreak() { const el = document.getElementById('streakDays'); if (el) el.textContent = String(streakDays()); }

let autoNextTimer = null;
function clearAutoNext() { if (autoNextTimer) { clearTimeout(autoNextTimer); autoNextTimer = null; } }
async function renderHome() {
  clearAutoNext(); // 回首页后，答对自动跳题的定时器必须取消，否则会把用户又拉回刷题页
  refreshStreak();
  const banks = await ensureBanks(SUBJECT_ORDER);
  const progress = loadProgress();
  const daily = dailyQuestion();
  const dailyDone = daily ? !!qProgress(progress, daily.id) : false;
  const counts = {};
  for (const key of SUBJECT_ORDER) counts[key] = (banks[key] && banks[key].total) || 0;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  view.innerHTML = `
  <section class="card">
    <h2>1 · 选年级和学期</h2>
    <p class="muted">选完自动排刷题顺序：到期错题最先 → 本学期新课四门轮刷 → 到考前自动回滚复习。</p>
    <div class="grid">${STAGES.map(s => `
      <button class="btn ${state.stage === s.stage ? 'selected' : ''}" data-stage="${s.stage}">
        ${esc(s.label)}<span class="sub">${s.stage === '8-down' ? '地理、生物会考前' : s.stage === '9-down' ? '道法、历史中考前总复习' : '新课 + 前面内容复习'}</span>
      </button>`).join('')}</div>
    <p class="muted" id="stageHint"></p>
  </section>
  <section class="card">
    <h2>2 · 开始刷题</h2>
    <div class="row">
      <button class="btn primary" id="startBtn">按这个顺序开始做 →</button>
      <button class="btn small" id="start20Btn">每天 20 题</button>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn small" data-mode="random">随机顺序</button>
      <button class="btn small" data-mode="unfinished">只做未做题</button>
      <button class="btn small" data-mode="wrong">错题本</button>
      <button class="btn small" data-mode="due">今日待复习</button>
      <button class="btn small" data-mode="favorite">收藏题</button>
    </div>
    <p class="muted">当前档：<b id="curStage">${esc(stageLabel(state.stage))}</b> · 自动包含科目：${activeSubjectsForStage(state.stage).map(k => SUBJECTS[k].label).join('、')}</p>
    <div id="queueInfo" class="muted"></div>
  </section>
  <section class="card">
    <h2>每日一题</h2>
    ${daily ? `<p><b>[${esc(daily.subjectLabel || daily.subject || '')}]</b> ${esc(daily.stem)}</p>
    <p class="muted">${dailyDone ? '今天这道已做过' : '每天一题，按日期轮换'}</p>
    <button class="btn small" id="dailyBtn">做今日一题</button>` : '<p class="muted">暂无每日一题</p>'}
  </section>
  <section class="card">
    <h2>题库与进度</h2>
    ${SUBJECT_ORDER.map(k => `<div class="kv"><span>${esc(SUBJECTS[k].label)}</span><span>${counts[k]} 道 · 会考/中考：${EXAM_STAGE[k] === '8-down' ? '初二会考' : '初三中考'}</span></div>`).join('')}
    <div class="kv"><span>合计</span><span>${total} 道选择题</span></div>
    <h3>按章节 / 关键词找题</h3>
    <input type="search" id="searchBox" placeholder="搜章节、题干、知识点，如：地球、宪法、秦始皇" value="${esc(state.keyword)}">
    <div id="searchOut" style="margin-top:8px"></div>
    <p style="margin-top:12px"><button class="btn small" id="resetBtn">清空本机进度</button></p>
  </section>`;
  document.querySelectorAll('[data-stage]').forEach(b => b.addEventListener('click', () => { state.stage = b.dataset.stage; renderHome(); }));
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => startPractice(b.dataset.mode)));
  document.getElementById('startBtn').addEventListener('click', () => startPractice('all'));
  document.getElementById('start20Btn').addEventListener('click', () => startPractice('random20'));
  document.getElementById('dailyBtn').addEventListener('click', () => { if (daily) { state.queue = [daily]; state.idx = 0; state.mode = 'daily'; renderPractice(); } });
  document.getElementById('resetBtn').addEventListener('click', () => { if (confirm('确定清空本机所有刷题进度吗？')) { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(GROWTH_KEY); renderHome(); } });
  const searchBox = document.getElementById('searchBox');
  searchBox.addEventListener('input', () => { state.keyword = searchBox.value; doSearch(banks); });
  updateQueueInfo(banks, progress);
  if (state.keyword) doSearch(banks);
}
function updateQueueInfo(banks, progress) {
  const el = document.getElementById('queueInfo'); if (!el) return;
  const q = buildQueue(state.stage, banks, progress);
  const dueN = dueQuestions(allQuestions(banks, activeSubjectsForStage(state.stage)), progress).length;
  const orderNote = state.stage === '8-down' ? '先刷八下新课，再回滚复习七、八年级地理、生物，备战会考。'
    : state.stage === '9-down' ? '先刷九下道法、历史新课，再进七到九年级道法、历史总复习。'
    : state.stage === '9-up' ? '只刷道法、历史新课，之后复习七、八年级道法、历史。'
    : '先刷本学期新课（四门轮着刷），再复习前面学期的内容。';
  el.textContent = `这个档自动排好 ${q.length} 道题（含到期错题 ${dueN} 道在最前面）。${orderNote}`;
  const hint = document.getElementById('stageHint');
  if (hint) hint.textContent = state.stage === '8-down' ? '本学期末地理、生物会考：刷完八下新课会自动回滚七、八年级地理、生物。'
    : (state.stage === '9-up' || state.stage === '9-down') ? '地理、生物已考完，本档只排道法、历史。'
    : '本学期新课四门轮着刷，前面学过的内容也会排在后面复习。';
}
function doSearch(banks) {
  const out = document.getElementById('searchOut'); if (!out) return;
  const kw = (state.keyword || '').trim(); if (!kw) { out.innerHTML = ''; return; }
  const all = allQuestions(banks, SUBJECT_ORDER);
  const hits = all.filter(q => (q.chapter + q.stem + (q.material || '') + (q.explanation || '')).includes(kw)).slice(0, 20);
  out.innerHTML = hits.length ? hits.map(q => `<div class="kv"><span>[${esc(q.subjectLabel)} · ${esc(q.chapter)}] ${esc(q.stem.slice(0, 60))}…</span><button class="btn small" data-qid="${esc(q.id)}">做这道</button></div>`).join('') : '<p class="muted">没找到相关题目，换个关键词试试。</p>';
  out.querySelectorAll('[data-qid]').forEach(b => b.addEventListener('click', () => {
    const q = all.find(x => x.id === b.dataset.qid); if (q) { state.queue = [q]; state.idx = 0; state.mode = 'single'; renderPractice(); }
  }));
}
async function startPractice(mode) {
  const banks = await ensureBanks(SUBJECT_ORDER);
  const progress = loadProgress();
  const base = buildQueue(state.stage, banks, progress);
  const queue = applyMode(base, mode, progress);
  if (!queue.length) { alert(mode === 'wrong' ? '错题本还是空的，先去刷题吧。' : mode === 'due' ? '今天没有到期要复习的错题。' : '这个模式下没有题目。'); return; }
  state.mode = mode; state.queue = queue; state.idx = 0;
  // 断点续做：回到上次没做完的那道
  const lastId = (progress.banks && progress.banks.__meta && progress.banks.__meta.lastQuestionId) || '';
  const li = queue.findIndex(q => q.id === lastId);
  if (li > 0) state.idx = li;
  renderPractice();
}
function renderPractice() {
  clearAutoNext(); // 手动跳题/答题卡跳题时，取消待触发的自动跳题，避免连跳两道
  refreshStreak();
  const q = state.queue[state.idx]; if (!q) { renderHome(); return; }
  const progress = loadProgress(); const rec = qProgress(progress, q.id) || {};
  const total = state.queue.length;
  view.innerHTML = `
  <section class="card">
    <p><button class="btn small" id="backBtn">← 回首页</button>
    <span class="chip">${esc(q.subjectLabel)}</span><span class="chip">${esc(q.chapter)}</span><span class="chip">${esc(q.grade || '')}</span><span class="chip">${q.type === 'single' ? '单选' : q.type === 'multiple' ? '多选' : '判断'}</span></p>
    <div class="progress"><i style="width:${Math.round(((state.idx) / total) * 100)}%"></i></div>
    <p class="muted">第 ${state.idx + 1} / ${total} 题 · ${esc(stageLabel(state.stage))} · ${esc(state.mode)}</p>
    <h2 style="font-size:18px">${esc(q.stem)}</h2>
    <div id="opts"></div>
    <div id="result"></div>
    <div class="row" style="margin-top:12px">
      <button class="btn small" id="submitBtn">提交</button>
      <button class="btn small" id="revealBtn">查看答案</button>
      <button class="btn small" id="favBtn">${rec.favorite ? '★ 已收藏' : '☆ 收藏'}</button>
      <button class="btn small" id="nextBtn">下一题 →</button>
    </div>
    <h3>答题卡</h3>
    <div class="nav">${state.queue.map((qq, i) => {
      const r = qProgress(progress, qq.id) || {};
      return `<button data-i="${i}" class="${i === state.idx ? 'cur' : ''} ${r.done ? (r.wrong ? 'wrong' : 'done') : ''}">${i + 1}</button>`;
    }).join('')}</div>
  </section>`;
  const optsEl = document.getElementById('opts');
  const opts = q.type === 'judge' ? [{ key: 'true', text: '正确' }, { key: 'false', text: '错误' }] : (q.options || []);
  state.selected = []; state.submitted = false;
  opts.forEach(o => {
    const b = document.createElement('button'); b.className = 'opt'; b.textContent = o.key + '. ' + o.text;
    b.addEventListener('click', () => {
      if (state.submitted) return;
      if (q.type === 'multiple') {
        const max = q.maxSelections || 4;
        if (state.selected.includes(o.key)) state.selected = state.selected.filter(x => x !== o.key);
        else if (state.selected.length < max) state.selected.push(o.key);
        [...optsEl.children].forEach((el, i) => el.classList.toggle('picked', state.selected.includes(opts[i].key)));
      } else { state.selected = [o.key]; [...optsEl.children].forEach(el => el.classList.remove('picked')); b.classList.add('picked'); }
    });
    optsEl.appendChild(b);
  });
  document.getElementById('backBtn').addEventListener('click', renderHome);
  document.getElementById('favBtn').addEventListener('click', e => { const f = toggleFavorite(q.id); e.target.textContent = f ? '★ 已收藏' : '☆ 收藏'; });
  document.getElementById('nextBtn').addEventListener('click', () => { if (state.idx < state.queue.length - 1) { state.idx++; renderPractice(); } else renderHome(); });
  document.querySelectorAll('.nav button').forEach(b => b.addEventListener('click', () => { state.idx = Number(b.dataset.i); renderPractice(); }));
  document.getElementById('revealBtn').addEventListener('click', () => {
    // “查看答案”只记做过、不记答对（原仓库会把查看答案算成答对，正确率会注水，已改掉）。
    const p = loadProgress(); p.banks = p.banks || {}; const prev = p.banks[q.id] || {};
    p.banks[q.id] = { ...prev, done: true, revealed: true }; saveProgress(p);
    showResult(q, null, false);
  });
  document.getElementById('submitBtn').addEventListener('click', () => {
    if (!state.selected.length) { alert('请先选一个答案'); return; }
    if (q.type === 'multiple' && state.selected.length < 2) { alert('多选题至少选 2 项才能提交'); return; }
    const correct = isSameSet(state.selected, q.answer);
    recordAnswer(q, state.selected, correct);
    const p = loadProgress(); p.banks = p.banks || {}; p.banks.__meta = { lastQuestionId: q.id }; saveProgress(p);
    showResult(q, state.selected, correct);
  });
  function showResult(qq, selected, correct) {
    state.submitted = true;
    [...optsEl.children].forEach((el, i) => {
      const key = opts[i].key;
      if (qq.answer.includes(key)) el.classList.add('right');
      if (selected && selected.includes(key) && !qq.answer.includes(key)) el.classList.add('wrong');
    });
    document.getElementById('result').innerHTML = `<div class="explain">
      <b>${selected === null ? '答案' : correct ? '答对了 ✓' : '答错了 ✗'}</b> 正确答案：${esc(qq.answer.join('、'))}
      <p>${esc(qq.explanation || '')}</p>
      ${qq.trap ? `<p class="muted">易错点：${esc(qq.trap)}</p>` : ''}
    </div>`;
    if (selected !== null && correct) { clearAutoNext(); autoNextTimer = setTimeout(() => { autoNextTimer = null; if (state.idx < state.queue.length - 1) { state.idx++; renderPractice(); } }, 900); }
  }
}
renderHome();
