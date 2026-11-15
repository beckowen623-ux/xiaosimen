/* 小四门刷题 · 福州人教版 · 纯静态 + localStorage
 * 仿 beckowen623-ux/quiz-bank-app 的结构（懒加载 .js 题库、localStorage 进度、SRS 错题复习），
 * 去掉了付费锁 / 兑换码 / admin / 计算器 / 主观题分支。只做单选、多选、判断。
 */
'use strict';
const STORAGE_KEY = 'xiaosimen-quiz-v1';
const GROWTH_KEY = 'xiaosimen-growth-v1';
const REVIEW_INTERVALS = [1, 3, 7, 14]; // 错题复习间隔（天）：答对进一级，答错退回第 1 级；连续答对 4 次算掌握
// ---------- 打卡 / 积分 / 补打规则（见 DESIGN-checkin.md） ----------
const CHECKIN_POINTS = { checkin: 10, correct: 1, reviewCorrect: 2, accuracy90: 5, perfect: 10, weekFull: 30 };
const POINT_MILESTONES = [
  { points: 100, name: '坚持者' }, { points: 300, name: '刷题达人' },
  { points: 600, name: '小四门学霸' }, { points: 1000, name: '满分冲刺者' },
];
const STREAK_BADGES = [
  { days: 3, name: '小火苗' }, { days: 7, name: '周冠军' },
  { days: 14, name: '半月坚持' }, { days: 30, name: '月度之星' },
];
const MAKEUP_MONTH_LIMIT = 3; // 每月最多补打 3 次
const DAILY_FRESH_TARGET = 20; // 每天 20 道新题
const MAKEUP_FRESH_TARGET = 40; // 补打当天要做 40 道新题（双倍量）
const REMEDIATION_MODES = ['clearWrong', 'wrong', 'due', 'everWrong'];
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
// 日期一律按中国日期（UTC+8，与每日一题一致），不按浏览器本地时区。
function chinaParts(offsetDays) {
  const ms = Date.now() + 8 * 3600000 + (offsetDays || 0) * 86400000;
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() };
}
function todayStr(offsetDays) {
  const c = chinaParts(offsetDays);
  return c.y + '-' + String(c.m).padStart(2, '0') + '-' + String(c.d).padStart(2, '0');
}
function dateParts(s) { const p = String(s || '').split('-').map(Number); return { y: p[0] || 0, m: p[1] || 1, d: p[2] || 1 }; }
function weekdayOf(s) { const p = dateParts(s); return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); } // 0=周日
function addDays(s, n) {
  const p = dateParts(s); const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0');
}
function daysBetween(a, b) { // 两个 YYYY-MM-DD 相差几天（b - a）
  const pa = dateParts(a), pb = dateParts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}
function weekKeyOf(s) { // 所在周的周一（YYYY-MM-DD），用于每周全勤统计
  const dow = (weekdayOf(s) + 6) % 7; // 周一=0
  return addDays(s, -dow);
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
// ---------- 打卡 / 积分（存在 progress.checkin 里） ----------
// checkin: { lastDate, streak, totalPoints, pointsToday, pointsDate, badges:[], weekFull, weekKey, weekDays:[],
//   dayStats:{ date, first:{qid:1/0} }, scored:{qid:分}, makeup:{ countThisMonth, month }, lastMakeupDate, clear:{ date, done:[qid] } }
function defaultCheckin() {
  return { lastDate: '', streak: 0, totalPoints: 0, pointsToday: 0, pointsDate: '', badges: [], weekFull: false, weekKey: '', weekDays: [], dayStats: { date: '', first: {} }, scored: {}, makeup: { countThisMonth: 0, month: '' }, lastMakeupDate: '', clear: { date: '', done: [] } };
}
function getCheckin(p) {
  p.checkin = Object.assign(defaultCheckin(), p.checkin || {});
  const today = todayStr();
  if (p.checkin.pointsDate !== today) { p.checkin.pointsToday = 0; p.checkin.pointsDate = today; p.checkin.scored = {}; }
  if (!p.checkin.dayStats || p.checkin.dayStats.date !== today) p.checkin.dayStats = { date: today, first: {} };
  if (!p.checkin.clear || p.checkin.clear.date !== today) p.checkin.clear = { date: today, done: [] };
  if (!p.checkin.makeup || p.checkin.makeup.month !== today.slice(0, 7)) p.checkin.makeup = { countThisMonth: 0, month: today.slice(0, 7) };
  if (!Array.isArray(p.checkin.badges)) p.checkin.badges = [];
  if (!Array.isArray(p.checkin.weekDays)) p.checkin.weekDays = [];
  return p.checkin;
}
// 今日待清的错题：未掌握且有 SRS 记录的题（= 昨天错过的 + 到期要复习的），减去今天已清完的。
function clearWrongList(all, progress) {
  const c = getCheckin(progress);
  const doneSet = new Set(c.clear.done || []);
  return all.filter(q => {
    const p = qProgress(progress, q.id);
    if (!p || p.mastered || !p.srs) return false;
    if (doneSet.has(q.id)) return false;
    return true;
  }).sort((a, b) => {
    const pa = qProgress(progress, a.id), pb = qProgress(progress, b.id);
    const da = (pa.srs && pa.srs.due) || '9999', db = (pb.srs && pb.srs.due) || '9999';
    return da < db ? -1 : da > db ? 1 : ((pb.wrongCount || 0) - (pa.wrongCount || 0));
  });
}
// 各章正确率（至少做过 3 道才统计；“查看答案”的不计入）
function chapterStats(all, progress) {
  const map = {};
  for (const q of all) {
    const key = q.subject + '|' + q.chapterId;
    if (!map[key]) map[key] = { subject: q.subject, subjectLabel: q.subjectLabel, chapterId: q.chapterId, chapter: q.chapter, attempted: 0, correct: 0 };
    const r = qProgress(progress, q.id);
    if (r && r.done && !r.revealed) { map[key].attempted++; if (r.correct) map[key].correct++; }
  }
  return Object.values(map);
}
function weakChapters(all, progress) {
  return chapterStats(all, progress)
    .filter(c => c.attempted >= 3 && c.correct / c.attempted < 0.6)
    .sort((a, b) => (a.correct / a.attempted) - (b.correct / b.attempted));
}
// 打卡状态：今天能不能打、是不是补打、还差什么
function checkinStatus(all, progress) {
  const c = getCheckin(progress);
  const today = todayStr();
  const alreadyDone = c.lastDate === today;
  const gap = c.lastDate ? daysBetween(c.lastDate, today) : 99;
  const isMakeupDay = gap === 2; // 昨天漏打 1 天
  const makeupUsed = (c.makeup && c.makeup.countThisMonth) || 0;
  const makeupAllowed = isMakeupDay && makeupUsed < MAKEUP_MONTH_LIMIT;
  const clearN = clearWrongList(all, progress).length;
  const freshDone = Object.keys(c.dayStats.first || {}).length;
  const freshTarget = (isMakeupDay && makeupAllowed) ? MAKEUP_FRESH_TARGET : DAILY_FRESH_TARGET;
  const canCheckin = !alreadyDone && clearN === 0 && freshDone >= freshTarget;
  return { alreadyDone, gap, isMakeupDay, makeupAllowed, makeupUsed, makeupLimit: MAKEUP_MONTH_LIMIT, clearN, freshDone, freshTarget, canCheckin };
}
// 执行打卡（调用前先用 checkinStatus 确认 canCheckin）。返回明细，供首页提示。
function doCheckin(all, progress) {
  const st = checkinStatus(all, progress);
  if (!st.canCheckin) return { ok: false, status: st };
  const c = getCheckin(progress);
  const today = todayStr();
  const isMakeup = st.gap === 2 && st.makeupAllowed;
  let streak = c.streak || 0;
  if (st.gap === 1) streak = streak + 1;
  else if (isMakeup) streak = streak + 2; // 补上漏的那天 + 今天，连续天数接上
  else streak = 1; // 第一次打卡，或漏打超过 1 天没补上，断签重算
  const streakBonus = Math.min(Math.max(streak - 1, 0) * 2, 10);
  const first = c.dayStats.first || {};
  const answered = Object.keys(first).length;
  const correctN = Object.values(first).filter(v => v === 1).length;
  const acc = answered ? correctN / answered : 0;
  let accBonus = 0;
  if (answered >= DAILY_FRESH_TARGET && acc >= 0.9) accBonus += CHECKIN_POINTS.accuracy90;
  if (answered >= DAILY_FRESH_TARGET && acc === 1) accBonus += CHECKIN_POINTS.perfect;
  let weekBonus = 0;
  if (!isMakeup) { // 补打的天不计入每周全勤
    const wk = weekKeyOf(today);
    if (c.weekKey !== wk) { c.weekKey = wk; c.weekDays = []; c.weekFull = false; }
    if (!c.weekDays.includes(today)) c.weekDays.push(today);
    if (c.weekDays.length >= 7 && !c.weekFull) { weekBonus = CHECKIN_POINTS.weekFull; c.weekFull = true; }
  }
  const points = CHECKIN_POINTS.checkin + streakBonus + accBonus + weekBonus;
  c.totalPoints += points; c.pointsToday += points;
  c.lastDate = today; c.streak = streak;
  const newBadges = [];
  for (const m of POINT_MILESTONES) if (c.totalPoints >= m.points && !c.badges.includes(m.name)) { c.badges.push(m.name); newBadges.push(m.name); }
  for (const b of STREAK_BADGES) if (streak >= b.days && !c.badges.includes(b.name)) { c.badges.push(b.name); newBadges.push(b.name); }
  if (isMakeup) { c.makeup.countThisMonth += 1; c.lastMakeupDate = today; }
  saveProgress(progress);
  return { ok: true, status: st, isMakeup, streak, points, breakdown: { checkin: CHECKIN_POINTS.checkin, streakBonus, accBonus, weekBonus }, accuracy: acc, answered, correct: correctN, newBadges };
}
// 周日小测：本周错题 + 薄弱章节 + 未做题，凑 20 道
function sundayMock(all, progress) {
  const weekStartMs = Date.parse(weekKeyOf(todayStr()) + 'T00:00:00+08:00');
  const wrongThisWeek = all.filter(q => {
    const p = qProgress(progress, q.id);
    return p && !p.mastered && (p.wrongCount || 0) > 0 && p.lastAt && p.lastAt >= weekStartMs;
  });
  const otherWrong = all.filter(q => {
    const p = qProgress(progress, q.id);
    return p && !p.mastered && (p.wrongCount || 0) > 0 && !(p.lastAt && p.lastAt >= weekStartMs);
  });
  const weakKeys = new Set(weakChapters(all, progress).map(w => w.subject + '|' + w.chapterId));
  const weakQs = all.filter(q => weakKeys.has(q.subject + '|' + q.chapterId) && !((qProgress(progress, q.id) || {}).done));
  const rest = all.filter(q => !((qProgress(progress, q.id) || {}).done));
  return dedupeById([...shuffle(wrongThisWeek), ...shuffle(otherWrong), ...shuffle(weakQs), ...shuffle(rest)]).slice(0, 20);
}
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
  // 薄弱章节（正确率 <60%）的未做题优先插在新课前面，最多 10 道。
  const weakKeys = new Set(weakChapters(all, progress).map(w => w.subject + '|' + w.chapterId));
  const weakQs = weakKeys.size ? all.filter(q => weakKeys.has(q.subject + '|' + q.chapterId) && !((qProgress(progress, q.id) || {}).done))
    .sort((a, b) => (a.chapterId - b.chapterId) || (a.number - b.number)).slice(0, 10) : [];
  return dedupeById([...due, ...weakQs, ...current, ...review]);
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
    case 'clearWrong': case 'sunday': return queue; // 队列已在 startPractice 里按规则建好
    case 'all': default: return queue;
  }
}
function isSameSet(a, b) { if (!a || !b || a.length !== b.length) return false; const s = new Set(a); return b.every(x => s.has(x)); }
function recordAnswer(q, selected, correct, opts) {
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
  p.banks[q.id] = next;
  // ---- 积分：答对 +1，错题订正答对 +2；每题每天只计一次分 ----
  // ---- 当日新题首答正确率：只统计非订正模式的首答（订正题反复答会把正确率刷高） ----
  const mode = (opts && opts.mode) || 'all';
  const remediation = REMEDIATION_MODES.includes(mode) || (prev.wrongCount || 0) > 0 || !!(prev.srs && !prev.mastered);
  let points = 0;
  const c = getCheckin(p);
  if (correct && !c.scored[q.id]) {
    points = remediation ? CHECKIN_POINTS.reviewCorrect : CHECKIN_POINTS.correct;
    c.scored[q.id] = points;
    c.totalPoints += points; c.pointsToday += points;
  }
  if (!REMEDIATION_MODES.includes(mode) && mode !== 'sunday' && c.dayStats.first[q.id] === undefined) {
    c.dayStats.first[q.id] = correct ? 1 : 0;
  }
  saveProgress(p); markStudiedToday();
  return { rec: next, points };
}
function toggleFavorite(qid) {
  const p = loadProgress(); p.banks = p.banks || {}; const prev = p.banks[qid] || {};
  p.banks[qid] = { ...prev, favorite: !prev.favorite }; saveProgress(p); return p.banks[qid].favorite;
}
// 每日一题：按日期轮换
function dailyQuestion() {
  const d = window.DAILY_QUESTIONS_XIAOSIMEN; if (!d || !d.questions || !d.questions.length) return null;
  const start = new Date(d.startDate + 'T00:00:00+08:00');
  const todayChina = new Date(todayStr() + 'T00:00:00+08:00'); // 按中国日期轮换
  const days = Math.max(0, Math.floor((todayChina - start) / 86400000));
  return d.questions[days % d.questions.length];
}

// ---------- 界面 ----------
const view = document.getElementById('view');
const state = { stage: '7-up', mode: 'all', queue: [], idx: 0, selected: [], submitted: false, subjectFilter: '', chapterFilter: '', keyword: '', streakCorrect: 0, clearTotal: 0, clearPassed: 0 };
const MODE_LABEL = { all: '按顺序', random: '随机顺序', random20: '每天 20 题', unfinished: '只做未做题', wrong: '错题本', everWrong: '曾错题', due: '今日待复习', favorite: '收藏题', clearWrong: '错题清零', sunday: '周日小测', daily: '每日一题', single: '单题' };
const ENCOURAGE = ['已经连续答对 5 题了，状态正好，继续！', '连续答对 10 题，真稳。', '连续答对 15 题，今天的手感可以记下来。', '连续答对 20 题，照这个节奏，明天还能更好。', '还在连对，越刷越顺。'];
// 轻提示：不打断刷题，3 秒自动消失
let toastTimer = null;
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function stageLabel(stage) { const s = STAGE_MAP[stage]; return s ? s.label : stage; }
function refreshStreak() { const el = document.getElementById('streakDays'); if (el) el.textContent = String(streakDays()); }

let autoNextTimer = null;
function clearAutoNext() { if (autoNextTimer) { clearTimeout(autoNextTimer); autoNextTimer = null; } }
// ---------- 首页卡片：打卡 / 周日小测 / 今日错题速览 ----------
function checkinCardHTML(all, progress) {
  const c = getCheckin(progress);
  const st = checkinStatus(all, progress);
  const nextM = POINT_MILESTONES.find(m => c.totalPoints < m.points);
  const prevM = [...POINT_MILESTONES].reverse().find(m => c.totalPoints >= m.points);
  const base = prevM ? prevM.points : 0;
  const pct = nextM ? Math.min(100, Math.round((c.totalPoints - base) / (nextM.points - base) * 100)) : 100;
  const madeUpToday = c.lastMakeupDate === todayStr();
  let statusLine = '';
  if (st.alreadyDone) statusLine = '今天已打卡 ✓ 明天继续来。';
  else if (st.isMakeupDay && st.makeupAllowed) statusLine = `昨天漏打了，今天可以补打：先清错题，再做 ${MAKEUP_FRESH_TARGET} 道新题，补上后连续天数接上。本月已补打 ${st.makeupUsed}/${st.makeupLimit} 次。`;
  else if (st.isMakeupDay) statusLine = `昨天漏打了，本月补打次数已用完（${st.makeupUsed}/${st.makeupLimit}），今天打卡连续天数将重新计算。`;
  else if (st.gap >= 3 && c.lastDate) statusLine = `连续打卡已断开（漏了 ${st.gap - 1} 天），今天打卡重新开始。`;
  else statusLine = '先清错题，再做 20 道新题，即可打卡。';
  return `
  <section class="card checkin">
    <h2>今日打卡</h2>
    <p class="checkin-nums">连续打卡 <b>${c.streak}</b> 天${madeUpToday ? ' <span class="tag">已补打</span>' : ''} · 总积分 <b>${c.totalPoints}</b> 分 · 今日已得 <b>${c.pointsToday}</b> 分</p>
    <p class="muted">${nextM ? `距「${nextM.name}」还差 ${nextM.points - c.totalPoints} 分` : '已拿到最高称号「满分冲刺者」'}</p>
    <div class="points-bar"><i style="width:${pct}%"></i></div>
    <p>${esc(statusLine)}</p>
    <p class="muted">${st.clearN > 0 ? `错题清零：还有 ${st.clearN} 道没过` : '错题清零：已清完 ✓'} · 今日新题：已做 ${st.freshDone}/${st.freshTarget} 道</p>
    <div class="row">
      ${st.alreadyDone ? '<button class="btn primary" disabled>今日已打卡 ✓</button>'
        : st.clearN > 0 ? `<button class="btn primary" id="clearBtn">去清错题（${st.clearN} 道）→</button>`
        : `<button class="btn primary" id="checkinBtn" ${st.canCheckin ? '' : 'disabled'}>${st.isMakeupDay && st.makeupAllowed ? '补打并打卡' : '打卡'}</button>`}
    </div>
    ${st.canCheckin && st.clearN === 0 && !st.alreadyDone ? '<p class="muted">可以打卡了！</p>' : ''}
    <p class="badges">${c.badges.length ? c.badges.map(b => `<span class="badge">🏅 ${esc(b)}</span>`).join('') : '<span class="muted">还没有徽章，打卡攒积分来拿。</span>'}</p>
  </section>`;
}
function sundayCardHTML(all, progress) {
  if (weekdayOf(todayStr()) !== 0) return '';
  return `
  <section class="card">
    <h2>周日小测</h2>
    <p class="muted">每周日一套 20 道混合卷：本周错题 + 薄弱章节 + 未做题。答对一样有积分，但不计入打卡的 20 道新题。</p>
    <button class="btn small" id="sundayBtn">开始周测（20 道）</button>
  </section>`;
}
function todayWrongCardHTML(all, progress) {
  const startMs = Date.parse(todayStr() + 'T00:00:00+08:00');
  const list = all.filter(q => { const p = qProgress(progress, q.id); return p && p.wrong && p.lastAt && p.lastAt >= startMs; });
  if (!list.length) return '';
  return `
  <section class="card">
    <h2>今日错题速览</h2>
    <p class="muted">睡前回顾：只看题 + 答案，不计分、不计入打卡。今天共错 ${list.length} 道。</p>
    ${list.slice(0, 8).map(q => `<div class="kv"><span>${esc(q.stem.slice(0, 42))}…</span><span>答案：${esc(q.answer.join('、'))}</span></div>`).join('')}
    <p><button class="btn small" id="reviewBtn">去订正这些错题 →</button></p>
  </section>`;
}
async function renderHome() {
  clearAutoNext(); // 回首页后，答对自动跳题的定时器必须取消，否则会把用户又拉回刷题页
  refreshStreak();
  const banks = await ensureBanks(SUBJECT_ORDER);
  const progress = loadProgress();
  const all = allQuestions(banks, SUBJECT_ORDER);
  const daily = dailyQuestion();
  const dailyDone = daily ? !!qProgress(progress, daily.id) : false;
  const counts = {};
  for (const key of SUBJECT_ORDER) counts[key] = (banks[key] && banks[key].total) || 0;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const weak = weakChapters(all, progress);
  const weakHTML = weak.length
    ? `<h3>薄弱章节（正确率低于 60%，标红优先复习）</h3>` + weak.map(w => `<div class="kv weak"><span>${esc(w.subjectLabel)} · ${esc(w.chapter)}</span><span>${Math.round(w.correct / w.attempted * 100)}%（${w.correct}/${w.attempted}）</span></div>`).join('')
    : `<p class="muted">暂无薄弱章节（每章至少做 3 道才统计）。</p>`;
  view.innerHTML = `
  ${checkinCardHTML(all, progress)}
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
  ${sundayCardHTML(all, progress)}
  ${todayWrongCardHTML(all, progress)}
  <section class="card">
    <h2>题库与进度</h2>
    ${SUBJECT_ORDER.map(k => `<div class="kv"><span>${esc(SUBJECTS[k].label)}</span><span>${counts[k]} 道 · 会考/中考：${EXAM_STAGE[k] === '8-down' ? '初二会考' : '初三中考'}</span></div>`).join('')}
    <div class="kv"><span>合计</span><span>${total} 道选择题</span></div>
    ${weakHTML}
    <h3>按章节 / 关键词找题</h3>
    <input type="search" id="searchBox" placeholder="搜章节、题干、知识点，如：地球、宪法、秦始皇" value="${esc(state.keyword)}">
    <div id="searchOut" style="margin-top:8px"></div>
    <p style="margin-top:12px"><button class="btn small" id="resetBtn">清空本机进度</button></p>
  </section>`;
  document.querySelectorAll('[data-stage]').forEach(b => b.addEventListener('click', () => { state.stage = b.dataset.stage; renderHome(); }));
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => startPractice(b.dataset.mode)));
  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => startPractice('clearWrong'));
  const reviewBtn = document.getElementById('reviewBtn');
  if (reviewBtn) reviewBtn.addEventListener('click', () => startPractice('clearWrong'));
  const sundayBtn = document.getElementById('sundayBtn');
  if (sundayBtn) sundayBtn.addEventListener('click', () => startPractice('sunday'));
  const checkinBtn = document.getElementById('checkinBtn');
  if (checkinBtn) checkinBtn.addEventListener('click', () => {
    const res = doCheckin(all, loadProgress());
    if (!res.ok) { toast('还不能打卡：先清错题，再做满今日新题。'); return; }
    let msg = `${res.isMakeup ? '补打成功！' : '打卡成功！'}+${res.points} 分（打卡 ${res.breakdown.checkin} + 连续加成 ${res.breakdown.streakBonus}${res.breakdown.accBonus ? ' + 正确率奖励 ' + res.breakdown.accBonus : ''}${res.breakdown.weekBonus ? ' + 全勤 ' + res.breakdown.weekBonus : ''}），连续打卡 ${res.streak} 天`;
    if (res.newBadges.length) msg += `，新徽章：${res.newBadges.join('、')}`;
    toast(msg);
    renderHome();
  });
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
  const all = allQuestions(banks, SUBJECT_ORDER);
  let queue;
  if (mode === 'clearWrong') {
    queue = clearWrongList(all, progress);
    if (!queue.length) { toast('今天的错题已经清零了，去做 20 道新题吧。'); return; }
    state.clearTotal = queue.length; state.clearPassed = 0;
  } else if (mode === 'sunday') {
    queue = sundayMock(all, progress);
    if (!queue.length) { alert('今天没有可出的周测题。'); return; }
  } else {
    // 每天第一次进练习（批量刷题模式），先清错题：不清完不让刷新的。
    // 每日一题、单题查找是单次查看，不拦截；错题本/待复习本身就是订正，也不拦截。
    const clearN = clearWrongList(all, progress).length;
    if (clearN > 0 && ['all', 'random', 'random20', 'unfinished', 'favorite'].includes(mode)) {
      toast(`先清错题：今天还有 ${clearN} 道错题没过，先把它们做对再刷新的。`);
      startPractice('clearWrong'); return;
    }
    const base = buildQueue(state.stage, banks, progress);
    queue = applyMode(base, mode, progress);
  }
  if (!queue.length) { alert(mode === 'wrong' ? '错题本还是空的，先去刷题吧。' : mode === 'due' ? '今天没有到期要复习的错题。' : '这个模式下没有题目。'); return; }
  state.mode = mode; state.queue = queue; state.idx = 0;
  // 断点续做：回到上次没做完的那道（错题清零每次从头清）
  const lastId = (progress.banks && progress.banks.__meta && progress.banks.__meta.lastQuestionId) || '';
  const li = mode === 'clearWrong' ? -1 : queue.findIndex(q => q.id === lastId);
  if (li > 0) state.idx = li;
  renderPractice();
}
// ---------- 题目配图（data/figures.js，base64 data URI，按题 id 映射） ----------
// 图只在带 image: true 的题上按需懒加载；点图放大查看，点任意处关闭。
async function showFigure(q) {
  const qid = q.id;
  const box = document.getElementById('qfig'); if (!box) return;
  try {
    if (!window.XIAOSIMEN_FIGURES) await loadScript('./data/figures.js?v=1');
    // 用户可能已跳到下一题：只给当前这道题填图。
    if (!state.queue[state.idx] || state.queue[state.idx].id !== qid) return;
    const src = window.XIAOSIMEN_FIGURES && window.XIAOSIMEN_FIGURES[qid];
    if (!src) { box.innerHTML = '<p class="muted">本题配图暂未加载</p>'; return; }
    box.innerHTML = '';
    const img = document.createElement('img');
    img.src = src; img.alt = '题目配图（点开放大）'; img.className = 'qfig-img';
    img.addEventListener('click', () => openFigureZoom(src));
    box.appendChild(img);
    const tip = document.createElement('p'); tip.className = 'muted'; tip.textContent = '点图可放大查看';
    box.appendChild(tip);
  } catch (e) { box.innerHTML = '<p class="muted">本题配图加载失败</p>'; }
}
function openFigureZoom(src) {
  let ov = document.getElementById('figOverlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'figOverlay'; ov.className = 'fig-overlay';
    ov.innerHTML = '<img id="figZoomImg" alt="题目配图（放大）"><p class="fig-overlay-tip">点任意处关闭</p>';
    ov.addEventListener('click', () => { ov.classList.remove('open'); });
    document.body.appendChild(ov);
  }
  document.getElementById('figZoomImg').src = src;
  ov.classList.add('open');
}
// 队列变化后（错题答错回队尾）只刷新题号和答题卡，不重渲染整页（解析要留在屏上）。
function refreshQueueUI() {
  const prog = document.getElementById('qProg');
  if (prog) prog.textContent = `第 ${state.idx + 1} / ${state.queue.length} 题 · ${stageLabel(state.stage)} · ${MODE_LABEL[state.mode] || state.mode}${state.mode === 'clearWrong' ? ` · 已过 ${state.clearPassed}/${state.clearTotal} 道` : ''}`;
  const nav = document.getElementById('qNav');
  if (nav) {
    const progress = loadProgress();
    nav.innerHTML = state.queue.map((qq, i) => {
      const r = qProgress(progress, qq.id) || {};
      return `<button data-i="${i}" class="${i === state.idx ? 'cur' : ''} ${r.done ? (r.wrong ? 'wrong' : 'done') : ''}">${i + 1}</button>`;
    }).join('');
    nav.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { state.idx = Number(b.dataset.i); renderPractice(); }));
  }
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
    <p class="muted" id="qProg">第 ${state.idx + 1} / ${total} 题 · ${esc(stageLabel(state.stage))} · ${esc(MODE_LABEL[state.mode] || state.mode)}${state.mode === 'clearWrong' ? ` · 已过 ${state.clearPassed}/${state.clearTotal} 道` : ''}</p>
    <h2 style="font-size:18px">${esc(q.stem)}</h2>
    <div id="qfig"></div>
    <div id="opts"></div>
    <div id="result"></div>
    <div class="row" style="margin-top:12px">
      <button class="btn small" id="submitBtn">提交</button>
      <button class="btn small" id="revealBtn">查看答案</button>
      <button class="btn small" id="favBtn">${rec.favorite ? '★ 已收藏' : '☆ 收藏'}</button>
      <button class="btn small" id="nextBtn">下一题 →</button>
    </div>
    <h3>答题卡</h3>
    <div class="nav" id="qNav">${state.queue.map((qq, i) => {
      const r = qProgress(progress, qq.id) || {};
      return `<button data-i="${i}" class="${i === state.idx ? 'cur' : ''} ${r.done ? (r.wrong ? 'wrong' : 'done') : ''}">${i + 1}</button>`;
    }).join('')}</div>
  </section>`;
  const optsEl = document.getElementById('opts');
  const opts = q.type === 'judge' ? [{ key: 'true', text: '正确' }, { key: 'false', text: '错误' }] : (q.options || []);
  state.selected = []; state.submitted = false;
  if (q.image) showFigure(q); // 带配图的题：题干下方显示原卷图，点开放大
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
  document.getElementById('backBtn').addEventListener('click', renderHome);  document.getElementById('favBtn').addEventListener('click', e => { const f = toggleFavorite(q.id); e.target.textContent = f ? '★ 已收藏' : '☆ 收藏'; });
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
    const res = recordAnswer(q, state.selected, correct, { mode: state.mode });
    const p = loadProgress(); p.banks = p.banks || {}; p.banks.__meta = { lastQuestionId: q.id }; saveProgress(p);
    let note = '';
    if (state.mode === 'clearWrong') {
      if (correct) {
        const p2 = loadProgress(); const c = getCheckin(p2);
        if (!c.clear.done.includes(q.id)) { c.clear.done.push(q.id); state.clearPassed++; }
        saveProgress(p2);
        refreshQueueUI(); // “已过 X/Y 道”立即更新
        if (state.clearPassed >= state.clearTotal) note = '错题清零完成！可以开始今日 20 道新题了。';
      } else {
        state.queue.push(q); // 答错放回队尾，稍后再出现，直到答对
        note = '这道还没过，已放回队尾，稍后再来一次。';
        refreshQueueUI(); // 题号和答题卡立即多一格
      }
    }
    if (correct) state.streakCorrect++; else state.streakCorrect = 0;
    if (note) toast(note);
    else if (correct && res.points > 0) toast(`+${res.points} 分`);
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
    if (selected !== null && correct && state.streakCorrect > 0 && state.streakCorrect % 5 === 0) {
      const enc = ENCOURAGE[Math.min(Math.floor(state.streakCorrect / 5) - 1, ENCOURAGE.length - 1)];
      document.getElementById('result').insertAdjacentHTML('beforeend', `<p class="encourage">${esc(enc)}</p>`);
    }
    if (selected !== null && correct) { clearAutoNext(); autoNextTimer = setTimeout(() => { autoNextTimer = null; if (state.idx < state.queue.length - 1) { state.idx++; renderPractice(); } }, 900); }
  }
}
renderHome();
