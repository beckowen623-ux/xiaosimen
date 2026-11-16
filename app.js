/* 小四门刷题 · 福州人教版 · 纯静态 + localStorage
 * 仿 beckowen623-ux/quiz-bank-app 的结构（懒加载 .js 题库、localStorage 进度、SRS 错题复习），
 * 去掉了付费锁 / 兑换码 / admin / 计算器 / 主观题分支。只做单选、多选、判断。
 */
'use strict';
const STORAGE_KEY = 'xiaosimen-quiz-v1';
const GROWTH_KEY = 'xiaosimen-growth-v1';
const REVIEW_INTERVALS = [1, 3, 7, 14]; // 错题复习间隔（天）：答对进一级，答错退回第 1 级；连续答对 4 次算掌握
// ---------- 打卡 / 积分 / 补打规则 ----------
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
  daode: { label: '道德与法治', short: '道法' },
  lishi: { label: '历史', short: '历史' },
  dili: { label: '地理', short: '地理' },
  shengwu: { label: '生物', short: '生物' },
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
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function readStored(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}
function loadProgress() {
  const progress = readStored(STORAGE_KEY);
  if (!isRecord(progress.banks)) progress.banks = {};
  return progress;
}
function saveProgress(p) { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
function qProgress(p, qid) { return (p.banks && p.banks[qid]) || null; }
function hasAnswered(record) {
  // 旧版查看解析会写入 done 和 revealed，已有 attempts 的记录仍是真实作答。
  return !!(record?.done && (!record.revealed || record.attempts > 0));
}
function studyDates(progress) {
  const dates = progress.studyDays ?? readStored(GROWTH_KEY).studyDays;
  return Array.isArray(dates) ? dates : [];
}
function createProgressBackup() {
  const progress = loadProgress();
  return {
    app: 'xiaosimen',
    version: 1,
    exportedAt: new Date().toISOString(),
    progress: { ...progress, studyDays: studyDates(progress) },
  };
}
function readProgressBackup(text) {
  const backup = JSON.parse(text);
  const p = backup?.progress;
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const id = value => typeof value === 'string' && /^[a-z0-9-]+$/.test(value);
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const strings = (value, validate) => Array.isArray(value) && value.every(validate);
  const map = (value, key, item) => isRecord(value) && Object.entries(value).every(([k, v]) => key(k) && item(v));
  const stage = value => Object.hasOwn(STAGE_MAP, value);
  const c = p?.checkin;
  const validCheckin = c === undefined || (isRecord(c) &&
    ['streak', 'totalPoints', 'pointsToday'].every(k => c[k] === undefined || count(c[k])) &&
    ['lastDate', 'lastMakeupDate', 'pointsDate', 'weekKey'].every(k => !c[k] || date(c[k])) &&
    (c.weekDays === undefined || strings(c.weekDays, date)) &&
    (c.badges === undefined || strings(c.badges, value => typeof value === 'string')) &&
    (c.dayStats === undefined || (isRecord(c.dayStats) && date(c.dayStats.date) && map(c.dayStats.first, id, value => value === 0 || value === 1))) &&
    (c.clear === undefined || (isRecord(c.clear) && date(c.clear.date) && strings(c.clear.done, id))) &&
    (c.scored === undefined || map(c.scored, id, count)) &&
    (c.makeup === undefined || (isRecord(c.makeup) && count(c.makeup.countThisMonth) && typeof c.makeup.month === 'string')));
  const validRecords = isRecord(p?.banks) && Object.entries(p.banks).every(([key, value]) => {
    if (!isRecord(value)) return false;
    if (key === '__meta') return value.lastQuestionId === undefined || id(value.lastQuestionId);
    return id(key) &&
      ['done', 'revealed', 'correct', 'wrong', 'favorite', 'mastered'].every(k => value[k] === undefined || typeof value[k] === 'boolean') &&
      ['attempts', 'wrongCount', 'lastAt'].every(k => value[k] === undefined || count(value[k])) &&
      (value.srs == null || (isRecord(value.srs) && count(value.srs.stage) && value.srs.stage < REVIEW_INTERVALS.length && date(value.srs.due)));
  });
  if (backup?.app !== 'xiaosimen' || backup.version !== 1 || !validRecords || !validCheckin ||
      !strings(p.studyDays, date) || (p.stage !== undefined && !stage(p.stage)) ||
      (p.resumeByStage !== undefined && !map(p.resumeByStage, stage, value => value === null || id(value)))) {
    throw new Error('无效的小四门进度备份');
  }
  return p;
}
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
// 今日先订正尚未答对的错题，再复习已到期的题。
function clearWrongList(all, progress) {
  const c = getCheckin(progress);
  const today = todayStr();
  const doneSet = new Set(c.clear.done || []);
  return all.filter(q => {
    const p = qProgress(progress, q.id);
    if (!p || p.mastered || !p.srs) return false;
    return p.wrong || (!doneSet.has(q.id) && p.srs.due && p.srs.due <= today);
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
    if (hasAnswered(r)) { map[key].attempted++; if (r.correct) map[key].correct++; }
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
  const weakQs = all.filter(q => weakKeys.has(q.subject + '|' + q.chapterId) && !hasAnswered(qProgress(progress, q.id)));
  const rest = all.filter(q => !hasAnswered(qProgress(progress, q.id)));
  return dedupeById([...shuffle(wrongThisWeek), ...shuffle(otherWrong), ...shuffle(weakQs), ...shuffle(rest)]).slice(0, 20);
}
function streakDays(progress = loadProgress()) {
  const days = new Set(studyDates(progress));
  let day = days.has(todayStr()) ? todayStr() : todayStr(-1);
  let n = 0;
  while (days.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

// ---------- 题库加载（懒加载 .js，全局变量合并） ----------
const loadedScripts = new Map();
function loadScript(src) {
  if (!loadedScripts.has(src)) {
    const request = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        loadedScripts.delete(src);
        reject(new Error('无法加载题库 ' + src));
      };
      document.head.appendChild(script);
    });
    loadedScripts.set(src, request);
  }
  return loadedScripts.get(src);
}
async function ensureBanks(subjectKeys) {
  await Promise.all(subjectKeys.map(key => loadScript(`./data/${key}.js?v=7`)));
  const banks = window.XIAOSIMEN_BANKS || {};
  const missing = subjectKeys.filter(key => !banks[key]?.questions?.length);
  if (missing.length) {
    missing.forEach(key => loadedScripts.delete(`./data/${key}.js?v=7`));
    throw new Error('题库内容不完整');
  }
  return banks;
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
//  1. 到期错题最先：SRS 到期（1/3/7/14 天）的题插在队首；
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
  const weakQs = weakKeys.size ? [...current, ...review].filter(q => weakKeys.has(q.subject + '|' + q.chapterId) && !hasAnswered(qProgress(progress, q.id)))
    .sort((a, b) => (a.chapterId - b.chapterId) || (a.number - b.number)).slice(0, 10) : [];
  return dedupeById([...due, ...weakQs, ...current, ...review]);
}
function applyMode(queue, mode, progress, freshLimit = DAILY_FRESH_TARGET) {
  const p = progress || loadProgress();
  const isNew = q => !hasAnswered(qProgress(p, q.id));
  const isWrong = q => { const r = qProgress(p, q.id); return r && r.wrong; };
  const isFav = q => { const r = qProgress(p, q.id); return r && r.favorite; };
  switch (mode) {
    case 'random': return shuffle(queue);
    case 'random20': return shuffle(queue.filter(isNew)).slice(0, freshLimit);
    case 'unfinished': return queue.filter(isNew);
    case 'wrong': return queue.filter(isWrong);
    case 'favorite': return queue.filter(isFav);
    case 'everWrong': return queue.filter(q => { const r = qProgress(p, q.id); return r && (r.wrong || (r.wrongCount || 0) > 0); });
    case 'due': return dueQuestions(queue, p);
    case 'clearWrong': case 'sunday': return queue; // 队列已在 startPractice 里按规则建好
    case 'all': default: return queue;
  }
}
function isSameSet(a, b) { if (!a || !b || a.length !== b.length) return false; const s = new Set(a); return b.every(x => s.has(x)); }
function recordReveal(qid) {
  const p = loadProgress();
  const prev = p.banks[qid] || {};
  if (hasAnswered(prev)) return;
  p.banks[qid] = { ...prev, revealed: true };
  saveProgress(p);
}
function recordAnswer(q, selected, correct, opts) {
  const p = loadProgress();
  const today = todayStr();
  const prev = p.banks[q.id] || { attempts: 0, wrongCount: 0 };
  const next = { ...prev, done: true, revealed: false, correct, wrong: !correct, selected: [...selected], attempts: (prev.attempts || 0) + 1, lastAt: Date.now() };
  if (!correct) {
    next.wrongCount = (prev.wrongCount || 0) + 1;
    next.srs = { stage: 0, due: todayStr(REVIEW_INTERVALS[0]) }; // 明天复习
    next.mastered = false;
  } else if (prev.srs?.due && prev.srs.due <= today && !prev.mastered) {
    const stage = (prev.srs.stage || 0) + 1;
    if (stage >= REVIEW_INTERVALS.length) { next.srs = null; next.mastered = true; }
    else next.srs = { stage, due: todayStr(REVIEW_INTERVALS[stage]) };
  }
  p.banks[q.id] = next;
  // ---- 积分：答对 +1，错题订正答对 +2；每题每天只计一次分 ----
  // ---- 当日新题首答正确率：只统计非订正模式的首答（订正题反复答会把正确率刷高） ----
  const mode = (opts && opts.mode) || 'all';
  const remediation = REMEDIATION_MODES.includes(mode) || prev.wrong || !!(prev.srs && !prev.mastered);
  let points = 0;
  const c = getCheckin(p);
  if (correct && !c.scored[q.id]) {
    points = remediation ? CHECKIN_POINTS.reviewCorrect : CHECKIN_POINTS.correct;
    c.scored[q.id] = points;
    c.totalPoints += points; c.pointsToday += points;
  }
  if (!hasAnswered(prev) && !REMEDIATION_MODES.includes(mode) && mode !== 'sunday' && c.dayStats.first[q.id] === undefined) {
    c.dayStats.first[q.id] = correct ? 1 : 0;
  }
  if (correct && remediation && !c.clear.done.includes(q.id)) c.clear.done.push(q.id);
  if (!correct) c.clear.done = c.clear.done.filter(id => id !== q.id);
  if (mode === 'all' && opts?.stage) p.resumeByStage = { ...p.resumeByStage, [opts.stage]: opts.nextId || null };
  const dates = studyDates(p);
  p.studyDays = dates.includes(today) ? dates : [...dates, today];
  saveProgress(p);
  return { rec: next, points };
}
function toggleFavorite(qid) {
  const p = loadProgress(); p.banks = p.banks || {}; const prev = p.banks[qid] || {};
  p.banks[qid] = { ...prev, favorite: !prev.favorite }; saveProgress(p); return p.banks[qid].favorite;
}
function dailyQuestions() {
  return window.DAILY_QUESTIONS_XIAOSIMEN?.questions || [];
}
// 每日一题：按日期轮换
function dailyQuestion() {
  const questions = dailyQuestions();
  if (!questions.length) return null;
  const d = window.DAILY_QUESTIONS_XIAOSIMEN;
  const start = new Date(d.startDate + 'T00:00:00+08:00');
  const todayChina = new Date(todayStr() + 'T00:00:00+08:00'); // 按中国日期轮换
  const days = Math.max(0, Math.floor((todayChina - start) / 86400000));
  return questions[days % questions.length];
}

// ---------- 界面 ----------
const byId = id => document.getElementById(id);
const view = byId('view');
const stagePref = progress => Object.hasOwn(STAGE_MAP, progress.stage) ? progress.stage : STAGES[0].stage;
const state = {
  stage: stagePref(loadProgress()), mode: 'all', queue: [], idx: 0, streakCorrect: 0,
  keyword: '', searchSubject: '', clearPending: new Set(), clearTotal: 0, navOpen: false,
};
const MODE_LABEL = {
  all: '按学期练习', random: '随机练习', random20: '今日新题', unfinished: '只做未做题',
  wrong: '错题本', due: '到期复习', favorite: '收藏题', clearWrong: '错题订正',
  sunday: '周日小测', daily: '每日一题', single: '单题练习',
};
const SUBJECT_ICON = { daode: 'scale', lishi: 'landmark', dili: 'compass', shengwu: 'leaf' };
const STAGE_HINT = {
  '7-up': '本学期新课按四科轮练。',
  '7-down': '先练本学期新课，再复习七上内容。',
  '8-up': '先练本学期新课，再复习七年级内容。',
  '8-down': '八下新课后，继续复习地理和生物会考内容。',
  '9-up': '道法、历史本学期新课和七、八年级复习。',
  '9-down': '道法、历史新课和初中三年总复习。',
};
const TYPE_LABEL = { single: '单选题', multiple: '多选题', judge: '判断题' };
const fmt = new Intl.NumberFormat('zh-CN');
let banks;
let bankQuestions = [];
let library = [];
let toastTimer;

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function icon(name, cls = '') {
  return `<svg class="icon ${cls}" aria-hidden="true"><use href="./assets/icons/ui.svg#${name}"></use></svg>`;
}
function meter(value, max, label, cls = '') {
  return `<progress class="meter ${cls}" max="${max || 1}" value="${Math.min(value, max)}" aria-label="${esc(label)}"></progress>`;
}
function toast(message) {
  const el = byId('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}
function persist(action) {
  try {
    return action();
  } catch (error) {
    console.error(error);
    toast('当前浏览器无法保存学习记录，请检查站点存储权限。');
    return undefined;
  }
}
function refreshStreak(progress) {
  byId('streakDays').textContent = streakDays(progress);
  byId('streakBox').hidden = false;
}
function moveFocus(element, scroll = false) {
  if (scroll) window.scrollTo(0, 0);
  element?.focus({ preventScroll: true });
}
function expParas(text) {
  const parts = String(text || '').split(/(?<=。)|\n/).map(p => p.trim()).filter(Boolean);
  return parts.length ? parts.map(p => `<p>${esc(p)}</p>`).join('') : '<p>暂无解析</p>';
}
function subjectChip(key, label) {
  return `<span class="chip tone-${esc(key)}">${esc(label || SUBJECTS[key]?.label || '')}</span>`;
}
function displayAnswer(q) {
  return q.type === 'judge' ? (q.answer[0] === 'true' ? '正确' : '错误') : q.answer.join('、');
}
function resumeIndex(queue, progress) {
  const stage = state.stage;
  if (Object.hasOwn(progress.resumeByStage || {}, stage)) {
    return Math.max(0, queue.findIndex(q => q.id === progress.resumeByStage[stage]));
  }
  const last = queue.findIndex(q => q.id === progress.banks.__meta?.lastQuestionId);
  return (last + 1) % (queue.length || 1);
}
function keepPosition(qid) {
  if (state.mode !== 'all') return;
  persist(() => {
    const p = loadProgress();
    p.resumeByStage = { ...p.resumeByStage, [state.stage]: qid };
    saveProgress(p);
  });
}

function checkinCardHTML(progress, stats) {
  const c = getCheckin(progress);
  const canMakeup = stats.isMakeupDay && stats.makeupAllowed;
  const needed = Math.max(0, stats.freshTarget - stats.freshDone);
  const activeStreak = stats.gap <= 1 || canMakeup ? c.streak : 0;
  let action;
  if (stats.alreadyDone) {
    action = '<p class="checked-in">✓ 今天已打卡</p>';
  } else if (stats.clearN) {
    action = `<button class="btn primary" data-mode="clearWrong">订正 ${stats.clearN} 道错题 ${icon('arrow-right')}</button>`;
  } else if (stats.canCheckin) {
    action = `<button class="btn primary" id="checkinBtn">${canMakeup ? '补打并打卡' : '立即打卡'} ${icon('check')}</button>`;
  } else {
    action = `<button class="btn primary" data-mode="random20">去做今日新题 ${icon('arrow-right')}</button>`;
  }
  let note = '先订正错题，再完成今日新题。';
  if (stats.alreadyDone) note = c.lastMakeupDate === todayStr() ? '今日已补上昨天的打卡。' : '明天继续完成新题。';
  else if (canMakeup) note = `昨天漏打，今天完成 ${stats.freshTarget} 道新题可补打。`;
  else if (stats.isMakeupDay) note = '本月补打次数已用完，今天重新累计。';
  else if (stats.canCheckin) note = '今日任务完成，可以领取打卡积分。';
  const next = POINT_MILESTONES.find(m => c.totalPoints < m.points);
  const badgeList = [
    ...POINT_MILESTONES.map(b => ({ name: b.name, requirement: `${b.points} 分` })),
    ...STREAK_BADGES.map(b => ({ name: b.name, requirement: `连续 ${b.days} 天` })),
  ];
  return `
    <section class="card checkin-card" aria-labelledby="checkinTitle">
      <div class="section-heading">
        <h2 id="checkinTitle">${icon('calendar-check')} 今日打卡</h2>
        <span class="checkin-total">${fmt.format(c.totalPoints)} 积分</span>
      </div>
      <div class="checkin-progress">
        <div class="progress-label"><span>今日新题</span><strong>${Math.min(stats.freshDone, stats.freshTarget)}<span> / ${stats.freshTarget}</span></strong></div>
        ${meter(stats.freshDone, stats.freshTarget, '今日新题进度')}
        <p class="muted">${esc(note)}</p>
      </div>
      ${action}
      <div class="checkin-footer"><span>${icon('flame')} 打卡连续 <b>${activeStreak}</b> 天</span><span>今日积分 <b>+${c.pointsToday}</b></span></div>
      <details class="badges">
        <summary>称号与徽章</summary>
        <p class="muted mobile-study-streak">已连续学习 ${streakDays(progress)} 天，按有作答的日期计算。</p>
        <p class="muted">${next ? `距「${next.name}」还差 ${next.points - c.totalPoints} 分。` : '已获得最高积分称号。'}</p>
        <ul class="badges-list">${badgeList.map(b => `<li>${c.badges.includes(b.name) ? '✓ ' : ''}${b.name}<span>${b.requirement}</span></li>`).join('')}</ul>
      </details>
    </section>`;
}

function studyHeroHTML(queue, progress) {
  const idx = resumeIndex(queue, progress);
  const subjects = activeSubjectsForStage(state.stage);
  return `
    <section class="study-hero">
      <img class="hero-art" src="./assets/study-desk.webp" alt="" width="960" height="640" fetchpriority="high">
      <div class="hero-content">
        <div class="stage-field">
          <label for="stageSelect">年级学期</label>
          <select id="stageSelect">${STAGES.map(s => `<option value="${s.stage}" ${s.stage === state.stage ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
        </div>
        <h1 id="homeTitle" tabindex="-1">${idx > 0 ? '继续练习' : '按学期刷题'}</h1>
        <p class="hero-meta">${subjects.map(k => SUBJECTS[k].short).join(' · ')} <span> / </span> ${fmt.format(queue.length)} 道</p>
        <div class="hero-actions">
          <button class="btn hero-primary" id="startBtn" data-mode="all">${idx > 0 ? '继续练习' : '开始练习'} ${icon('arrow-right')}</button>
          <button class="btn hero-secondary" data-mode="random">${icon('shuffle')} 随机练习</button>
        </div>
        <p class="hero-hint">${idx > 0 ? `上次练到第 ${idx + 1} 题` : STAGE_HINT[state.stage]}</p>
      </div>
    </section>`;
}
function quickModesHTML(queue, progress) {
  const options = [
    { name: '只做未做题', mode: 'unfinished', q: queue, icon: 'list-checks', tone: 'shengwu' },
    { name: '错题本', mode: 'wrong', q: library, icon: 'notebook-pen', tone: 'lishi' },
    { name: '到期复习', mode: 'due', q: library, icon: 'calendar-check', tone: 'dili' },
    { name: '收藏题', mode: 'favorite', q: library, icon: 'bookmark', tone: 'daode' },
  ];
  return `
    <section class="quick-section" aria-labelledby="modesTitle">
      <div class="section-heading"><h2 id="modesTitle">练习模式</h2></div>
      <div class="quick-grid">
        ${options.map(entry => `<button class="quick-card tone-${entry.tone}" data-mode="${entry.mode}">
          <span class="tile-icon">${icon(entry.icon)}</span>
          <span class="quick-name"><strong>${entry.name}</strong><small>${fmt.format(applyMode(entry.q, entry.mode, progress).length)} 道</small></span>
          ${icon('chevron-right', 'quick-arrow')}
        </button>`).join('')}
      </div>
    </section>`;
}
function subjectProgressHTML(progress) {
  const weak = weakChapters(bankQuestions, progress);
  return `
    <section class="card subject-card" aria-labelledby="subjectTitle">
      <div class="section-heading"><h2 id="subjectTitle">四科进度</h2><span class="muted">题库共 ${fmt.format(bankQuestions.length)} 道</span></div>
      <div class="subject-grid">
      ${SUBJECT_ORDER.map(key => {
        const items = banks[key].questions;
        const answered = items.map(q => qProgress(progress, q.id)).filter(hasAnswered);
        const acc = answered.length ? Math.round(answered.filter(r => r.correct).length / answered.length * 100) + '%' : '—';
        return `<article class="subject-entry tone-${key}">
          <div class="subject-heading"><span class="tile-icon">${icon(SUBJECT_ICON[key])}</span><div><h3>${SUBJECTS[key].label}</h3><p>${EXAM_STAGE[key] === '8-down' ? '初二会考' : '初三中考'}</p></div></div>
          ${meter(answered.length, items.length, SUBJECTS[key].label + '练习进度')}
          <div class="subject-stats"><span>已做 ${answered.length} / ${items.length}</span><span>正确率 ${acc}</span></div>
        </article>`;
      }).join('')}
      </div>
      ${weak.length ? `<details class="weak-chapters"><summary>薄弱章节（${weak.length}）</summary>
        <ul>${weak.map(w => `<li><span>${esc(w.subjectLabel)} · ${esc(w.chapter)}</span><strong>${Math.round(w.correct / w.attempted * 100)}%</strong></li>`).join('')}</ul>
      </details>` : ''}
    </section>`;
}
function dailyCardHTML(progress) {
  const q = dailyQuestion();
  return `
    <section class="card daily-card" aria-labelledby="dailyTitle">
      <div class="section-heading"><h2 id="dailyTitle">${icon('book-open')} 每日一题</h2><span class="muted">${todayStr().slice(5).replace('-', ' / ')}</span></div>
      ${q ? `<div>${subjectChip(q.subject, q.subjectLabel)}</div>
        <p class="daily-stem">${esc(q.stem)}</p>
        <button class="btn" id="dailyBtn">${hasAnswered(qProgress(progress, q.id)) ? '重做今日一题' : '做今日一题'} ${icon('arrow-right')}</button>`
        : '<p class="muted">每日一题暂未加载。</p>'}
    </section>`;
}
function reviewCardsHTML(progress) {
  const since = Date.parse(todayStr() + 'T00:00:00+08:00');
  const wrong = library.filter(q => {
    const p = qProgress(progress, q.id);
    return p?.wrong && p.lastAt >= since;
  });
  const sunday = weekdayOf(todayStr()) === 0;
  return `
    ${sunday ? `<section class="card mini-card"><div><h2>周日小测</h2><p class="muted">本周错题、薄弱章节和未做题，共 20 道。</p></div><button class="btn" data-mode="sunday">开始小测 ${icon('arrow-right')}</button></section>` : ''}
    ${wrong.length ? `<details class="card wrong-today"><summary>今日错题速览 <span class="muted">${wrong.length} 道</span></summary>
      <ol>${wrong.slice(0, 8).map(q => `<li><span>${esc(q.stem)}</span><strong>答案 ${esc(displayAnswer(q))}</strong></li>`).join('')}</ol>
      <button class="btn" data-mode="clearWrong">去订正 ${icon('arrow-right')}</button>
    </details>` : ''}`;
}
function renderHome(focus = '') {
  if (!banks) return;
  document.body.classList.remove('practice');
  const progress = loadProgress();
  const queue = buildQueue(state.stage, banks, progress);
  refreshStreak(progress);
  byId('headerSearch').hidden = false;
  view.innerHTML = `
    <div class="dashboard-top">
      ${studyHeroHTML(queue, progress)}
      ${checkinCardHTML(progress, checkinStatus(library, progress))}
    </div>
    ${quickModesHTML(queue, progress)}
    <div class="dashboard-lower">
      ${subjectProgressHTML(progress)}
      <div class="daily-column">${dailyCardHTML(progress)}${reviewCardsHTML(progress)}</div>
    </div>
    <section class="card search-card" id="searchPanel" aria-labelledby="searchTitle">
      <div class="section-heading"><h2 id="searchTitle">${icon('search')} 按章节或关键词找题</h2></div>
      <div class="search-fields">
        <input type="search" id="searchBox" aria-label="题目关键词" placeholder="试试输入「宋代」或「等高线」" value="${esc(state.keyword)}">
        <select id="searchSubject" aria-label="搜索科目">
          <option value="">全部科目</option>
          ${SUBJECT_ORDER.map(key => `<option value="${key}" ${state.searchSubject === key ? 'selected' : ''}>${SUBJECTS[key].label}</option>`).join('')}
        </select>
      </div>
      <p class="muted" id="searchStatus" role="status"></p>
      <div id="searchOut" class="search-results"></div>
    </section>`;
  byId('stageSelect').addEventListener('change', event => {
    state.stage = event.target.value;
    persist(() => {
      const latest = loadProgress();
      latest.stage = state.stage;
      saveProgress(latest);
    });
    renderHome('stageSelect');
  });
  view.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => startPractice(btn.dataset.mode)));
  byId('dailyBtn')?.addEventListener('click', () => beginPractice([dailyQuestion()], 'daily'));
  byId('checkinBtn')?.addEventListener('click', () => {
    const res = persist(() => doCheckin(library, loadProgress()));
    if (!res) return;
    if (!res.ok) { toast('请先完成今日打卡任务。'); renderHome(); return; }
    toast(`${res.isMakeup ? '补打成功' : '打卡成功'}，+${res.points} 分${res.newBadges.length ? ' · 获得「' + res.newBadges.join('、') + '」' : ''}`);
    renderHome();
  });
  byId('searchBox').addEventListener('input', event => { state.keyword = event.target.value; doSearch(); });
  byId('searchSubject').addEventListener('change', event => { state.searchSubject = event.target.value; doSearch(); });
  byId('searchOut').addEventListener('click', event => {
    const id = event.target.closest('button[data-qid]')?.dataset.qid;
    if (id) beginPractice([bankQuestions.find(q => q.id === id)], 'single');
  });
  doSearch();
  if (focus) moveFocus(byId(focus), focus === 'homeTitle');
}
function doSearch() {
  const kw = state.keyword.trim().normalize('NFKC').toLowerCase();
  const status = byId('searchStatus');
  const out = byId('searchOut');
  if (!kw) { status.textContent = ''; out.replaceChildren(); return; }
  const hits = bankQuestions.filter(q =>
    (!state.searchSubject || q.subject === state.searchSubject) &&
    [q.chapter, q.stem, q.material || '', q.explanation || ''].some(text => text.normalize('NFKC').toLowerCase().includes(kw)));
  status.textContent = hits.length ? `找到 ${hits.length} 道${hits.length > 20 ? '，显示前 20 道' : ''}` : '没有找到相关题目。试试更短的关键词。';
  out.innerHTML = hits.slice(0, 20).map(q => `<article class="search-hit">
    <div>${subjectChip(q.subject)} <span class="muted">${esc(q.chapter)}</span><p>${esc(q.stem)}</p></div>
    <button class="btn" data-qid="${q.id}">做这道 ${icon('arrow-right')}</button>
  </article>`).join('');
}

function startPractice(mode) {
  const progress = loadProgress();
  const clear = clearWrongList(library, progress);
  const studyMode = ['all', 'random', 'random20', 'unfinished'].includes(mode);
  if (mode === 'clearWrong' || (studyMode && clear.length)) {
    if (!clear.length) { toast('今天的错题已经订正完了。'); return; }
    if (mode !== 'clearWrong') toast(`先订正 ${clear.length} 道错题，再继续练习。`);
    beginPractice(clear, 'clearWrong');
    return;
  }
  let queue;
  if (mode === 'sunday') {
    queue = sundayMock(bankQuestions, progress);
  } else if (['wrong', 'due', 'favorite'].includes(mode)) {
    queue = applyMode(library, mode, progress);
  } else {
    const base = buildQueue(state.stage, banks, progress);
    const stats = mode === 'random20' ? checkinStatus(library, progress) : null;
    const remaining = stats ? Math.max(0, stats.freshTarget - stats.freshDone) : undefined;
    if (remaining === 0) { renderHome(); toast('今日新题已完成。'); return; }
    queue = applyMode(base, mode, progress, remaining);
  }
  if (!queue.length) {
    const empty = {
      wrong: '错题本是空的。', favorite: '还没有收藏题目。', due: '今天没有到期的错题。',
      random20: '本档新题已做完，可切换学期继续。', unfinished: '本档题目已全部作答。',
    };
    toast(empty[mode] || '当前没有可练习的题目。');
    return;
  }
  beginPractice(queue, mode, mode === 'all' ? resumeIndex(queue, progress) : 0);
}
function beginPractice(queue, mode, index = 0) {
  if (!queue[index]) return;
  state.mode = mode;
  state.queue = queue;
  state.idx = index;
  state.streakCorrect = 0;
  state.navOpen = false;
  state.clearPending = new Set(mode === 'clearWrong' ? queue.map(q => q.id) : []);
  state.clearTotal = state.clearPending.size;
  renderPractice();
}

function renderFigure(q) {
  if (!q.image) return;
  const wrap = byId('qfig');
  const src = `./data/figures/${encodeURIComponent(q.id)}.jpg`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'figure-button';
  btn.innerHTML = `<img alt="题目配图" decoding="async"><span>${icon('zoom-in')} 放大配图</span>`;
  const img = btn.querySelector('img');
  img.addEventListener('error', () => {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn';
    retry.textContent = '配图加载失败 · 点击重试';
    retry.addEventListener('click', () => renderFigure(q));
    wrap.replaceChildren(retry);
  });
  img.src = src;
  btn.addEventListener('click', () => {
    byId('figureFull').src = src;
    byId('figureSource').textContent = q.source || '';
    byId('figureDialog').showModal();
  });
  wrap.replaceChildren(btn);
}
function questionStats(progress) {
  if (state.mode === 'clearWrong') return `已订正 ${state.clearTotal - state.clearPending.size} / ${state.clearTotal} 道`;
  const attempted = state.queue.map(q => qProgress(progress, q.id)).filter(hasAnswered);
  if (!attempted.length) return '';
  return `本组已做 ${attempted.length} 道 · 正确率 ${Math.round(attempted.filter(r => r.correct).length / attempted.length * 100)}%`;
}
function goToQuestion(idx) {
  state.idx = idx;
  keepPosition(state.queue[idx].id);
  renderPractice();
}
function renderAnswerSheet(page = Math.floor(state.idx / 40), previous = null) {
  const grid = byId('qNav');
  const total = state.queue.length;
  const pageSize = 40;
  const end = Math.min((page + 1) * pageSize, total);
  const progress = loadProgress();
  grid.innerHTML = `
    <div class="nav-grid">
      ${state.queue.slice(page * pageSize, end).map((q, slot) => {
        const i = page * pageSize + slot;
        const r = qProgress(progress, q.id);
        const style = hasAnswered(r) ? (r.correct ? 'done' : 'wrong') : '';
        const result = hasAnswered(r) ? (r.correct ? '答对' : '答错') : '未做';
        return `<button type="button" data-index="${i}" class="${style}" aria-label="第 ${i + 1} 题，${result}" ${i === state.idx ? 'aria-current="step"' : ''}>${i + 1}</button>`;
      }).join('')}
    </div>
    ${total > pageSize ? `<div class="nav-paging">
      <button class="btn" id="navPrev" ${page === 0 ? 'disabled' : ''}>${icon('chevron-left')} 上一组</button>
      <span class="muted">${page * pageSize + 1}–${end} / ${total}</span>
      <button class="btn" id="navNext" ${end >= total ? 'disabled' : ''}>下一组 ${icon('chevron-right')}</button>
    </div>` : ''}`;
  grid.querySelectorAll('[data-index]').forEach(btn => btn.addEventListener('click', () => goToQuestion(Number(btn.dataset.index))));
  byId('navPrev')?.addEventListener('click', () => renderAnswerSheet(page - 1, 'navPrev'));
  byId('navNext')?.addEventListener('click', () => renderAnswerSheet(page + 1, 'navNext'));
  if (previous) (grid.querySelector(`#${previous}:enabled`) || grid.querySelector('button'))?.focus();
}
function renderPractice() {
  const q = state.queue[state.idx];
  if (!q) { renderHome('homeTitle'); return; }
  document.body.classList.add('practice');
  byId('headerSearch').hidden = true;
  const progress = loadProgress();
  const rec = qProgress(progress, q.id);
  const clearing = state.mode === 'clearWrong';
  const type = TYPE_LABEL[q.type] || '选择题';
  const total = state.queue.length;
  const position = state.idx + 1;
  const required = q.type === 'multiple' ? 2 : 1;
  const maximum = q.type === 'multiple' ? q.maxSelections || 4 : 1;
  const choices = q.type === 'judge' ? [{ key: 'true', text: '正确' }, { key: 'false', text: '错误' }] : q.options;
  let selected = [];
  let finished = false;
  refreshStreak(progress);
  view.innerHTML = `
    <div class="practice-shell">
      <div class="practice-top"><button class="btn text-button" id="backBtn">${icon('arrow-left')} 返回首页</button><span>${esc(MODE_LABEL[state.mode])}${['all', 'random', 'random20', 'unfinished'].includes(state.mode) ? ' · ' + STAGE_MAP[state.stage].label : ''}</span></div>
      <section class="card question-card" aria-labelledby="questionTitle">
        <div class="question-progress">
          <div class="progress-label"><strong>${clearing ? '订正进度' : `第 ${position} <span>/ ${total} 题</span>`}</strong><span id="qProg">${questionStats(progress)}</span></div>
          ${clearing ? meter(state.clearTotal - state.clearPending.size, state.clearTotal, '错题订正进度') : meter(position, total, `第 ${position} 题，共 ${total} 题`)}
        </div>
        <div class="question-meta">${subjectChip(q.subject, q.subjectLabel)}<span class="chip">${type}</span><span class="chapter-tag">${esc(q.chapter)}</span></div>
        ${q.material ? `<div class="material">${expParas(q.material)}</div>` : ''}
        <h1 id="questionTitle" tabindex="-1">${esc(q.stem)}</h1>
        ${q.image ? '<div id="qfig"></div>' : ''}
        ${q.type === 'multiple' ? `<p class="muted selection-hint">请选择 ${required}–${maximum} 项后提交。</p>` : ''}
        <div class="options" role="group" aria-label="${type}选项">
          ${choices.map((o, i) => `<button class="opt" type="button" data-choice="${i}" aria-pressed="false">
            ${q.type === 'judge' ? '' : `<span class="opt-key">${esc(o.key)}</span>`}<span class="opt-text">${esc(o.text)}</span><span class="opt-status"></span>
          </button>`).join('')}
        </div>
        <div id="result" tabindex="-1"></div>
        <div class="question-actions">
          <div class="question-tools">
            <button class="btn text-button" id="revealBtn">查看解析</button>
            <button class="btn text-button" id="favBtn" aria-pressed="${!!rec?.favorite}">${icon('bookmark')} ${rec?.favorite ? '已收藏' : '收藏'}</button>
          </div>
          <div class="question-flow">
            <button class="btn primary" id="submitBtn" disabled>提交答案</button>
            <button class="btn" id="nextBtn" ${clearing || total === 1 ? 'hidden' : ''}>${position < total ? '跳过' : '结束练习'} ${icon('arrow-right')}</button>
          </div>
        </div>
      </section>
      ${!clearing && total > 1 ? `<details class="card navbox" id="navBox" ${state.navOpen ? 'open' : ''}><summary>答题卡 <span class="muted">${total} 道</span></summary><div id="qNav"></div></details>` : ''}
    </div>`;
  if (q.image) renderFigure(q);
  const optionButtons = [...view.querySelectorAll('[data-choice]')];
  const submit = byId('submitBtn');
  const reveal = byId('revealBtn');
  const next = byId('nextBtn');
  const result = byId('result');
  function showResult(correct) {
    finished = true;
    const preview = correct === null;
    optionButtons.forEach((btn, i) => {
      const key = choices[i].key;
      const right = q.answer.includes(key);
      const wrong = !preview && selected.includes(key) && !right;
      btn.disabled = true;
      btn.classList.toggle('right', right);
      btn.classList.toggle('wrong', wrong);
      btn.querySelector('.opt-status').textContent = right ? '正确项' : wrong ? '选错' : '';
    });
    const verdict = preview ? '参考解析' : correct ? '答对了' : '答错了';
    const tone = preview ? 'preview' : correct ? 'correct' : 'incorrect';
    result.innerHTML = `<div class="result-panel ${tone}">
      <p class="result-title"><strong>${verdict}</strong><span>正确答案 <b>${esc(displayAnswer(q))}</b></span></p>
      <div class="exp-body">${expParas(q.explanation)}</div>
      ${q.trap ? `<p class="result-note">易错点 · ${esc(q.trap.replace(/^易错点[：:]\s*/, ''))}</p>` : ''}
      ${q.source ? `<details class="source-details"><summary>题目来源</summary><p>${esc(q.source)}</p></details>` : ''}
      ${q.verify === 'unverified-answer-page' ? '<p class="result-note">此题答案按教材核对，原卷答案页待核。</p>' : ''}
    </div>`;
    const score = byId('qProg');
    score.textContent = questionStats(loadProgress());
    if (clearing) view.querySelector('.question-progress progress').value = state.clearTotal - state.clearPending.size;
    submit.hidden = true;
    reveal.hidden = true;
    next.hidden = false;
    next.classList.add('primary');
    next.innerHTML = `${state.idx < state.queue.length - 1 ? '下一题' : '完成练习'} ${icon('arrow-right')}`;
    if (byId('navBox')?.open) renderAnswerSheet();
    const resultTop = result.getBoundingClientRect().top;
    result.focus({ preventScroll: true });
    if (resultTop > window.innerHeight - 120) result.scrollIntoView({ block: 'start' });
  }
  optionButtons.forEach((btn, i) => btn.addEventListener('click', () => {
    if (finished) return;
    const key = choices[i].key;
    if (maximum === 1) selected = [key];
    else if (selected.includes(key)) selected = selected.filter(value => value !== key);
    else if (selected.length < maximum) selected.push(key);
    optionButtons.forEach((option, index) => {
      option.setAttribute('aria-pressed', String(selected.includes(choices[index].key)));
    });
    submit.disabled = selected.length < required;
  }));
  byId('backBtn').addEventListener('click', () => renderHome('homeTitle'));
  byId('favBtn').addEventListener('click', event => {
    const favorited = persist(() => toggleFavorite(q.id));
    if (favorited === undefined) return;
    event.currentTarget.innerHTML = `${icon('bookmark')} ${favorited ? '已收藏' : '收藏'}`;
    event.currentTarget.setAttribute('aria-pressed', String(favorited));
  });
  next.addEventListener('click', () => {
    if (state.idx < state.queue.length - 1) {
      goToQuestion(state.idx + 1);
    } else {
      keepPosition(null);
      renderHome('homeTitle');
    }
  });
  reveal.addEventListener('click', () => {
    if (finished) return;
    persist(() => recordReveal(q.id));
    if (clearing) {
      state.queue.push(q);
      toast('看过解析后，这道题会在队尾再出现。');
    }
    showResult(null);
  });
  submit.addEventListener('click', () => {
    if (finished || selected.length < required) return;
    const correct = isSameSet(selected, q.answer);
    const res = persist(() => recordAnswer(q, selected, correct, {
      mode: state.mode, stage: state.stage, nextId: state.queue[state.idx + 1]?.id,
    }));
    if (!res) return;
    state.streakCorrect = correct ? state.streakCorrect + 1 : 0;
    if (clearing && !correct) {
      state.queue.push(q);
      toast('这道题已放回队尾，稍后再做一次。');
    } else if (clearing && state.clearPending.delete(q.id) && !state.clearPending.size) {
      toast('错题订正完成。');
    } else if (correct && state.streakCorrect % 5 === 0) {
      toast(`连续答对 ${state.streakCorrect} 题${res.points ? ` · +${res.points} 分` : ''}`);
    } else if (res.points > 0) {
      toast(`+${res.points} 分`);
    }
    refreshStreak();
    showResult(correct);
  });
  const nav = byId('navBox');
  if (nav) {
    nav.addEventListener('toggle', () => {
      state.navOpen = nav.open;
      if (nav.open && !byId('qNav').childElementCount) renderAnswerSheet();
    });
  }
  moveFocus(byId('questionTitle'), true);
}

const progressDialog = byId('progressDialog');
const importInput = byId('importFile');
let importProgress;
let importRevision = 0;
function showImportMessage(message = '', preview = false) {
  byId('importMessage').textContent = message;
  byId('importPreview').hidden = !preview;
}
byId('progressButton').addEventListener('click', () => progressDialog.showModal());
progressDialog.addEventListener('close', () => {
  importRevision++;
  importProgress = null;
  showImportMessage();
});
byId('exportBtn').addEventListener('click', () => {
  const data = createProgressBackup();
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `xiaosimen-${todayStr()}-backup.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
});
byId('importBtn').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', async () => {
  const revision = ++importRevision;
  const file = importInput.files[0];
  importInput.value = '';
  importProgress = null;
  if (!file) { showImportMessage(); return; }
  if (file.size > 4 * 1024 * 1024) { showImportMessage('备份文件过大，请选择从本应用下载的 JSON 文件。'); return; }
  showImportMessage('正在读取备份…');
  try {
    const progress = readProgressBackup(await file.text());
    if (revision !== importRevision || !progressDialog.open) return;
    importProgress = progress;
    const count = Object.values(progress.banks).filter(hasAnswered).length;
    showImportMessage(`备份包含 ${count} 道作答记录。确认后将覆盖当前网址的本机进度。`, true);
  } catch {
    if (revision !== importRevision) return;
    showImportMessage('无法读取此备份，请选择从小四门刷题下载的 JSON 文件。');
  }
});
byId('cancelImport').addEventListener('click', () => { importProgress = null; showImportMessage(); });
byId('confirmImport').addEventListener('click', () => {
  if (!importProgress) return;
  const done = persist(() => { saveProgress(importProgress); return true; });
  if (!done) return;
  state.stage = stagePref(importProgress);
  progressDialog.close();
  renderHome('homeTitle');
  toast('学习进度已导入。');
});
byId('resetBtn').addEventListener('click', () => {
  if (!confirm('确定清空当前浏览器的小四门答题、收藏和打卡记录？')) return;
  const done = persist(() => {
    saveProgress({ banks: {}, studyDays: [], stage: state.stage });
    localStorage.removeItem(GROWTH_KEY);
    return true;
  });
  if (!done) return;
  progressDialog.close();
  renderHome('homeTitle');
  toast('本机进度已清空。');
});
byId('homeLink').addEventListener('click', event => {
  if (banks && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    renderHome('homeTitle');
  }
});
byId('headerSearch').addEventListener('click', event => {
  const search = byId('searchBox');
  if (!search) return;
  event.preventDefault();
  search.focus();
});
const figureDialog = byId('figureDialog');
figureDialog.addEventListener('click', event => { if (event.target === figureDialog) figureDialog.close(); });
figureDialog.addEventListener('close', () => byId('figureFull').removeAttribute('src'));

async function init() {
  try {
    const loadDaily = dailyQuestions().length ? null : loadScript('./data/daily-questions-xiaosimen.js?v=7').catch(console.warn);
    banks = await ensureBanks(SUBJECT_ORDER);
    await loadDaily;
    bankQuestions = allQuestions(banks, SUBJECT_ORDER);
    library = [...bankQuestions, ...dailyQuestions()];
    renderHome();
  } catch (error) {
    console.error(error);
    view.innerHTML = '<section class="card loading-card"><h1>题库暂时无法加载</h1><p class="muted">检查网络后再试一次。</p><button class="btn primary" id="retryBtn">重新加载</button></section>';
    byId('retryBtn').addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = '正在加载…';
      await init();
    });
  }
}
init();
