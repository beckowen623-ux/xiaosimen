/* 中考提分题库 · 人教版 · 纯静态 + localStorage
 * 仿 beckowen623-ux/quiz-bank-app 的结构（懒加载 .js 题库、localStorage 进度、SRS 错题复习），
 * 题型：单选、多选、判断（自动判分）；填空（自动判分）；材料分析 / 论述 / 简答（对照得分点自评）。
 */
'use strict';
const STORAGE_KEY = 'xiaosimen-quiz-v1';
const GROWTH_KEY = 'xiaosimen-growth-v1';
const LEGACY_TRIAL_KEY = 'xiaosimen-legacy-trial-start-v1';
const DAY_MS = 86_400_000;
const LEGACY_TRIAL_MS = 7 * DAY_MS;
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
// 页面上统一说“初一上学期”等，不说“七上、八下”：只改显示出来的文字，数据里的章节名（按章节练、做题记录靠它对应）不动
const GRADE_CN = { 七: '一', 八: '二', 九: '三' };
function gradeText(text) { return String(text).replace(/([七八九])([上下])(?![册午面])/g, (m, g, h) => `初${GRADE_CN[g]}${h}学期`); }
function prettifyGrades(node) {
  if (node.nodeType === 3) { if (/[七八九][上下]/.test(node.data)) node.data = gradeText(node.data); return; }
  if (node.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA)$/.test(node.nodeName)) return;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) if (/[七八九][上下]/.test(t.data)) t.data = gradeText(t.data);
}
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
function legacyTrialStartedAt() {
  const { startedAt } = readStored(LEGACY_TRIAL_KEY);
  return Number.isSafeInteger(startedAt) && startedAt > 0 ? startedAt : null;
}
function startLegacyTrial(progress, launchDate, now = Date.now()) {
  const launchAt = Date.parse(launchDate + 'T00:00:00+08:00');
  if (!(now >= launchAt) || localStorage.getItem(LEGACY_TRIAL_KEY) !== null) return;
  const studiedBeforeLaunch = studyDates(progress).some(date =>
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < launchDate);
  if (studiedBeforeLaunch) {
    localStorage.setItem(LEGACY_TRIAL_KEY, JSON.stringify({ startedAt: now }));
  }
}
function legacyTrialDays(now = Date.now()) {
  const startedAt = legacyTrialStartedAt();
  if (startedAt === null) return 0;
  const remaining = LEGACY_TRIAL_MS - Math.max(0, now - startedAt);
  return Math.max(0, Math.ceil(remaining / DAY_MS));
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
    throw new Error('无效的题库进度备份');
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
function checkinStatus(all, progress, requiresCorrections = true) {
  const c = getCheckin(progress);
  const today = todayStr();
  const alreadyDone = c.lastDate === today;
  const gap = c.lastDate ? daysBetween(c.lastDate, today) : 99;
  const isMakeupDay = gap === 2; // 昨天漏打 1 天
  const makeupUsed = (c.makeup && c.makeup.countThisMonth) || 0;
  const makeupAllowed = isMakeupDay && makeupUsed < MAKEUP_MONTH_LIMIT;
  const clearN = requiresCorrections ? clearWrongList(all, progress).length : 0;
  const freshDone = Object.keys(c.dayStats.first || {}).length;
  const freshTarget = (isMakeupDay && makeupAllowed) ? MAKEUP_FRESH_TARGET : DAILY_FRESH_TARGET;
  const canCheckin = !alreadyDone && clearN === 0 && freshDone >= freshTarget;
  return { alreadyDone, gap, isMakeupDay, makeupAllowed, makeupUsed, makeupLimit: MAKEUP_MONTH_LIMIT, clearN, freshDone, freshTarget, canCheckin };
}
// 执行打卡（调用前先用 checkinStatus 确认 canCheckin）。返回明细，供首页提示。
function doCheckin(all, progress, requiresCorrections = true) {
  const st = checkinStatus(all, progress, requiresCorrections);
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
// 手机网络偶尔断一下，单个文件失败就整页打不开；失败后隔 1 秒、3 秒自动再试两次
const loadedScripts = new Map();
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => { script.remove(); reject(new Error('无法加载题库 ' + src)); };
    document.head.appendChild(script);
  });
}
function loadScript(src) {
  if (!loadedScripts.has(src)) {
    const request = (async () => {
      for (let attempt = 0; ; attempt++) {
        try { return await loadScriptOnce(src); } catch (error) {
          if (attempt >= 2) { loadedScripts.delete(src); throw error; }
          await new Promise(r => setTimeout(r, attempt ? 3000 : 1000));
        }
      }
    })();
    loadedScripts.set(src, request);
  }
  return loadedScripts.get(src);
}
async function ensureBanks(subjectKeys) {
  await Promise.all(subjectKeys.map(key => loadScript(`./data/${key}.js?v=8`)));
  const banks = window.XIAOSIMEN_BANKS || {};
  const missing = subjectKeys.filter(key => !banks[key]?.questions?.length);
  if (missing.length) {
    missing.forEach(key => loadedScripts.delete(`./data/${key}.js?v=8`));
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

// ---------- 主观题（材料分析 / 论述 / 简答）与填空题 ----------
// data/subjective-<科目>.js 用紧凑格式书写，这里展开成与选择题相同的题目对象。
// id = 科目-z<章>-<序号>（主观题）或 科目-k<章>-<序号>（填空题），按文件内顺序编号。
function expandSubjective(subject, list, chapters = []) {
  const counters = {};
  return list.map(entry => {
    const blank = typeof entry.b === 'string';
    const key = (blank ? 'k' : 'z') + entry.c;
    counters[key] = (counters[key] || 0) + 1;
    // 地理、生物第 5、6 章是会考总复习，归在初二下学期（八年级会考），不算九年级。
    const reviewChapter = (subject === 'dili' || subject === 'shengwu') && entry.c >= 5;
    const stage = reviewChapter ? STAGE_MAP['8-down'] : (STAGES[entry.c - 1] || STAGES[0]);
    const base = {
      id: `${subject}-${key}-${String(counters[key]).padStart(2, '0')}`,
      subject, subjectLabel: SUBJECTS[subject].label,
      chapterId: entry.c, chapter: chapters.find(c => c.id === entry.c)?.title || '',
      number: counters[key], grade: stage.grade, stage: stage.stage,
      explanation: entry.exp || '', source: entry.src || '',
    };
    if (blank) {
      const blanks = entry.a.map(alts => alts.split('|'));
      return { ...base, type: 'blank', meta: '填空题', stem: entry.b, blanks, answer: blanks.map(alts => alts[0]) };
    }
    const points = entry.p.map(([text, score, keys]) => ({ text, score, keys: keys ? keys.split('|') : [] }));
    return {
      ...base, type: 'essay', meta: entry.m || '简答题', material: entry.mat || '', stem: entry.q,
      points, score: points.reduce((sum, p) => sum + p.score, 0),
      sample: entry.ex || '', method: entry.how || '', answer: [],
    };
  });
}
async function loadSubjective() {
  await Promise.allSettled(SUBJECT_ORDER.map(key => loadScript(`./data/subjective-${key}.js?v=${SUBJECTIVE_VERSION}`)));
  const raw = window.XIAOSIMEN_SUBJECTIVE || {};
  return SUBJECT_ORDER.flatMap(key => expandSubjective(key, raw[key] || [], banks?.[key]?.chapters));
}
function normAnswer(text) {
  return String(text || '').normalize('NFKC').replace(/−/g, '-').toLowerCase()
    .replace(/-(?!\d)/g, '') // 负号（后面跟数字）保留，-6 和 6 不能算同一个答案
    .replace(/[\s，,。.、；;：:“”"'‘’《》<>（）()【】\[\]—_·…!！?？]/g, '');
}
function blankMatches(input, alts) {
  const u = normAnswer(input);
  if (!u) return false;
  return alts.some(alt => {
    const a = normAnswer(alt);
    return u === a || u.replace(/年$/, '') === a.replace(/年$/, '') || (a.length >= 2 && u.includes(a) && u.length <= a.length + 2);
  });
}
function essayHits(q, text) {
  const t = normAnswer(text);
  return q.points.map(p => !!t && p.keys.some(k => { const kk = normAnswer(k); return kk && t.includes(kk); }));
}
// 当前学期能练的主观题 / 填空题：所选科目（默认本学期在学科目）+ 本学期及以前的章节；
// 没做过的排前面（本学期新课在前、往前复习在后，四科轮换），做过的排后面。
function subjectiveScope(type, stage = state.stage, subject = state.drillSubject) {
  const subjects = subject ? [subject] : activeSubjectsForStage(stage);
  const order = stageOrder(stage);
  return subjectiveQuestions.filter(q => q.type === type && subjects.includes(q.subject) && stageOrder(q.stage) <= order);
}
function subjectiveQueue(type, progress) {
  const scope = subjectiveScope(type);
  const fresh = scope.filter(q => !hasAnswered(qProgress(progress, q.id)));
  const done = scope.filter(q => hasAnswered(qProgress(progress, q.id)));
  const byStage = list => [...new Set(list.map(q => q.stage))].sort((a, b) => stageOrder(b) - stageOrder(a))
    .flatMap(stage => interleave(SUBJECT_ORDER.map(key => list.filter(q => q.stage === stage && q.subject === key))));
  const ordered = byStage(fresh);
  // 会考 / 中考冲刺学期：福建中考真题大题排最前面。
  const examStage = ['8-down', '9-up', '9-down'].includes(state.stage);
  const real = q => /中考/.test(q.source);
  return [...(examStage ? [...ordered.filter(real), ...ordered.filter(q => !real(q))] : ordered), ...shuffle(done)];
}

// ---------- 核心：自动刷题顺序 buildQueue(stage) ----------
// 规则（也在 README.md 里写清楚）：
//  1. 到期错题最先：SRS 到期（1/3/7/14 天）的题插在队首；
//  2. 平时：当前学期新课按人教版章节顺序，四门轮着刷（interleave）；
//  3. 初二下学期：新课后自动回滚复习七年级到八年级地理、生物（备战会考），
//     包括地理/生物的总复习章（九上/九下章，内容是七、八年级总复习，提前用于会考冲刺）；
//  4. 初三上学期：只留道法、历史新课，之后轻量复习七、八年级道法、历史；
//  5. 初三下学期：新课后自动进七到九年级道法、历史总复习。
function buildQueue(stage, banks, progress, includeDue = true) {
  const active = activeSubjectsForStage(stage);
  const all = allQuestions(banks, SUBJECT_ORDER); // 全部题，用于错题/复习判断
  const order = stageOrder(stage);
  const due = includeDue ? dueQuestions(all.filter(q => active.includes(q.subject)), progress) : [];
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
  const next = { ...prev, ...(opts?.extra || {}), done: true, revealed: false, correct, wrong: !correct, selected: [...selected], attempts: (prev.attempts || 0) + 1, lastAt: Date.now() };
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

const TRIAL_QUESTIONS_PER_TERM = 20;
const TRIAL_ESSAYS_PER_SUBJECT = 2;
const SHARE_REWARD = 3;
const SHARE_CAP = 30;
const SHARE_TRIAL_KEY = 'xiaosimen-share-trial-v1';
const FULL_ONLY_MODES = new Set(['blank', 'clearWrong', 'due', 'retry', 'sunday']);

function trialQuestionIds(objectives, subjective) {
  const allowed = new Set();
  const counts = new Map();
  const ordered = [...objectives].sort((a, b) => (a.chapterId - b.chapterId) || (a.number - b.number));
  for (const q of ordered) {
    const group = q.subject + '|' + q.stage;
    const count = counts.get(group) || 0;
    if (count >= TRIAL_QUESTIONS_PER_TERM) continue;
    counts.set(group, count + 1);
    allowed.add(q.id);
  }
  counts.clear();
  for (const q of subjective) {
    if (q.type !== 'essay') continue;
    const count = counts.get(q.subject) || 0;
    if (count >= TRIAL_ESSAYS_PER_SUBJECT) continue;
    counts.set(q.subject, count + 1);
    allowed.add(q.id);
  }
  return allowed;
}

function extendShareTrial(trial, day, candidates) {
  if (trial.days.includes(day) || trial.ids.length >= SHARE_CAP) return trial;
  const alreadyFree = new Set(trial.ids);
  const choices = dedupeById(candidates).filter(q => !alreadyFree.has(q.id))
    .slice(0, Math.min(SHARE_REWARD, SHARE_CAP - trial.ids.length));
  if (!choices.length) return trial;
  return { days: [...trial.days, day], ids: [...trial.ids, ...choices.map(q => q.id)] };
}

function readShareTrial() {
  const value = readStored(SHARE_TRIAL_KEY);
  const savedStrings = list => Array.isArray(list) ? [...new Set(list.filter(v => typeof v === 'string'))] : [];
  return { days: savedStrings(value?.days).slice(-SHARE_CAP), ids: savedStrings(value?.ids).slice(0, SHARE_CAP) };
}

// ---------- 界面 ----------
const byId = id => document.getElementById(id);
const view = byId('view');
const stagePref = progress => Object.hasOwn(STAGE_MAP, progress.stage) ? progress.stage : STAGES[0].stage;
const state = {
  stage: stagePref(loadProgress()), mode: 'all', queue: [], idx: 0, streakCorrect: 0,
  keyword: '', searchSubject: '', clearPending: new Set(), clearTotal: 0, navOpen: false,
  drillSubject: '', session: new Map(), keys: null,
};
const MODE_LABEL = {
  all: '按学期练习', random: '随机练习', random20: '今日新题', unfinished: '只做未做题',
  wrong: '错题本', due: '到期复习', favorite: '收藏题', clearWrong: '错题订正',
  sunday: '周日小测', daily: '每日一题', single: '单题练习',
  essay: '主观题提分', blank: '填空速记', retry: '本组错题重练', national: '全国真题练习',
  weekly: '本周一卷', paper: '精编模拟卷', everWrong: '曾错题', earlybird: '早鸟自测', chapter: '按章节练', sync: '同步章节卷', knowledge: '知识点补缺',
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
const TYPE_LABEL = { single: '单选题', multiple: '多选题', judge: '判断题', blank: '填空题', essay: '主观题' };
const SUBJECTIVE_VERSION = 1;
const ESSAY_PASS = 0.6; // 自评得分率 ≥60% 算过关，否则进错题本
// 各类主观题的通用答题方法（题目没有专属提示时显示）
const METHOD_TIPS = {
  判断说理: '三步走：① 亮明判断（✓ / ×）；② 用教材观点说理由（为什么对 / 错在哪）；③ 提出正确做法。',
  时事点评: '一句话概括主旨 → 体现了什么理念（以人民为中心、创新、绿色……）→ 有什么意义（对国家、社会、个人）。',
  材料分析题: '先圈设问关键词（原因 / 影响 / 特点 / 关系），再到材料里找对应信息，最后“材料信息 + 教材观点”分点作答，一点一句。',
  论述题: '小论文三件套：观点（主题一句话）→ 史实 / 论据（至少两条，写清时间、人物、事件）→ 结论升华。',
  简答题: '按“是什么—为什么—怎么做”或“背景—内容—意义”分点作答，用①②③标号，关键词写准。',
  探究题: '按“提出问题 → 分析问题（用到哪些条件）→ 解决问题（具体步骤）”写，问题要具体可操作。',
  综合题: '先读图读题找关键信息，再用课本术语分点回答，因果关系写完整。',
  实验探究: '紧扣“变量—对照—现象—结论”：找准唯一变量，说清每一步操作的目的。',
};
const fmt = new Intl.NumberFormat('zh-CN');
let banks;
let bankQuestions = [];
let subjectiveQuestions = [];
let library = [];
let toastTimer;

const paidLaunchDate = document.querySelector('meta[name="xiaosimen-paid-launch-date"]')?.content || '';
let paidAccess = (() => {
  try { return localStorage.getItem('xiaosimen_paid') === '1'; } catch { return false; }
})();
let legacyCountdownTimer;
let referralProfile = null;

function hasFullAccess() { return paidAccess || legacyTrialDays() > 0; }

function showReferralProfile() {
  window.QuizReferrals?.mountTeaser?.(byId("sprintTeaser"), "xiaosimen", { count: "24 套 · 可打印", showFriend: !paidAccess, paid: paidAccess });
  window.QuizReferrals?.mount(byId("referralPanel"), referralProfile, "xiaosimen");
}

async function refreshReferralProfile() {
  if (!paidAccess || !window.QuizReferrals) return;
  referralProfile = await window.QuizReferrals.load();
  showReferralProfile();
}
let baseTrialIds = new Set();
let shareTrial = readShareTrial();

const unlockDialog = byId('unlockDialog');
const redeemForm = byId('redeemForm');
const redeemMessage = byId('redeemMessage');
const inviteInput = byId('inviteCode');
inviteInput.value = window.QuizReferrals?.incoming() || '';
if (inviteInput.value) byId('inviteFold')?.setAttribute('open', '');
const visitorSource = new URL(location.href).searchParams.get('from') || 'direct';

function isTrialQuestion(q) {
  if (q.kpFree) return true; // 知识点补缺：每个知识点前 3 题和诊断题免费
  if (q.earlybird) return true; // 早鸟自测卷限时免费
  if (q.paperId && freeOpen('phone', q.paperId)) return true; // 已领取的免费整卷
  if (q.national) return q.preview === true; // 原卷免费看；在线刷题属于完整版，每种题型可免费试一组
  return baseTrialIds.has(q.id) || shareTrial.ids.includes(q.id);
}

function hasQuestionHistory(progress, q) {
  const record = qProgress(progress, q.id);
  return hasAnswered(record) || !!record?.revealed;
}

function availableQueue(progress) {
  if (!banks) return [];
  const fullAccess = hasFullAccess();
  const queue = buildQueue(state.stage, banks, progress, fullAccess);
  return fullAccess ? queue : queue.filter(isTrialQuestion);
}

function accountingRecommendation() {
  return '<a class="cross-bank-link" data-cross-bank href="https://tinawin.cc.cd/?from=x4m">家长自己在考证？会计 / 审计 / 软考题库 →</a>';
}

view.addEventListener('click', event => {
  if (event.target.closest('[data-cross-bank]')) trackVisit('cross_click');
});

// 自己人不计数：用 ?me=1 打开一次，这台设备以后的访问都不统计（?me=0 取消）
const NO_TRACK = (() => {
  try {
    const flag = new URLSearchParams(location.search).get("me");
    if (flag === "1") localStorage.setItem("no-track", "1");
    if (flag === "0") localStorage.removeItem("no-track");
    return localStorage.getItem("no-track") === "1";
  } catch { return false; }
})();
function trackVisit(event) {
  if (NO_TRACK) return;
  void fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, source: visitorSource }),
    keepalive: true,
  }).catch(() => {});
}

async function restoreAccess() {
  try {
    const response = await fetch('/api/access/status', { cache: 'no-store' });
    if (response.ok) {
      const authed = (await response.json()).authenticated === true;
      if (paidAccess !== authed) {
        paidAccess = authed;
        try { localStorage.setItem('xiaosimen_paid', authed ? '1' : '0'); } catch {}
        if (byId('subjectSections')) renderHome();
        else {
          window.NationalExams?.refresh?.();
          window.KnowledgeHub?.refresh?.();
        }
      }
    }
  } catch {
    // A connection failure leaves the trial / cached state available.
  }
}

async function loadPurchaseOptions() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) return;
    const options = await response.json();
    if (options.examMinutes && typeof options.examMinutes === 'object') {
      for (const [key, value] of Object.entries(options.examMinutes)) if (key in X4M_MINUTES_DEFAULT && Number.isInteger(value) && value >= 10 && value <= 300) x4mMinutes[key] = value;
    }
    for (const [elementId, offer] of [['schoolOffer', options.xiaosimen], ['bundleOffer', options.bundle]]) {
      const offerElement = byId(elementId);
      const link = offerElement.querySelector('a');
      const copy = offerElement.querySelector('.offer-cta-row button') || offerElement.querySelector('button:not(#directPaySchool):not(#directPayBundle)');
      link.hidden = true;
      copy.hidden = true;
      if (/^https:\/\//i.test(offer?.link || '')) {
        link.href = offer.link;
        link.hidden = false;
        link.onclick = () => trackVisit('buy_click');
      }
      if (offer?.text) {
        copy.hidden = false;
        copy.onclick = async () => {
          try {
            await navigator.clipboard.writeText(offer.text);
            trackVisit('copy_code');
            redeemMessage.textContent = '✓ 口令已复制！请现在切换到「闲鱼 App」，会自动弹出商品页；下单拿到 10 位码回来填在下方即可秒解锁。';
            toast('闲鱼口令已复制，去打开闲鱼 App 即可看到商品');
          } catch {
            redeemMessage.textContent = '复制失败，请直接打开闲鱼搜索用户「王者荣耀速度飞车」。';
          }
        };
      }
    }
  } catch {
    // Codes can still be submitted when the offer configuration is unavailable.
  }
}

window.addEventListener?.('quiz-sprint-buy', () => openUnlock());
// 买过的人回来兑换：兑换框在弹窗最底下，顶部给一个直达按钮
byId('redeemJump')?.addEventListener('click', () => {
  const input = byId('accessCode');
  input?.scrollIntoView({ block: 'center' });
  input?.focus({ preventScroll: true });
});
byId('copySeller')?.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText('王者荣耀速度飞车'); trackVisit('copy_code'); redeemMessage.textContent = '已复制，打开闲鱼搜索框粘贴，切换到“用户”就能找到。'; }
  catch { redeemMessage.textContent = '复制失败，请手动输入用户名搜索。'; }
});
byId('ratingProofBtn')?.addEventListener('click', () => {
  const fig = byId('figureDialog');
  const full = byId('figureFull');
  const src = byId('figureSource');
  if (!fig || !full) return;
  full.src = './assets/proof/xianyu-rating.webp';
  if (src) src.textContent = '闲鱼卖家主页实拍 · 100% 服务好评（用户名：王者荣耀速度飞车）';
  if (!fig.open) fig.showModal();
});
// ---------- 打印练习卷：按科目、册次组一张纸质卷（未解锁时用免费题组“体验卷”） ----------
function printChapters(subject) {
  return (banks?.[subject]?.chapters || []).map(c => ({ id: c.id, title: c.title }));
}
function fillPrintChapters() {
  const subjectSelect = byId('printSubject');
  const chapterSelect = byId('printChapter');
  if (!subjectSelect || !chapterSelect) return;
  if (!banks) {
    chapterSelect.innerHTML = '<option value="">正在加载册次…</option>';
    void startBanksBackgroundLoad().then(() => { if (banks) fillPrintChapters(); });
    return;
  }
  const stageIndex = Math.max(0, STAGES.findIndex(s => s.stage === state.stage));
  chapterSelect.innerHTML = printChapters(subjectSelect.value).map(c => `<option value="${c.id}">${esc(c.title.split(' · ')[0])}${/会考/.test(c.title) ? ' · ' + esc(c.title.split(' · ')[1] || '') : ''}</option>`).join('');
  const preferred = [...chapterSelect.options].find(o => Number(o.value) === stageIndex + 1);
  if (preferred) chapterSelect.value = preferred.value;
}
function buildPrintPaper(subject, chapterId, full = hasFullAccess()) {
  const progress = loadProgress();
  const allowed = q => full || isTrialQuestion(q);
  const pick = (list, n) => {
    const fresh = list.filter(q => !hasAnswered(qProgress(progress, q.id)));
    const rest = list.filter(q => hasAnswered(qProgress(progress, q.id)));
    return [...shuffle(fresh), ...shuffle(rest)].slice(0, n).sort((a, b) => (a.number || 0) - (b.number || 0));
  };
  const inChapter = q => q.subject === subject && q.chapterId === chapterId && allowed(q);
  const choices = pick(library.filter(q => inChapter(q) && (q.type === 'single' || q.type === 'multiple') && !q.image), 20);
  const blanks = pick(library.filter(q => inChapter(q) && q.type === 'blank'), 4);
  const essays = pick(library.filter(q => inChapter(q) && q.type === 'essay'), 2);
  const tag = q => (q.source || '').match(/20\d\d/) ? (q.source || '').replace(/(第\d+题).*$/, '$1').slice(0, 24) : '';
  const sections = [{ title: '一、选择题', note: '每题选出最合适的答案。', items: choices.map(q => ({
    type: 'choice', multi: q.type === 'multiple', tag: tag(q), stem: q.stem,
    options: q.options.map(o => ({ key: o.key, text: o.text })), answer: q.answer.join(''), explanation: q.explanation || '', source: q.source || '',
  })) }];
  if (blanks.length) sections.push({ title: '二、填空速记', items: blanks.map(q => ({ type: 'blank', stem: q.stem, answer: q.answer, explanation: q.explanation || '' })) });
  if (essays.length) sections.push({ title: `${blanks.length ? '三' : '二'}、主观题`, note: '先写，再对照得分点。', items: essays.map(q => ({
    type: 'essay', kind: q.meta, tag: tag(q), material: q.material, stem: q.stem, score: q.score,
    points: q.points.map(p => ({ text: p.text, score: p.score })), sample: q.sample, explanation: q.explanation || '', source: q.source || '',
  })) });
  const chapter = printChapters(subject).find(c => c.id === chapterId);
  return {
    id: `print-${subject}-${chapterId}`, group: SUBJECTS[subject].label, subject: SUBJECTS[subject].label,
    term: chapter?.title || '', title: `${SUBJECTS[subject].label} · ${chapter?.title || ''} 练习卷${full ? '' : '（体验卷）'}`,
    sections, count: choices.length + blanks.length + essays.length,
  };
}
function wirePrintCard() {
  const subjectSelect = byId('printSubject');
  if (!subjectSelect) return;
  fillPrintChapters();
  subjectSelect.addEventListener('change', fillPrintChapters);
  byId('printPaper').addEventListener('click', () => {
    const paper = buildPrintPaper(subjectSelect.value, Number(byId('printChapter').value));
    if (!paper.count) { toast('这一册暂时没有可打印的题。'); return; }
    if (!window.QuizReferrals?.showPapers) { toast('打印功能加载中，请稍后再试。'); return; }
    window.QuizReferrals.showPapers([paper], { print: true });
    if (!hasFullAccess()) toast('这是体验卷，用免费题组成；解锁完整版可打印全部题目。');
  });
}

function openUnlock(message = '') {
  byId('unlockReason').textContent = message || '先免费试：3 分钟快测与每点前 3 题免费、各地原卷免费看；每个家庭再送 1 次整卷打印 + 1 套手机整卷。觉得孩子用得上再买。';
  redeemMessage.textContent = '';
  if (inviteInput?.value) byId('shareSaveFold')?.setAttribute('open', '');
  if (!unlockDialog.open) unlockDialog.showModal();
  unlockDialog.scrollTop = 0;
  void loadPurchaseOptions();
  void loadDirectPayConfig();
  trackVisit('purchase_view');
}

let payPollTimer = null;
let directPayEnabled = false;
async function loadDirectPayConfig() {
  try {
    const res = await fetch('/api/pay/config', { cache: 'no-store' });
    if (!res.ok) return;
    const cfg = await res.json();
    directPayEnabled = Boolean(cfg.ok && cfg.enabled);
    const schoolBtn = byId('directPaySchool');
    const bundleBtn = byId('directPayBundle');
    if (schoolBtn) schoolBtn.hidden = !directPayEnabled;
    if (bundleBtn) bundleBtn.hidden = !directPayEnabled;
    if (directPayEnabled) {
      byId('schoolOffer')?.querySelector('a')?.classList.remove('primary');
    }
  } catch {}
}
async function startDirectPay(sku) {
  const box = byId('directPayBox');
  if (!box) return;
  clearInterval(payPollTimer);
  box.hidden = false;
  box.textContent = '正在创建支付订单…';
  try {
    const referralCode = (inviteInput?.value || '').trim();
    const res = await fetch('/api/pay/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku, referralCode, source: visitorSource }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok || !data.payUrl) {
      box.textContent = data.message || '创建订单失败，请稍后重试或使用闲鱼购买。';
      return;
    }
    box.innerHTML = `<p><b>订单已创建（¥${data.amount}）</b>：请在新页面完成付款，付款后本页会自动解锁。</p>
      <p><a class="btn primary" href="${esc(data.payUrl)}" target="_blank" rel="noopener noreferrer">前往付款 →</a></p>`;
    window.open(data.payUrl, '_blank', 'noopener');
    let tries = 0;
    payPollTimer = setInterval(async () => {
      tries += 1;
      if (tries > 120 || !unlockDialog.open) { clearInterval(payPollTimer); return; }
      try {
        const stRes = await fetch(`/api/pay/status?orderId=${encodeURIComponent(data.orderId)}`, { cache: 'no-store' });
        const st = await stRes.json();
        if (stRes.ok && st.status === 'paid') {
          clearInterval(payPollTimer);
          paidAccess = true;
          trackVisit('redeem_success');
          try { localStorage.setItem('xiaosimen_paid', '1'); } catch {}
          box.innerHTML = `<p><b>付款成功，已自动解锁完整版！</b></p>${st.accessCode ? `<p>你的专属备用兑换码：<code>${esc(st.accessCode)}</code>（建议截图保存，可在另外 2 台设备输入激活）</p>` : ''}`;
          renderHome('homeTitle');
          void refreshReferralProfile();
          toast('付款成功，已自动解锁完整版！');
        }
      } catch {}
    }, 2500);
  } catch {
    box.textContent = '网络异常，无法创建支付订单，请重试或使用闲鱼购买。';
  }
}
byId('directPaySchool')?.addEventListener('click', () => {
  const hasInvite = Boolean((inviteInput?.value || '').trim());
  void startDirectPay(hasInvite ? 'xiaosimen_friend' : 'xiaosimen_full');
});
byId('directPayBundle')?.addEventListener('click', () => { void startDirectPay('bundle'); });

redeemForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = redeemForm.querySelector('button[type=submit]');
  const input = byId('accessCode');
  const code = input.value.trim();
  if (!code) return;
  submit.disabled = true;
  redeemMessage.textContent = '正在兑换…';
  try {
    const response = await fetch('/api/access/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, source: visitorSource, referralCode: inviteInput.value }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      const messages = {
        DEVICE_LIMIT: '这个兑换码在本题库已激活 3 个浏览器（换设备超出名额可到闲鱼联系我免费重置）。',
        INVALID_CODE: '兑换码无效，或不适用于爱丽克丝中考题库。',
        INVALID_REFERRAL: '邀请码有误，请核对或留空后继续。',
        REFERRAL_REQUIRED: '这是好友价兑换码，请填写邀请你的朋友的邀请码（ALIX- 开头，问朋友要）。',
        RATE_LIMITED: '尝试次数太多，请 15 分钟后再试。',
        UNAVAILABLE: '兑换服务暂时不可用，请稍后再试。',
      };
      redeemMessage.textContent = messages[data.reason] || '兑换失败，请稍后再试。';
      if (data.reason === 'REFERRAL_REQUIRED' || data.reason === 'INVALID_REFERRAL') byId('inviteFold')?.setAttribute('open', '');
      return;
    }
    paidAccess = true;
    trackVisit('redeem_success');
    try { localStorage.setItem('xiaosimen_paid', '1'); } catch {}
    input.value = '';
    unlockDialog.close();
    renderHome('homeTitle');
    void refreshReferralProfile();
    toast('已解锁完整版！可在「进度管理」一键云端备份错题本，首页也已生成你的专属邀请链接（邀 3 位朋友返现 15 元）。');
  } catch {
    redeemMessage.textContent = '兑换服务暂时不可用，请稍后再试。';
  } finally {
    submit.disabled = false;
  }
});

function accessNoticeHTML(days) {
  if (paidAccess) return '<section id="referralPanel" class="quiz-referral" hidden></section>';
  if (days > 0) {
    return `<section class="card mini-card access-notice legacy-trial-notice">
      <div><h2 id="legacyTrialCountdown">完整版体验还剩 ${days} 天</h2><p class="muted">上线前的作答记录已保留。体验期间可练习全部题目、复习到期错题和订正。</p></div>
      <button class="btn" type="button" id="openUnlock">兑换完整版</button>
    </section>`;
  }
  const expired = legacyTrialStartedAt() !== null ? '<p class="muted">7 天完整版体验已结束，原答题记录已保留。</p>' : '';
  return `<section class="card mini-card access-notice slim-notice">
    <div>${expired}<p><b>免费送：</b>每个家庭 1 套手机整卷（${freeUses.phone ? '已用' : '未用'}）+ 1 次整卷打印（${freeUses.print ? '已用' : '未用'}），任选一套；其他卷子前 5 题免费，各地原卷免费看。</p>
    <p class="muted access-value-line"><b>作者自家孩子同步自用，每天都在完善</b>，内容价值远超 <b>¥19.9</b>（后期会调价，已购用户长期不限使用，分享可省 5 元）：3 台设备共用 · 云端错题本同步 · 后续新增知识点、大题与真题全部免费更新。</p></div>
    <button class="btn primary" type="button" id="openUnlock">开通完整版 ¥19.9</button>
  </section>`;
}

function updateLegacyCountdown() {
  clearTimeout(legacyCountdownTimer);
  const countdown = byId('legacyTrialCountdown');
  if (!countdown) return;
  const now = Date.now();
  const days = legacyTrialDays(now);
  if (days === 0) { renderHome(); return; }
  countdown.textContent = `完整版体验还剩 ${days} 天`;
  const elapsed = Math.max(0, now - legacyTrialStartedAt());
  legacyCountdownTimer = setTimeout(updateLegacyCountdown, DAY_MS - elapsed % DAY_MS);
}

async function shareDailyQuestion(button) {
  const question = dailyQuestion();
  if (!question) return;
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('from', 'daily-share');
  const text = `爱丽克丝中考题库 · 每日一题 · ${question.subjectLabel || SUBJECTS[question.subject]?.label || ''}\n${question.stem}\n${url.href}`;
  button.disabled = true;
  try {
    if (navigator.share) await navigator.share({ title: '爱丽克丝中考题库 · 每日一题', text });
    else await navigator.clipboard.writeText(text);
    trackVisit('daily_share');
    if (!hasFullAccess()) {
      if (!banks) await startBanksBackgroundLoad();
      const currentTrial = readShareTrial();
      const candidates = buildQueue(state.stage, banks, loadProgress(), false).filter(q => !baseTrialIds.has(q.id));
      const nextTrial = extendShareTrial(currentTrial, todayStr(), candidates);
      if (nextTrial !== currentTrial && persist(() => {
        localStorage.setItem(SHARE_TRIAL_KEY, JSON.stringify(nextTrial));
        return true;
      })) {
        shareTrial = nextTrial;
        renderHome('dailyShare');
        toast(`已解锁 ${nextTrial.ids.length - currentTrial.ids.length} 道额外练习题，点下方「按学期刷题」即可开始练！`);
        return;
      }
    }
    toast(navigator.share ? '分享操作已完成。' : '分享内容已复制。');
  } catch (error) {
    if (error?.name !== 'AbortError') toast('分享暂时不可用，请重试。');
  } finally {
    button.disabled = false;
  }
}


function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function icon(name, cls = '') {
  return `<svg class="icon ${cls}" aria-hidden="true"><use href="./assets/icons/ui.svg?v=2#${name}"></use></svg>`;
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
  const nationalLabels = { english: '英语', physics: '物理', chemistry: '化学', math: '数学', chinese: '语文' };
  return `<span class="chip tone-${esc(key)}">${esc(label || SUBJECTS[key]?.label || nationalLabels[key] || '')}</span>`;
}
function displayAnswer(q) {
  if (q.type === 'judge') return q.answer[0] === 'true' ? '正确' : '错误';
  if (q.type === 'essay') return q.points.map((p, i) => `${'①②③④⑤⑥⑦⑧⑨'[i] || i + 1}${p.text}`).join('；');
  return q.answer.join('、');
}
function materialHTML(text) {
  return String(text || '').split('\n').map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
}
function isSubjective(q) { return q?.type === 'essay' || q?.type === 'blank'; }
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
  const fullAccess = hasFullAccess();
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
  let note = fullAccess ? '先订正错题，再完成今日新题。' : '完成今日新题即可打卡。';
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
      ${stats.alreadyDone ? `<p class="checkin-cross">${accountingRecommendation()}</p>` : ''}
      <div class="checkin-footer"><span>${icon('flame')} 打卡连续 <b>${activeStreak}</b> 天</span>${fullAccess ? `<span>今日积分 <b>+${c.pointsToday}</b></span>` : ''}</div>
      ${fullAccess ? `<details class="badges">
        <summary>称号与徽章</summary>
        <p class="muted mobile-study-streak">已连续学习 ${streakDays(progress)} 天，按有作答的日期计算。</p>
        <p class="muted">${next ? `距「${next.name}」还差 ${next.points - c.totalPoints} 分。` : '已获得最高积分称号。'}</p>
        <ul class="badges-list">${badgeList.map(b => `<li>${c.badges.includes(b.name) ? '✓ ' : ''}${b.name}<span>${b.requirement}</span></li>`).join('')}</ul>
      </details>` : ''}
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
          <span class="quick-name"><strong>${entry.name}</strong><small>${!hasFullAccess() && entry.mode === 'due' ? '完整版' : fmt.format(applyMode(entry.q, entry.mode, progress).length) + ' 道'}</small></span>
          ${icon('chevron-right', 'quick-arrow')}
        </button>`).join('')}
      </div>
      <a class="key-points-entry tone-shengwu" href="./key-points.html">
        <span class="tile-icon">${icon('book-open')}</span>
        <span class="quick-name"><strong>考点速记</strong><small>应知应会 · 易错辨析 · 回忆自测</small></span>
        ${icon('arrow-right', 'quick-arrow')}
      </a>
    </section>`;
}
function drillCardHTML(progress) {
  if (!subjectiveQuestions.length) return '';
  const essays = subjectiveScope('essay');
  const blanks = subjectiveScope('blank');
  const records = list => list.map(q => qProgress(progress, q.id)).filter(hasAnswered);
  const essayDone = records(essays);
  const blankDone = records(blanks);
  const rate = essayDone.filter(r => r.total).length
    ? Math.round(essayDone.filter(r => r.total).reduce((s, r) => s + r.score / r.total, 0) / essayDone.filter(r => r.total).length * 100) + '%' : '—';
  const blankAcc = blankDone.length ? Math.round(blankDone.filter(r => r.correct).length / blankDone.length * 100) + '%' : '—';
  const realCount = essays.filter(q => /中考/.test(q.source)).length;
  const chips = ['', ...SUBJECT_ORDER].map(key => {
    const n = subjectiveScope('essay', state.stage, key).length + subjectiveScope('blank', state.stage, key).length;
    if (key && !n) return '';
    return `<button type="button" class="drill-chip ${key ? 'tone-' + key : ''}" data-drill="${key}" aria-pressed="${state.drillSubject === key}">${key ? SUBJECTS[key].short : '本学期科目'}${key ? `<span>${n}</span>` : ''}</button>`;
  }).join('');
  return `
    <section class="card drill-card" aria-labelledby="drillTitle">
      <div class="section-heading">
        <h2 id="drillTitle">${icon('target')} 主观题提分</h2>
        <span class="drill-badge">中考大题 · 得分点自评</span>
      </div>
      <div class="drill-chips" role="group" aria-label="选择科目">${chips}</div>
      <div class="drill-grid">
        <button class="drill-tile" data-mode="essay" type="button">
          <span class="drill-icon">${icon('pen-line')}</span>
          <span class="drill-text"><strong>材料分析 · 论述 · 简答</strong>
            <small>${fmt.format(essays.length)} 道${realCount ? `（福建中考真题 ${realCount}）` : ''} · 已写 ${essayDone.length} · 平均得分率 ${rate}</small></span>
          ${icon('arrow-right', 'quick-arrow')}
        </button>
        <button class="drill-tile" data-mode="blank" type="button">
          <span class="drill-icon">${icon('text-cursor-input')}</span>
          <span class="drill-text"><strong>填空速记</strong>
            <small>${fmt.format(blanks.length)} 道 · 已做 ${blankDone.length} · 正确率 ${blankAcc}</small></span>
          ${icon('arrow-right', 'quick-arrow')}
        </button>
      </div>
      <p class="muted drill-note">${icon('lightbulb')} 先自己写，再对照得分点打分；得分率不到 60% 的题自动进错题本，按 1、3、7、14 天复习。</p>
    </section>`;
}
function subjectProgressHTML(progress) {
  if (!banks) {
    return `
    <section class="card subject-card" aria-labelledby="subjectTitle">
      <div class="section-heading"><h2 id="subjectTitle">四科进度</h2><span class="muted">道法 · 历史 · 地理 · 生物 2,453 道</span></div>
      <p class="muted" style="padding:10px 0 4px">题库后台就绪中，点击上方任意按钮可直接开练…</p>
    </section>`;
  }
  const weak = (bankQuestions && bankQuestions.length) ? weakChapters(bankQuestions, progress) : [];
  return `
    <section class="card subject-card" aria-labelledby="subjectTitle">
      <div class="section-heading"><h2 id="subjectTitle">四科进度</h2><span class="muted">选择题 ${fmt.format((bankQuestions || []).length)} 道${(subjectiveQuestions || []).length ? ` · 主观/填空 ${fmt.format(subjectiveQuestions.length)} 道` : ''}</span></div>
      <div class="subject-grid">
      ${SUBJECT_ORDER.map(key => {
        const items = banks?.[key]?.questions || [];
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
        <button class="btn" id="dailyBtn">${hasAnswered(qProgress(progress, q.id)) ? '重做今日一题' : '做今日一题'} ${icon('arrow-right')}</button>
        <button class="btn text-button" id="dailyShare" type="button">${!hasFullAccess() && !shareTrial.days.includes(todayStr()) && shareTrial.ids.length < SHARE_CAP ? '分享领额外练习题' : '分享这道题'}</button>`
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
// 首页“更新日志”（折叠），新内容加在最前面。
const UPDATE_LOG = [
  ['2026-11-26', '数理化知识点补缺上线「🔍 全初中秒搜直达」：支持跨学期、跨教材版本和口语别名（搜“尺规作图、动点、电路故障、金属与酸图像、气密性”一点直达）；同步审查并补齐尺规作图、旋转动角与双角平分线、分组分解法、中点四边形、统计与概率大题、平面镜成像实验、多物体摩擦力、电路故障速判、气密性检查、金属与酸四大图像、数字化传感实验与常见物质俗名沉淀总表等 12 个高频知识点与 9 张教学矢量图，全初中达 370 个知识点、100 道规范解答大题、104 套名师详讲档案。'],
  ['2026-11-26', '每个数理化知识点升级为「名师 4 步通关微课」：考点卡支持一键背诵遮罩自测，母题支持分步揭晓不直接剧透，练习重塑为 3 关阶梯闯关与 ★★★ 通关墙，核心点配「题眼识别、通法 3 步走、变式对照与家长 30 秒抽查卡」；批量扩写初二初三 10 个核心拉分章共 215 道偏短解析，补齐初三下物理总复习串联 4 个跨册点。'],
  ['2026-11-26', '错题本新增「一键印出专属 A4 错题重做卷」；《孩子学情体检单》支持存长图；小四门考点速记页新增背诵遮罩与「A4 挖空默写纸」（附独立家长核对答案页）。'],
  ['2026-11-25', '数理化补缺新增 36 道中考压轴解答大题（数学 18 道、物理 10 道、化学 8 道，含分步审题思路、采分点自评与规范解答）；上线「3 分钟免费快测（8 题）」与《孩子学情体检单》（含 3 天补缺清单），A4 补缺卷升级解题步骤留白区与家长核对引导页。'],
  ['2026-11-24', '化学中考压轴专题上线，数理化三科全链路闭环！新增工业工艺流程、框图推断与离子共存、变质与成分探究、复分解拐点图像与溶液综合计算共 4 大模块 12 专题 96 题＋6 张压轴图解；初中化学全库 16 章 48 考点 384 题＋24 张矢量图全部上线。'],
  ['2026-11-24', '按知识点补缺补漏正式开启「化学」学科，数理化三科全部打通！首批上线初三上（7 单元 20 考点 160 题＋11 张实验/微观图）与初三下（5 单元 16 考点 128 题＋7 张溶解度/中和曲线图），同步归位中考真题并支持一键 A4 补弱打印。'],
  ['2026-11-24', '物理中考压轴专题上线，全学段物理闭环完成！新增动态电路安全最值、浮力压强综合、力热电跨学科综合与特殊实验测量共 4 大模块 12 专题 96 题＋8 张压轴图解；初中物理（初二上至初三下＋压轴专题）共 23 章 85 个知识点、680 道原创梯度新题与 53 张清晰矢量图全部上线。'],
  ['2026-11-24', '物理初三上下学期知识点精练上线：初三上 5 章 22 点 176 题（内能与热机、电流电路、电压电阻、欧姆定律、电功率）＋13 张电路/热学图，初三下 3 章 9 点 72 题（生活用电、电与磁、信息与能源）＋6 张家庭电路/电磁图。'],
  ['2026-11-24', '物理初二下学期知识点精练上线：覆盖运动和力、压强、浮力、功和机械能、简单机械共 5 章 20 个知识点、160 道梯度新题、15 张受力/压强/浮力/杠杆/滑轮组矢量图，并归位 154 道同步真题。'],
  ['2026-11-24', '按知识点补缺补漏正式开启「物理」学科！首批上线初二上学期物理（机械运动、声现象、物态变化、光现象、透镜及其应用、质量与密度共 6 章 22 个知识点、176 道分层新题＋11 幅物理矢量图），支持首页直接切换数学/物理，同步享用诊断处方卡和一键 A4 打印卷。'],
  ['2026-11-24', '数学补缺新增两大实用功能：①「薄弱知识点一键 A4 打印卷」：家长不用让孩子长时间盯手机，可直接预览并打印薄弱点速记卡＋练习题＋独立背面解析；②「诊断交卷提分处方卡」：做完诊断立刻给出薄弱漏洞清单、预计提分空间，支持一键集中补弱或直接打印本次补缺卷。'],
  ['2026-11-24', '数学补缺链路全面升级！新增「专题与压轴」频道（6 大模块 24 个高频模型、192 道原创题＋15 幅矢量图）：既含面向基础薄弱生的“中考计算保底与防错”，也含面向拔尖冲高生的倍长中线、手拉手、一线三等角、半角、隐圆、瓜豆、胡不归、二次函数存在性与铅垂高面积最值等中考压轴模型；同时知识点页新增“保底：基础+提高”与“冲高：拓展/压轴”快捷入口，差生好生都能按需提分。'],
  ['2026-11-23', '按知识点补缺补漏上线数学初三下学期：覆盖反比例函数、相似、锐角三角函数、投影与视图共 4 章 20 个知识点，新增 160 道分层新题并配 14 幅清晰矢量图，至此初中数学初一到初三六个学期全部上线！'],
  ['2026-11-23', '按知识点补缺补漏上线数学初三上学期：覆盖一元二次方程、二次函数、旋转、圆、概率初步共 5 章 34 个知识点，新增 272 道分层新题并配 16 幅函数/圆/旋转/概率图，同时归位同类真题与同步题，每点前 3 题和诊断题免费体验。'],
  ['2026-11-23', '按知识点补缺补漏上线数学初二下学期：覆盖二次根式、勾股定理、平行四边形、一次函数、数据的分析共 5 章 31 个知识点，新增 248 道分层新题并配 19 幅几何/函数/统计图，同时归位同类真题与同步题，每点前 3 题和诊断题免费体验。'],
  ['2026-11-23', '按知识点补缺补漏上线数学初二上学期：覆盖三角形、全等三角形、轴对称、整式的乘法、因式分解、分式共 6 章 34 个知识点，新增 272 道分层新题并配 21 幅清晰几何图，同时归位 137 道同类真题与同步题，每点前 3 题和诊断题免费体验。'],
  ['2026-11-23', '按知识点补缺补漏上线数学初一下学期：覆盖相交线与平行线、实数、平面直角坐标系、二元一次方程组、不等式与不等式组、数据的收集整理与描述共 6 章 38 个知识点。每个知识点配卡片（要点、公式方法、易错点、例题）和 8 道基础/提高/拓展练习，共新增 304 道新题，并归位 157 道同类真题与同步题，每个知识点前 3 题和诊断题免费体验。'],
  ['2026-11-23', '题库改版：首页新增主线“按知识点补缺补漏”（先上线数学初一上学期样板：6 章 40 个知识点）。每个知识点一张卡片（要点、公式方法、易错点、例题），配基础、提高、拓展三档练习共 320 道新题，另把真题和卷子里的同类题 157 道归到对应知识点。可以做学期诊断或本章诊断自动找出薄弱点，也可以家长直接勾选孩子不会的点，再一键集中练薄弱点。每个知识点前 3 题和诊断题免费。早鸟卷、同步章节卷、全国真题移到“更多练习”。年级统一改叫“初一上学期”等。'],
  ['2026-11-23', '完整版上线「云端错题本同步」并升级至 3 台设备共用：在右上角「进度管理」中可按兑换码一键将错题本、答题记录与打卡进度同步到云端，在孩子手机、平板和家长打印电脑之间随时恢复，换手机或清理微信缓存也不怕丢进度。'],
  ['2026-11-23', '全国中考真题库重磅升级！新增及升级 17 套 2026 年中考全国真题（涵盖成都语文、云南语文/数学、甘肃语文/数学/综合/英语、江西历史/道法/数学、苏州历史/道法/数学、湖南数学、河北/浙江数学压轴专练、陕西英语等）：高清原卷打印版与手机在线交互做题版同步上线，73 幅高清原题配图全部裁切修复，题目、答案与分步给分点严格对照官方标准，全面支持手机做题、自动判分、错题收录与原卷整套打印。'],
  ['2026-11-22', '全国中考真题新增 2026 年河南中考数学可练版：整卷 23 题（选择 10、填空 5、解答 8）逐题整理，答案和分步给分按原卷所附参考答案，每题写了思路和易错点；“查看原卷 / 答案”现在把题目和答案分开显示。'],
  ['2026-11-22', '全国中考真题新增 2026 年苏州中考化学可练版：整卷 26 题（选择 20、非选择 6）逐题整理，配图取自原卷，答案按官方参考答案，每题写了思路和易错点。苏州 2026 物理、化学都能逐题练了。'],
  ['2026-11-22', '全国中考真题新增 2026 年苏州中考物理可练版：整卷 30 题（选择 12、填空 9、解答 9）逐题整理，配图取自原卷，答案按官方参考答案，计算题写全过程，每题有思路和易错点。'],
  ['2026-11-22', '全国中考真题新增 2026 年江西中考物理（21 题，含多选题）、化学（20 题，含选择填充题）可练版：逐题整理，配图取自原卷，答案按官方参考答案，每题写了思路和易错点。江西 2026 英语、物理、化学都能逐题练了。'],
  ['2026-11-22', '全国中考真题新增 2026 年福建中考化学可练版：整卷 18 题（选择 10、非选择 8）逐题整理，配图取自原卷，答案按官方参考答案，每题写了思路和易错点，非选择题按每空自评。至此福建 2026 数学、物理、化学、英语都能逐题练。'],
  ['2026-11-22', '全国中考真题新增 2026 年福建中考物理可练版：整卷 31 题（选择、填空、作图、简答、实验、计算）逐题整理，配图取自原卷，答案按官方参考答案，每题写了思路和易错点；填空、实验题按每空对照自评，计算题按官方给分点。'],
  ['2026-11-22', '全国中考真题新增 2026 年福建中考数学可练版：整卷 25 题（选择 10、填空 6、解答 9）逐题整理，配图取自原卷，答案按官方参考答案，每题补了思路和易错点，解答题按步骤给分点自评；原卷和答案图片照旧可看。'],
  ['2026-11-21', '同步章节卷新增九上英语 4 套：学习方法与节日（宾语从句）、礼貌问询与成长变化（used to）、发明与规则（被动语态）、推测与音乐电影（情态动词推测、定语从句），每套 46 题、100 分，按九年级单元测试题型出，带坑点解析，前 5 题免费试做。'],
  ['2026-11-21', '同步章节卷整套做完，总结页直接显示百分制得分，并有“下一章”按钮，一章接一章往下做。'],
  ['2026-11-21', '新增“🎁 题库可以免费拿”说明：按 14.9 买下，再邀 3 位朋友用好友价买，返现 15 元，等于白用还多 1 毛；也可以不要返现，换考证题库完整版。'],
  ['2026-11-21', '首页整理得更清爽：介绍缩短，小升初衔接只在七上显示，同步章节卷每章一行，打印练习卷、全题库找题收成可展开的一行（顶部“找题”会自动展开），首页从十几张大卡片精简了约四分之一的长度。'],
  ['2026-11-21', '整卷加计时：手机上做整套早鸟卷、同步章节卷、精编模拟卷、小升初卷时，可以点“开始计时”按考试时长倒计时（同步卷 90 分钟，早鸟卷、精编卷按科目），能暂停，超时变红，做完在总结里显示一共用了多久。只做前 5 题体验时不计时。'],
  ['2026-11-21', '首页打开更快：网络慢的时候，先显示学期、早鸟自测卷和同步章节卷，可以直接开始做；按章节练、错题本、小四门等内容随后加载出来。'],
  ['2026-11-21', '早鸟自测卷做完后直接告诉你补哪几章：按错题所在章节排序，列出错得最多的 3 章，点一下就进那一章的同步章节卷（数学、物理、化学）。'],
  ['2026-11-21', '同步章节卷显示进度：每套写明已做几题、对几题，卡片上方提示“已经做过几套，下一套做哪一章”；还按期末（九下按中考）日期算好每周做几套，期末前 2 周留给错题复习，日期可以按当地改。'],
  ['2026-11-21', '同步章节卷新增八下英语 4 套（新教材）：Units 1–2 Time to Relax / Stay Healthy、Units 3–4 Growing Up / The Wonders of Nature、Units 5–6 Nature’s Temper / Crossing Cultures、Units 7–8 A Good Read / Making a Difference。动词不定式、used to、过去进行时、现在完成时等重点语法逐个练到，书面表达带范文，前 5 题免费试做。'],
  ['2026-11-21', '同步章节卷新增八上英语 4 套（新教材）：Units 1–2 Happy Holiday / Home Sweet Home、Units 3–4 Same or Different? / Amazing Plants and Animals、Units 5–6 What a Delicious Meal! / Plan for Yourself、Units 7–8 When Tomorrow Comes / Let’s Communicate!。不定代词、比较级和最高级、感叹句、be going to、will 和 if 条件句逐个练到，书面表达带范文，前 5 题免费试做。'],
  ['2026-11-21', '同步章节卷新增七下英语 4 套：Units 1–2 Animal Friends / No Rules, No Order、Units 3–4 Keep Fit / Eat Well、Units 5–6 Here and Now / Rain or Shine、Units 7–8 A Day to Remember / Once upon a Time。每套 46 题 100 分，单选、完形、阅读、短文填空、书面表达（带范文和评分要点），短文全部原创，前 5 题免费试做。'],
  ['2026-11-21', '同步章节卷化学全册上线：九上 7 个单元（走进化学世界到燃料及其利用）＋九下 5 套（金属和金属材料、溶液、常见的酸和碱、盐和化肥、化学与生活），每套 100 分，实验探究题写清现象和结论，计算题按规范格式写全，前 5 题免费试做。'],
  ['2026-11-21', '同步章节卷新增九下物理 3 套：生活用电、电与磁、信息的传递与能源。至此物理八上到九下 19 套全部上线，前 5 题免费试做。'],
  ['2026-11-21', '同步章节卷新增九上物理 5 章：内能与热机、电流和电路、电压电阻、欧姆定律、电功率，电路题用文字写清连接方式，计算题写全步骤，前 5 题免费试做。'],
  ['2026-11-21', '同步章节卷新增八下物理 5 章：力与运动和力、压强、浮力、功和机械能、简单机械，每章一套 100 分，计算题写全步骤和单位换算，前 5 题免费试做。'],
  ['2026-11-21', '同步章节卷新增八上物理 6 章：机械运动、声现象、物态变化、光现象、透镜及其应用、质量与密度，每章一套 100 分，带易错坑点和解析，前 5 题免费试做。首页学期选“八上”，在同步章节卷里切到“物理”即可。'],
  ['2026-11-21', '新增“同步章节卷”：跟着课本一章一套，按期中期末题型出题，带易错坑点和逐题解析。数学七下到九下 24 章已全部上线（七下 6 章、八上 5 章、八下 5 章、九上 5 章、九下 3 章；七上就是小升初衔接卷），几何题配图，每套前 5 题免费试做。首页选学期即可看到；早鸟卷做完也可以直接去对应章节补弱项。'],
  ['2026-11-21', '早鸟自测卷、小升初衔接卷可以打印整套了：题目和答案页分开，每大题标好分值，限时免费，不占免费打印次数。孩子在纸上做完，回来填总分、点出错题号，错题同样进错题本按 1、3、7、14 天提醒复习，学情分析也会算进去。'],
  ['2026-11-20', '新增八下早鸟自测卷：语文、数学、英语、物理、道法、历史、地理、生物各一套。至此七上到九下六个学期的早鸟自测卷全部上线，首页选学期即可，限时免费。'],
  ['2026-11-20', '新增八上早鸟自测卷：语文、数学、英语、物理、道法、历史、地理、生物各一套，考到八年级上册，按期末考试题型编写，难度略高，限时免费。'],
  ['2026-11-20', '新增七下早鸟自测卷：语文、数学、英语、道法、历史、地理、生物各一套，考到七年级下册，按期末考试题型编写，难度略高，限时免费。'],
  ['2026-11-20', '新增七上早鸟自测卷：语文、数学、英语、道法、历史、地理、生物各一套，只考七年级上册的内容，按期末考试题型编写，难度略高，限时免费。首页学期选“七上”即可看到。'],
  ['2026-11-20', '新增“小升初衔接”：语文、数学、英语按七年级上册章节出卷，数学 6 章（有理数到几何图形初步）、英语 4 套（Starter Units 到 Unit 7）、语文 3 套（积累运用与古诗词、文言文、现代文阅读与写作），每套 100 分，题型按初中考试编写、每题有解析，限时免费。首页顶部“小升初衔接”卡片进入。'],
  ['2026-11-20', '新增“按章节练”和“学情分析”：精编卷、早鸟卷的每道题都标了教材章节，可以按章节专项练、直接搜“浮力”“二次函数”这类难点章节；学情分析按科目和章节统计正确率，找出最需要补的章节并给出复习建议。'],
  ['2026-11-20', '新增九上早鸟自测卷：语文、数学、英语、物理、化学、道法、历史各一套，只考到九年级上册学过的内容，限时免费。'],
  ['2026-11-20', '新增中考早鸟自测卷：九下（中考全范围）语文、数学、英语、物理、化学、道法、历史、地理、生物各一套，限时免费，不占免费名额，做完出百分制总分、每题有解析；首页可按学期切换，其他学期的早鸟卷陆续上线。'],
  ['2026-11-19', '新增语文精编模拟卷（三）：32 题，结构对标中考（积累运用、默写、课外古诗、课外文言、记叙文、说明文、作文）。'],
  ['2026-11-19', '新增英语精编模拟卷（三）：61 题，题量对标中考（不含听力），阅读侧重推理判断，语法不超纲。'],
  ['2026-11-19', '新增化学精编模拟卷（一）：22 题，题量和难度对标中考，含溶解度曲线、复分解反应先后、除杂、氢氧化钠变质探究和方程式计算，手机做、打印都行。'],
  ['2026-11-19', '新增数学、物理精编模拟卷（二）：题量和难度对标中考，含圆的综合、二次函数压轴、动态电路和浮力综合；新增河南、陕西、新疆、上海、湖南等 11 套 2026 年中考原卷（数学、物理、化学、道法、历史），免费看、免费打印。'],
  ['2026-11-18', '新增数学、物理精编模拟卷各 1 套，带原创配图，手机做、打印都清楚。免费规则改为：每个家庭送 1 次整卷打印 + 1 套手机整卷，任选一套。'],
  ['2026-11-18', '首页改版：按“本周一卷 → 分科（英语、语文、数学、物理、化学）→ 小四门”排列，各科可以展开收起；新增英语、语文精编模拟卷各 2 套，手机做、打印都行。'],
  ['2026-11-18', '每日 20 题和打卡换成“本周一卷”：每周一换，打印出来纸上做完，回来点出错题号就能进错题本。错题本、曾错题、收藏覆盖全科；打印和找题覆盖全题库。'],
  ['2026-11-18', '改名“中考提分题库”；首页可按科目、册次一键打印练习卷，答案单独一页，没买也能先打印一张体验卷。'],
  ['2026-11-18', '新增全国中考英语真题 15 套（福建、广东等，逐题核对答案、配中文解析），原卷免费看；按中考题型刷，每种题型免费试一组。'],
  ['2026-11-18', '新增江西 2026、苏州 2026 理化语等各科原卷；四科新增 易错变式题。'],
  ['2026-11-18', '地理、生物会考复习章归到八年级下，选初三不再出现已经会考的地理生物。'],
  ['2026-11-17', '新增 考点冲刺卷：在线做题即时判分、可打印、每题标注出处；邀请好友 1 位永久解锁，已购用户上传新卷子被采用也能解锁。'],
  ['2026-11-17', '修复部分题目配图加载失败；找不到配图的题已删除，题数按实际显示。'],
  ['2026-11-16', '新增主观题提分（材料分析、论述、简答，按得分点自评）和填空速记。'],
  ['2026-11-15', '错题按 1、3、7 天自动安排复习，新增连续学习打卡。'],
];

// ---------- 首页 2.0：本周一卷、分科、小四门分组、全科错题、全科打印与搜索 ----------
const MAIN_SUBJECTS = [
  { key: 'english', label: '英语', icon: '📘' },
  { key: 'chinese', label: '语文', icon: '📕' },
  { key: 'math', label: '数学', icon: '📐' },
  { key: 'physics', label: '物理', icon: '🔭' },
  { key: 'chemistry', label: '化学', icon: '⚗️' },
];
const WEEKLY_SUBJECTS = [['english', '英语'], ['chinese', '语文'], ['x4m', '小四门']];
const WEEKLY_SIZE = { english: 20, chinese: 15, x4m: 20 };
const FREE_PREVIEW = 5;
let nationalCatalog = null;
let freeUses = { print: null, phone: null };
const FREE_KIND_LABEL = { print: '整卷打印', phone: '手机做整卷' };
const DEVICE_KEY = 'x4m-device';
let deviceIdCache = '';
function idbDevice(value) {
  return new Promise(resolve => {
    try {
      const open = indexedDB.open('x4m-store', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('kv');
      open.onerror = () => resolve('');
      open.onsuccess = () => {
        try {
          const tx = open.result.transaction('kv', 'readwrite');
          const store = tx.objectStore('kv');
          if (value) { store.put(value, DEVICE_KEY); tx.oncomplete = () => resolve(value); }
          else { const get = store.get(DEVICE_KEY); get.onsuccess = () => resolve(get.result || ''); get.onerror = () => resolve(''); }
        } catch { resolve(''); }
      };
    } catch { resolve(''); }
  });
}
async function deviceId() {
  if (deviceIdCache) return deviceIdCache;
  const valid = v => /^[A-Za-z0-9_-]{16,64}$/.test(v || '') ? v : '';
  let id = '';
  try { id = valid(localStorage.getItem(DEVICE_KEY)); } catch { /* 隐私模式 */ }
  if (!id) id = valid((document.cookie.match(/(?:^|;\s*)x4m_dev=([^;]+)/) || [])[1]);
  if (!id) id = valid(await idbDevice(''));
  if (!id) id = Array.from(crypto.getRandomValues(new Uint8Array(18)), b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b % 64]).join('');
  try { localStorage.setItem(DEVICE_KEY, id); } catch { /* 隐私模式 */ }
  document.cookie = `x4m_dev=${id}; Path=/; Max-Age=${60 * 60 * 24 * 730}; SameSite=Lax; Secure`;
  void idbDevice(id);
  deviceIdCache = id;
  return id;
}
async function refreshFreeUses() {
  if (paidAccess) return;
  try {
    const response = await fetch('/api/access/free-status', {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: await deviceId() }),
    });
    const data = await response.json();
    if (response.ok && data.ok) freeUses = data.free || freeUses;
  } catch { /* 离线时按未领取处理，领取时服务器会再校验 */ }
}
function freeOpen(kind, paperId) { return hasFullAccess() || freeUses[kind]?.paperId === paperId; }
function freeButtonLabel(kind, paperId, labels) {
  if (freeOpen(kind, paperId)) return labels[0];
  return freeUses[kind] ? labels[2] : labels[1];
}
// 返回 'full'（可用整卷）、'preview'（只能试前 5 题）或 'cancel'（家长取消）
function confirmFreeClaim(message) {
  const dlg = byId('claimConfirmDialog');
  const txt = byId('claimConfirmText');
  const okBtn = byId('claimConfirmOk');
  const cancelBtn = byId('claimConfirmCancel');
  if (!dlg || !txt || !okBtn || !cancelBtn || typeof dlg.showModal !== 'function') {
    return Promise.resolve(window.confirm(message));
  }
  txt.textContent = message;
  return new Promise(resolve => {
    let settled = false;
    const done = val => {
      if (settled) return;
      settled = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      dlg.removeEventListener('close', onClose);
      if (dlg.open) dlg.close();
      resolve(val);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    const onClose = () => done(false);
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    dlg.addEventListener('close', onClose);
    dlg.showModal();
  });
}
async function claimFree(kind, paperId, title) {
  if (freeOpen(kind, paperId)) return 'full';
  if (freeUses[kind]) {
    toast(`免费${FREE_KIND_LABEL[kind]}已用在《${freeUses[kind].title || '另一套卷子'}》上；这套先为您开启试做体验。`);
    return 'preview';
  }
  const again = kind === 'print' ? '打印' : '做';
  const confirmed = await confirmFreeClaim(`每个家庭可以免费${FREE_KIND_LABEL[kind]} 1 次。确定用在《${title}》上吗？（这一套以后还能反复${again}）`);
  if (!confirmed) return 'cancel';
  try {
    const response = await fetch('/api/access/free-use', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, paperId, title, deviceId: await deviceId() }),
    });
    const data = await response.json();
    if (data.free) freeUses = data.free;
    if (response.ok && data.ok) { trackVisit(`free_${kind}`); return 'full'; }
    if (data.reason === 'USED') {
      const usedTitle = freeUses[kind]?.title || data.free?.[kind]?.title || '另一套卷子';
      toast(`这台手机或网络已领过免费${FREE_KIND_LABEL[kind]}（《${usedTitle}》），这套先为您开启试做。`);
      return 'preview';
    }
    toast('领取失败，请稍后再试。');
  } catch { toast('网络不好，领取失败，请稍后再试。'); }
  return 'cancel';
}
const weeklyCache = new Map();

function seededShuffle(list, seedText) {
  let seed = 0;
  for (const ch of String(seedText)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function weekRangeLabel(day = todayStr()) {
  const monday = weekKeyOf(day);
  const fmtDay = s => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
  return `${fmtDay(monday)}–${fmtDay(addDays(monday, 6))}`;
}
function htmlToText(html) {
  return String(html || '')
    .replace(/<b class="gap">(\d+)<\/b>/g, '($1)')
    .replace(/<\/p>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{2,}/g, '\n').trim();
}
function isNationalId(id) { return String(id).startsWith('national-'); }
function weeklySubjectLabel(key) {
  if (key === 'x4m') return `小四门 · ${STAGE_MAP[state.stage]?.label || ''}`;
  return (WEEKLY_SUBJECTS.find(([k]) => k === key) || [])[1] || '';
}
async function buildWeekly(subject) {
  const week = weekKeyOf(todayStr());
  const cacheKey = `${week}-${subject}-${subject === 'x4m' ? state.stage : ''}`;
  if (weeklyCache.has(cacheKey)) return weeklyCache.get(cacheKey);
  let pool = [];
  if (subject === 'x4m') {
    if (!banks) await startBanksBackgroundLoad();
    pool = buildQueue(state.stage, banks, loadProgress(), true).filter(q => (q.type === 'single' || q.type === 'multiple') && !q.image);
  } else {
    const all = await window.NationalExams.loadSubject(subject);
    pool = all.filter(q => (q.type === 'single' && !q.groupId) || (subject === 'chinese' && q.type === 'blank'));
  }
  const list = seededShuffle(pool, `${week}|${subject}|${state.stage}`).slice(0, WEEKLY_SIZE[subject]);
  weeklyCache.set(cacheKey, list);
  return list;
}
function weeklyId(subject = weeklySubjectNow()) {
  return `weekly-${weekKeyOf(todayStr())}-${subject}${subject === 'x4m' ? '-' + state.stage : ''}`;
}
function weeklyFor(list, subject = weeklySubjectNow()) {
  const id = weeklyId(subject);
  return freeOpen('print', id) || freeOpen('phone', id) ? list : list.slice(0, FREE_PREVIEW);
}

// 题库里现在有什么：按目录实时统计，随更新自动变化（不写死数字）
function contentStatsHTML() {
  if (!nationalCatalog) return '';
  const c = nationalCatalog;
  const eb = c.filter(p => p.earlybird && p.stage !== 'xsc').length;
  const xsc = c.filter(p => p.earlybird && p.stage === 'xsc').length;
  const sync = c.filter(p => p.sync).length;
  const claude = c.filter(p => p.claude).length;
  const real = c.filter(p => !p.claude && !p.earlybird && !p.sync).length;
  const x4mCount = bankQuestions ? (bankQuestions.length + (subjectiveQuestions ? subjectiveQuestions.length : 0)) : 2453;
  const items = [
    eb && `早鸟卷 ${eb} 套（限免）`,
    xsc && `小升初 ${xsc} 套（限免）`,
    sync && `同步卷 ${sync} 套`,
    claude && `精编卷 ${claude} 套`,
    real && `真题 ${real} 套`,
    `小四门 ${x4mCount} 题`,
  ].filter(Boolean);
  return items.length ? `<p class="content-stats" aria-label="题库现有内容">${items.join(' · ')}</p>` : '';
}
function homeIntroHTML() {
  return `<section class="home-intro editorial-hero">
    <div class="editorial-hero-copy">
      <div class="editorial-meta-row">
        <span class="editorial-seal">2026 真题 · 压轴大题</span>
        <span class="intro-kicker">初一到初三 · 手机刷、纸质打印都行</span>
      </div>
      <h1 id="homeTitle" tabindex="-1">爱丽克丝中考题库</h1>
      <p class="editorial-lead">3 分钟测出数理化薄弱点，自动出《孩子学情体检单》与教研风 A4 专属补缺卷；同步章节卷、精编卷与全国真题一站配齐。</p>
      <div class="hero-stage-row" aria-label="快捷切换年级学期">
        <span class="hero-stage-label">孩子学期：</span>
        <div class="stage-chips hero-stage-chips" role="group" aria-label="快捷切换学期">${STAGES.map(st => `<button type="button" class="drill-chip" data-stage-pick="${st.stage}" aria-pressed="${st.stage === state.stage}">${STAGE_SHORT[st.stage].split(' ')[0]}</button>`).join('')}</div>
      </div>
      <div class="hero-trust-strip">
        <span>✓ 闲鱼 100% 好评</span>
        <span>✓ 3 台设备 + 云端错题</span>
        <span>✓ ¥19.9 一次买断用到中考</span>
      </div>
      ${contentStatsHTML()}
      <div class="editorial-hero-actions">
        <button class="btn demo-btn" type="button" data-demo-video>▶ 50 秒看怎么用</button>
      </div>
    </div>
    <figure class="editorial-hero-art" aria-hidden="true">
      <img src="./assets/hero-scholar-desk.webp" alt="" width="840" height="680" decoding="async" fetchpriority="high">
    </figure>
  </section>`;
}
function weeklyCardHTML(progress) {
  const subject = weeklySubjectNow();
  const list = weeklyCache.get(`${weekKeyOf(todayStr())}-${subject}-${subject === 'x4m' ? state.stage : ''}`);
  const done = list ? weeklyFor(list).filter(q => hasAnswered(qProgress(progress, q.id))).length : 0;
  const total = list ? list.length : WEEKLY_SIZE[subject];
  return `<section class="card weekly-card" aria-labelledby="weeklyTitle">
    <div class="section-heading"><h2 id="weeklyTitle">本周一卷</h2><span class="muted">${weekRangeLabel()} · 每周一换</span></div>
    <div class="weekly-chips" role="group" aria-label="选择科目">${weeklySubjectsNow().map(([key, label]) => `<button type="button" class="drill-chip" data-weekly-subject="${key}" aria-pressed="${subject === key}">${label}</button>`).join('')}</div>
    <p class="weekly-meta"><b>${esc(weeklySubjectLabel(subject))}</b> · ${total} 题${list ? ` · 已做 ${done}` : ''}</p>
    <div class="weekly-actions">
      <button class="btn primary" type="button" data-weekly="phone">手机上做</button>
      <button class="btn" type="button" data-weekly="print">打印整卷</button>
      <button class="btn" type="button" data-weekly="mark">纸上做完，登记错题</button>
    </div>
    <div id="weeklyMark"></div>
    <p class="muted weekly-note">手机做自动判分；打印出来做完，回来点出错题号。错题都按 1、3、7、14 天提醒复习。</p>
  </section>`;
}
function paperFromQuestions(title, questions, note = '') {
  // 整套卷（同一 paperId）按题号顺序分大题，同名大题不合并，保证卷面题号和原卷一致；混合组卷仍按题型归类。
  const wholePaper = questions.length > 1 && questions.every(q => q.paperId && q.paperId === questions[0].paperId);
  const sections = [];
  const printedBodies = new Map(); // 同一篇阅读材料只印一次，后面的题注明“见前文”
  let lastMaterial = '';
  for (const q of questions) {
    const name = q.section || TYPE_LABEL[q.type] || '练习';
    let section = wholePaper ? (sections.at(-1)?.name === name ? sections.at(-1) : null) : sections.find(s => s.name === name);
    if (!section) { section = { name, items: [], qs: [] }; sections.push(section); }
    let passage = '';
    if (q.materialHtml && q.materialHtml !== lastMaterial) {
      const body = q.materialHtml.replace(/<p class="reading-title">[\s\S]*?<\/p>/, '');
      const head = (q.materialHtml.match(/<p class="reading-title">([\s\S]*?)<\/p>/)?.[1] || '').split(' · ').pop().trim().replace(/（[^（）]*）$/, '');
      if (printedBodies.has(body)) passage = `（阅读材料见前文${printedBodies.get(body) ? `《${printedBodies.get(body)}》` : ''}）`;
      else { passage = htmlToText(q.materialHtml); printedBodies.set(body, htmlToText(head)); }
    } else if (q.material && q.type !== 'essay') passage = q.material;
    lastMaterial = q.materialHtml || lastMaterial;
    const tag = q.claude || q.sync ? '变式题' : (q.source || '').match(/20\d\d/) ? (q.source || '').slice(0, 24) : '';
    let item;
    if (q.type === 'single' || q.type === 'multiple') {
      item = { type: 'choice', multi: q.type === 'multiple', tag, stem: q.stem, options: q.options.map(o => ({ key: o.key, text: o.text })), answer: q.answer.join(''), explanation: q.explanation || '', source: q.source || '' };
    } else if (q.type === 'blank') {
      // 打印时题号由卷面自动编，去掉题干里重复的“第 n 题：”（“第 n 空”对应短文里的空号，保留）
      item = { type: 'blank', stem: String(q.stem || '').replace(/^第 \d+ 题：/, ''), answer: q.answer, explanation: q.explanation || '' };
    } else {
      const kind = q.earlybird ? q.section : (q.meta || q.section);
      item = { type: 'essay', kind, tag, material: q.material || '', stem: q.stem || '', score: q.score ?? (q.paperScore ?? null), points: (q.points || []).map(p => ({ text: p?.text || '', score: p?.score ?? null })), sample: q.sample || '', explanation: q.explanation || '', source: q.source || '' };
    }
    if (passage) item.passage = passage;
    if (q.image) item.image = typeof q.image === 'string' ? q.image : `./data/figures/${encodeURIComponent(q.id)}.jpg`;
    section.items.push(item);
    section.qs.push(q);
  }
  const nums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  // 早鸟卷、小升初卷按真实试卷写明每大题分值
  const scoreNote = qs => {
    if (!qs.every(q => q.earlybird || q.sync)) return note;
    const objective = qs.filter(q => q.type !== 'essay');
    const total = Math.round(qs.reduce((s, q) => s + (q.type === 'essay' ? q.score || 0 : q.paperScore || 0), 0) * 10) / 10;
    const each = objective.length === qs.length && new Set(objective.map(q => q.paperScore)).size === 1 ? objective[0].paperScore : 0;
    return each ? `每题 ${each} 分，共 ${total} 分` : `共 ${total} 分`;
  };
  return { id: `print-${title}`, title, sections: sections.map((s, i) => ({ title: `${nums[i] || i + 1}、${s.name}`, note: scoreNote(s.qs), items: s.items })), count: questions.length };
}
function printQuestions(title, questions, printLink = '') {
  if (!questions.length) { toast('暂时没有可打印的题。'); return; }
  if (!window.QuizReferrals?.showPapers) { toast('打印功能加载中，请稍后再试。'); return; }
  window.QuizReferrals.showPapers([paperFromQuestions(title, questions)], { print: true, printLink });
}
async function runWeekly(action) {
  const subject = weeklySubjectNow();
  try {
    const all = await buildWeekly(subject);
    if (!all.length) { toast('这周的卷子还在准备中。'); return; }
    const id = weeklyId(subject);
    const baseTitle = `本周一卷 · ${weeklySubjectLabel(subject)}（${weekRangeLabel()}）`;
    if (action === 'mark') { showWeeklyMark(weeklyFor(all, subject)); return; }
    const kind = action === 'print' ? 'print' : 'phone';
    const claim = await claimFree(kind, id, baseTitle);
    if (claim === 'cancel') return;
    const list = claim === 'full' ? all : all.slice(0, FREE_PREVIEW);
    if (action === 'phone') beginPractice(list, 'weekly');
    else printQuestions(`${baseTitle}${claim === 'full' ? '' : ' · 体验版前 5 题'}`, list);
  } catch (error) { toast(error.message || '加载失败，请重试。'); }
}
function showWeeklyMark(list) {
  const box = byId('weeklyMark');
  if (!box) return;
  const wrong = new Set();
  box.innerHTML = `<div class="weekly-mark">
    <p><b>点出做错的题号</b>（没点的算做对）</p>
    <div class="weekly-grid">${list.map((q, i) => `<button type="button" class="weekly-num" data-i="${i}" aria-pressed="false">${i + 1}</button>`).join('')}</div>
    <div class="weekly-actions"><button class="btn primary" type="button" id="weeklySave">登记</button><button class="btn" type="button" id="weeklyCancel">取消</button></div>
  </div>`;
  box.querySelectorAll('.weekly-num').forEach(button => button.addEventListener('click', () => {
    const i = Number(button.dataset.i);
    if (wrong.has(i)) wrong.delete(i); else wrong.add(i);
    button.setAttribute('aria-pressed', String(wrong.has(i)));
  }));
  byId('weeklyCancel').addEventListener('click', () => { box.innerHTML = ''; });
  byId('weeklySave').addEventListener('click', () => {
    persist(() => list.forEach((q, i) => recordAnswer(q, wrong.has(i) ? [] : q.answer, !wrong.has(i), { mode: 'weekly' })));
    toast(wrong.size ? `已登记：错 ${wrong.size} 题，已进错题本。` : '全对！已登记。');
    renderHome();
  });
}

// ---- 中考早鸟自测卷：全学科各一套，百分制，限时免费（不占免费整卷名额） ----
const EARLYBIRD_ORDER = ['chinese', 'math', 'english', 'physics', 'chemistry', 'daode', 'lishi', 'dili', 'shengwu'];
const EARLYBIRD_LABEL = { chinese: '语文', math: '数学', english: '英语', physics: '物理', chemistry: '化学', daode: '道法', lishi: '历史', dili: '地理', shengwu: '生物' };
// 首页按学期组织：所有板块跟着这里选的学期走（state.stage 与小四门共用）
const isNinth = (stage = state.stage) => stage === '9-up' || stage === '9-down';
const STAGE_SHORT = { '7-up': '七上', '7-down': '七下', '8-up': '八上', '8-down': '八下', '9-up': '九上', '9-down': '九下 · 中考冲刺' };
function stageBarHTML() {
  return `<section class="card stage-bar" aria-labelledby="stageBarTitle">
    <h2 id="stageBarTitle">孩子现在在哪个学期？</h2>
    <div class="stage-chips" role="group" aria-label="选择学期">${STAGES.map(st => `<button type="button" class="drill-chip" data-stage-pick="${st.stage}" aria-pressed="${st.stage === state.stage}">${STAGE_SHORT[st.stage]}</button>`).join('')}</div>
    <p class="muted">下面的早鸟自测卷、本周一卷、小四门都按这个学期来；初三再加上中考精编卷和全国真题。</p>
    ${planTipHTML()}
  </section>`;
}
// 这个学期怎么用：把“先测 → 按章补 → 每周一卷 → 错题复习”的方法写成 4 步
function planTipHTML() {
  const grade = STAGE_SHORT[state.stage].split(' ')[0];
  const syncSubjects = [...new Set((nationalCatalog || []).filter(p => p.sync && p.stage === state.stage).map(p => EARLYBIRD_LABEL[p.subject] || p.subjectLabel))];
  const step2 = state.stage === '7-up' ? '哪章弱就补哪章：七上语数英的章节卷就是“小升初衔接”，每章一套'
    : syncSubjects.length ? `哪章弱就补哪章：做那一章的同步章节卷（${syncSubjects.join('、')}已上线），或用“按章节练”专项练` : '哪章弱就补哪章：用“按章节练”专项练这一章的题';
  return `<details class="plan-tip"><summary>${esc(grade)}怎么用这个题库？4 步走</summary><ol>
    <li><b>先测：</b>做${esc(grade)}早鸟自测卷，看看哪科哪章弱（限时免费，可以打印整套）。</li>
    <li><b>按章补：</b>${step2}。</li>
    <li><b>每周一卷：</b>打印出来周末做，做完点出错题号，10 秒登记。</li>
    <li><b>错题复习：</b>错题按 1、3、7、14 天提醒重做到会；每周看一次学情分析，期末前再做一次早鸟卷，对比进步。${isNinth() ? '初三再加刷中考精编模拟卷和全国真题。' : ''}</li>
  </ol></details>`;
}
function setStage(stage) {
  if (!STAGES.some(st => st.stage === stage)) return;
  state.stage = stage;
  persist(() => {
    const latest = loadProgress();
    latest.stage = state.stage;
    saveProgress(latest);
  });
}
function weeklySubjectNow() {
  const chosen = state.weeklySubject || (isNinth() ? 'english' : 'x4m');
  return !isNinth() && chosen !== 'x4m' ? 'x4m' : chosen;
}
function weeklySubjectsNow() { return isNinth() ? WEEKLY_SUBJECTS : WEEKLY_SUBJECTS.filter(([key]) => key === 'x4m'); }

// ---- 按章节练：精编卷、早鸟卷每道题都标了教材章节（语文、英语按考点模块），见 tools/units.mjs ----
const UNIT_SUBJECTS = [['math', '数学'], ['physics', '物理'], ['chemistry', '化学'], ['chinese', '语文'], ['english', '英语'], ['daode', '道法'], ['lishi', '历史'], ['dili', '地理'], ['shengwu', '生物']];
const UNIT_RANK = ['七上', '七下', '八上', '八下', '九上', '九年级', '九下', '轴对称', '统计', '第一单元', '第二单元', '第三单元', '第四单元', '第五单元', '第六单元', '第七单元', '第八单元', '第九单元', '第十、', '第十二', '中国古代', '中国近代', '中国现代', '世界古代', '世界近代', '中外', '积累', '古诗文默写', '古诗词', '文言', '记叙', '说明', '议论', '名著', '作文', '语法·词法', '语法·时态', '语法·句子', '补全', '完形', '阅读理解', '短文', '书面'];
const unitRank = u => { const i = UNIT_RANK.findIndex(prefix => u.startsWith(prefix)); return i < 0 ? 99 : i; };
let unitPool = null;
const unitPoolBySubject = new Map();
async function ensureUnitPool(subject = state.unitSubject) {
  if (subject && unitPoolBySubject.has(subject)) return unitPoolBySubject.get(subject);
  const catalog = await window.NationalExams.catalog();
  const list = catalog.filter(p => p.data && (!subject || p.subject === subject) && (p.claude || p.earlybird || p.sync));
  const loaded = await Promise.all(list.map(p => window.NationalExams.loadPaper(p.id).catch(() => [])));
  const qs = loaded.flat().filter(q => q.unit);
  if (subject) unitPoolBySubject.set(subject, qs);
  unitPool = subject ? [...(unitPool || []).filter(q => q.subject !== subject), ...qs] : qs;
  return qs;
}
function unitCardHTML() {
  const subject = state.unitSubject || '';
  const chips = UNIT_SUBJECTS.map(([k, l]) => `<button type="button" class="drill-chip" data-unit-subject="${k}" aria-pressed="${subject === k}">${l}</button>`).join('');
  let body = '<p class="muted">先选科目，再选章节专项练。</p>';
  const subjectQs = subject ? (unitPoolBySubject.get(subject) || unitPool?.filter(q => q.subject === subject)) : null;
  if (subject && !subjectQs) body = '<p class="muted" role="status">正在整理章节…</p>';
  if (subject && subjectQs) {
    const units = [...new Set(subjectQs.map(q => q.unit))].sort((a, b) => unitRank(a) - unitRank(b) || a.localeCompare(b, 'zh'));
    body = units.length ? `<div class="unit-list">${units.map(u => {
      const inUnit = subjectQs.filter(q => q.unit === u);
      const free = inUnit.filter(isTrialQuestion).length;
      return `<button type="button" class="btn unit-btn" data-unit="${esc(u)}"><b>${esc(u)}</b><small>${inUnit.length} 题${hasFullAccess() ? '' : ` · 免费可做 ${free} 题`}</small></button>`;
    }).join('')}</div>` : '<p class="muted">这个科目还没有分章节的题。</p>';
  }
  return `<section class="card unit-card" id="unitCard" aria-labelledby="unitTitle">
    <div class="section-heading"><h2 id="unitTitle">📚 按章节练</h2><span class="muted">同步卷 · 早鸟卷 · 精编卷</span></div>
    <div class="weekly-chips" role="group" aria-label="选择科目">${chips}</div>${body}
  </section>`;
}
async function startUnit(unit) {
  const qs = (unitPool || []).filter(q => q.subject === state.unitSubject && q.unit === unit).sort((a, b) => String(a.paperId).localeCompare(String(b.paperId)) || a.number - b.number);
  const list = hasFullAccess() ? qs : qs.filter(isTrialQuestion);
  if (!list.length) { openUnlock('这一章的精编卷题目属于完整版；早鸟自测卷的题可以免费做。'); return; }
  if (list.length < qs.length) toast(`免费可做 ${list.length} 题，完整版可做本章全部 ${qs.length} 题。`);
  beginPractice(list, 'chapter');
}

// ---- 学情分析（规则版）：按科目、章节统计做过的题，找薄弱章节，给复习建议。数据只在本机 ----
async function buildAnalysis() {
  const out = byId('analysisOut');
  if (out) out.innerHTML = '<p class="muted" role="status">正在分析做题记录…</p>';
  await ensureUnitPool().catch(() => {});
  const progress = loadProgress();
  const pool = [...library.filter(q => q.subject && q.chapter && !q.national), ...(unitPool || [])];
  const stats = {};
  for (const q of pool) {
    const r = qProgress(progress, q.id);
    if (!hasAnswered(r)) continue;
    const unit = q.unit || q.chapter;
    const subj = (stats[q.subject] ||= { n: 0, right: 0, units: {} });
    const u = (subj.units[unit] ||= { n: 0, right: 0, wrong: 0 });
    subj.n++; u.n++;
    if (r.correct) { subj.right++; u.right++; }
    if ((r.wrongCount || 0) > 0) u.wrong++;
  }
  const today = todayStr();
  const due = Object.values(progress.banks || {}).filter(r => r?.srs?.due && r.srs.due <= today && !r.mastered).length;
  const days = studyDates(progress).filter(d => d >= todayStr(-6)).length;
  const subjects = Object.entries(stats).sort((a, b) => b[1].n - a[1].n);
  if (!subjects.length) {
    state.analysisHTML = '<p class="muted">还没有做题记录。先做一套早鸟自测卷或本周一卷，再来生成学情分析。</p>';
  } else {
    const label = k => EARLYBIRD_LABEL[k] || SUBJECTS[k]?.short || k;
    const rows = subjects.map(([k, s]) => {
      const rate = Math.round(s.right / s.n * 100);
      const units = Object.entries(s.units).filter(([, u]) => u.n >= 3).map(([name, u]) => [name, Math.round(u.right / u.n * 100), u.n]);
      const weak = units.filter(([, r]) => r < 80).sort((a, b) => a[1] - b[1]).slice(0, 3);
      const strong = units.filter(([, r]) => r >= 80).sort((a, b) => b[1] - a[1]).slice(0, 2);
      const tip = rate >= 85 ? '掌握得很扎实，保持做整卷的手感，错题按时复习即可。'
        : rate >= 70 ? '整体不错，把下面的薄弱章节专项练一遍，提分最快。'
        : rate >= 50 ? '基础已经有了，先把薄弱章节的解析看懂，再用“按章节练”每天练 10 题。'
        : '先别急着刷新题：把做错的题解析逐题看懂，从最薄弱的一章开始，一章一章补。';
      return `<div class="analysis-row"><p><b>${esc(label(k))}</b> · 做了 ${s.n} 题 · 正确率 ${rate}%</p>
        ${meter(rate, 100, `${label(k)}正确率 ${rate}%`, `analysis-meter ${rate >= 85 ? 'is-good' : rate >= 60 ? 'is-mid' : 'is-low'}`)}
        ${weak.length ? `<p class="analysis-weak">需要加强：${weak.map(([n, r, c]) => (unitPool || []).some(q => q.subject === k && q.unit === n)
          ? `<button type="button" class="analysis-go" data-go-subject="${esc(k)}" data-go-unit="${esc(n)}">${esc(n)}（${r}%，${c} 题）去补 →</button>`
          : `${esc(n)}（${r}%，${c} 题）`).join('；')}</p>` : ''}
        ${strong.length ? `<p class="analysis-strong">掌握较好：${strong.map(([n, r]) => `${esc(n)}（${r}%）`).join('；')}</p>` : ''}
        <p class="muted">${tip}</p></div>`;
    }).join('');
    const totalAnswered = subjects.reduce((sum, [, s]) => sum + s.n, 0);
    const totalRight = subjects.reduce((sum, [, s]) => sum + s.right, 0);
    const overallRate = totalAnswered ? Math.round(totalRight / totalAnswered * 100) : 0;
    const weakestUnit = subjects.flatMap(([, s]) => Object.entries(s.units).filter(([, u]) => u.n >= 3).map(([name, u]) => [name, Math.round(u.right / u.n * 100)])).sort((a, b) => a[1] - b[1])[0];
    state.analysisMeta = {
      title: '学情分析与错题诊断单',
      metric: `${overallRate}%`,
      metricSub: `累计作答 ${totalAnswered} 题 · 近 7 天学习 ${days} 天 · 待复习错题 ${due} 道`,
      verdict: overallRate >= 85 ? '整体掌握扎实，保持节奏稳步冲刺' : overallRate >= 70 ? '基础不错，集中攻克薄弱章节提分最快' : '找准薄弱环节逐章补齐，进步看得见',
      focusLine: weakestUnit ? `当前最需补强章节：${weakestUnit[0]}（正确率 ${weakestUnit[1]}%）` : '错题已自动收录进错题本，按 1、3、7、14 天提醒复习。',
    };
    state.analysisHTML = `<p>近 7 天学习 <b>${days}</b> 天 · 待复习错题 <b>${due}</b> 道${due ? '（先清掉到期的错题，效果最好）' : ''}</p>${rows}
      <div class="weekly-actions" style="margin:12px 0;"><button class="btn" type="button" id="analysisPosterBtn">生成学情诊断海报</button></div>
      <p class="muted">说明：只统计在本机做过的题；某一章做题少于 3 道时不评价。点“去补”直接练这一章（同步章节卷、早鸟卷、精编卷里这一章的题）。建议每周看一次。</p>`;
  }
  const box = byId('analysisOut');
  if (box) box.innerHTML = state.analysisHTML;
  const btn = byId('analysisBtn');
  if (btn) btn.textContent = '重新分析';
  wireAnalysis();
}
function wireAnalysis() {
  byId('analysisOut')?.querySelectorAll('[data-go-unit]').forEach(b => b.addEventListener('click', async () => {
    state.unitSubject = b.dataset.goSubject;
    await ensureUnitPool().catch(() => {});
    await startUnit(b.dataset.goUnit);
  }));
  byId('analysisPosterBtn')?.addEventListener('click', () => {
    if (state.analysisMeta) void openScorePoster(state.analysisMeta);
  });
}
function analysisCardHTML() {
  return `<section class="card analysis-card" id="analysisCard" aria-labelledby="analysisTitle">
    <div class="section-heading"><h2 id="analysisTitle">学情分析</h2><span class="muted">按科目、章节自动统计</span></div>
    <div id="analysisOut">${state.analysisHTML || '<p class="muted">按科目、章节统计孩子做过的题，找出最该补的章节。数据只保存在这台设备上。</p>'}</div>
    <button class="btn primary" type="button" id="analysisBtn">${state.analysisHTML ? '重新分析' : '生成学情分析'}</button>
  </section>`;
}

// ---- 小升初衔接：语数英按七年级上册章节，每章一套，限时免费 ----
const XSC_SUBJECTS = [['math', '数学'], ['chinese', '语文'], ['english', '英语']];
function xscPapers(subject) {
  return (nationalCatalog || []).filter(p => p.earlybird && p.stage === 'xsc' && (!subject || p.subject === subject)).sort((a, b) => (a.order || 0) - (b.order || 0));
}
function xscCardHTML() {
  if (!nationalCatalog || !xscPapers().length) return '';
  const subject = state.xscSubject || 'math';
  const done = loadEarlybirdScores();
  const papers = xscPapers(subject);
  return `<details class="card xsc-card" id="xsc" ${state.xscOpen ? 'open' : ''}>
    <summary><b>小升初衔接 · 按七年级上册章节</b><span>限时免费 · 六年级暑假、初一开学前用</span></summary>
    <p class="muted">语文、数学、英语按初一上册的章节，每章一套练习，题型和题干按初中考试标准出，难度贴近初一期中期末。每题有解析，做完出分。</p>
    <div class="weekly-chips" role="group" aria-label="选择科目">${XSC_SUBJECTS.map(([k, l]) => `<button type="button" class="drill-chip" data-xsc-subject="${k}" aria-pressed="${subject === k}">${l}</button>`).join('')}</div>
    ${ebModesHTML()}
    ${papers.length ? `<div class="unit-list">${papers.map(p => `<button type="button" class="btn unit-btn" data-earlybird="${p.id}"><b>${esc(p.unit || p.title)}</b><small>${done[p.id] != null ? `上次 ${done[p.id]} 分` : `${p.questionCount} 题 · 100 分`}</small></button>`).join('')}</div>` : '<p class="muted">这一科的衔接练习正在编写，很快上线。</p>'}
    <div class="eb-mark-box" id="xscMark"></div>
  </details>`;
}

// 早鸟卷、小升初卷三种做法：手机上做 / 打印整卷 / 纸上做完回来登记（家长多数让孩子在纸上做）
const EB_MODES = [['phone', '手机上做'], ['print', '打印整卷'], ['mark', '纸上做完登记']];
const EB_MODE_TIP = {
  phone: '手机上做：客观题自动判分，主观题对照得分点自评。',
  print: '已选打印：点下面要打印的那一套，打开后点顶部“打印”。题目和答案页分开，每大题标好分值。限时免费，不占免费打印次数。微信里打印不了的话，按提示换浏览器打开。',
  mark: '纸上做完后点科目：填上对照答案页算出的总分，再点出做错的题号。错题进错题本按时复习，学情分析也会算进去。',
};
function ebModesHTML() {
  const mode = state.ebMode || 'phone';
  return `<div class="eb-modes" role="group" aria-label="选择做法"><span class="eb-modes-label">怎么做：</span>${EB_MODES.map(([k, l]) => `<button type="button" class="drill-chip" data-eb-mode="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</div>
    <p class="muted eb-mode-tip">${EB_MODE_TIP[mode]}</p>`;
}
function setEbMode(mode) {
  state.ebMode = EB_MODE_TIP[mode] ? mode : 'phone';
  document.querySelectorAll('[data-eb-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ebMode === state.ebMode)));
  document.querySelectorAll('.eb-mode-tip').forEach(p => { p.textContent = EB_MODE_TIP[state.ebMode]; });
  document.querySelectorAll('.eb-mark-box').forEach(box => { box.innerHTML = ''; });
}
async function earlybirdAction(id, boxId) {
  const mode = state.ebMode || 'phone';
  if (mode === 'phone') { await startEarlybird(id); return; }
  try {
    const all = [...await window.NationalExams.loadPaper(id)].sort((a, b) => a.number - b.number);
    if (!all.length) throw new Error('这套卷暂时加载不了，请稍后再试。');
    const paper = (nationalCatalog || []).find(p => p.id === id) || { id, title: '早鸟自测卷' };
    if (mode === 'print') {
      // 打印直达链接：微信里打印不了时复制到浏览器，打开就是这一套的打印版
      printQuestions(`${paper.title}（满分 100 分）`, all, `${location.origin}/?print=${encodeURIComponent(id)}`);
      trackVisit(paper.stage === 'xsc' ? 'xsc_print' : 'earlybird_print');
    } else showEarlybirdMark(paper, all, boxId);
  } catch (error) { toast(error.message || '加载失败，请重试。'); }
}
function showEarlybirdMark(paper, list, boxId) {
  const box = byId(boxId);
  if (!box) return;
  const wrong = new Set();
  const full = q => (q.type === 'essay' ? q.score || 0 : q.paperScore || 0);
  box.innerHTML = `<div class="weekly-mark">
    <p><b>${esc(paper.title)}</b> · 纸上做完，登记成绩</p>
    <label class="eb-score">总分（对照答案页算出来的，可以不填）<input type="number" id="${boxId}Score" min="0" max="100" step="0.5" inputmode="decimal" placeholder="0～100"></label>
    <p class="muted">再点出做错、或主观题没拿满分的题号（没点的算做对）：</p>
    <div class="weekly-grid">${list.map((q, i) => `<button type="button" class="weekly-num" data-i="${i}" aria-pressed="false" aria-label="第 ${q.number} 题">${q.number}</button>`).join('')}</div>
    <div class="weekly-actions"><button class="btn primary" type="button" data-eb-save>登记</button><button class="btn" type="button" data-eb-cancel>取消</button></div>
  </div>`;
  box.querySelectorAll('.weekly-num').forEach(button => button.addEventListener('click', () => {
    const i = Number(button.dataset.i);
    if (wrong.has(i)) wrong.delete(i); else wrong.add(i);
    button.setAttribute('aria-pressed', String(wrong.has(i)));
  }));
  box.querySelector('[data-eb-cancel]').addEventListener('click', () => { box.innerHTML = ''; });
  box.querySelector('[data-eb-save]').addEventListener('click', () => {
    const typed = parseFloat(byId(`${boxId}Score`)?.value);
    const estimated = !(typed >= 0 && typed <= 100);
    const score = estimated ? Math.round(list.reduce((s, q, i) => s + (wrong.has(i) ? 0 : full(q)), 0) * 10) / 10 : typed;
    const saved = persist(() => { list.forEach((q, i) => recordAnswer(q, wrong.has(i) ? [] : (q.answer || []), !wrong.has(i), { mode: 'earlybird' })); return true; });
    if (!saved) return;
    const first = loadEarlybirdScores()[paper.id] == null;
    saveEarlybirdScore(paper.id, score);
    const isXsc = paper.stage === 'xsc';
    if (first) { trackVisit(isXsc ? 'xsc_done' : 'earlybird_done'); if (score >= 75) trackVisit(isXsc ? 'xsc_75' : 'earlybird_75'); }
    const [head, body] = earlybirdVerdict(score, paper);
    const wrongQs = list.filter((_, i) => wrong.has(i));
    const rx = !isXsc ? syncPrescriptions(wrongQs, paper.subject, paper.stage) : [];
    box.innerHTML = `<div class="weekly-mark"><p><b>${score} 分${estimated ? '（按错题号估算）' : ''} · ${esc(head)}</b></p>
      <p class="earlybird-verdict">${esc(body)}</p>
      <p class="muted">${wrong.size ? `错的 ${wrong.size} 题已进错题本，明天开始按 1、3、7、14 天提醒复习；学情分析也已算进去。` : '全对，已登记！'}</p>
      <div class="weekly-actions"><button class="btn" type="button" data-mark-poster>生成成绩单海报</button></div>
      ${rx.length ? `<div class="eb-rx"><p class="earlybird-next">下一步：错题集中在下面几章，先做这几章的<b>同步章节卷</b>，一章一章补见效最快：</p>
        ${rx.map(x => `<div class="eb-rx-row"><span>${esc(x.unit.replace(/^[^·]+·/, ''))}<small>错 ${x.n} 题</small></span><div>${x.papers.map(p => `<button class="btn" type="button" data-rx-paper="${p.id}">做「${esc(p.label || p.title)}」→</button>`).join('')}</div></div>`).join('')}
        ${!hasFullAccess() ? `<div class="eb-rx-upsell"><span class="muted">每章前 5 题可免费试做；完整版 ¥19.9 解锁全套同步卷 + 无限打印 + 云端错题本同步。</span><button class="btn primary" type="button" data-mark-upsell>看看完整版</button></div>` : ''}</div>` : ''}</div>`;
    box.querySelector('[data-mark-poster]')?.addEventListener('click', () => void openScorePoster({
      title: paper.title || '早鸟自测卷',
      metric: `${score} 分`,
      metricSub: `纸上完成登记 · 错题 ${wrong.size} 道`,
      verdict: head,
      focusLine: rx.length ? `本次诊断薄弱章：${rx.map(x => x.unit.replace(/^[^·]+·/, '')).join('、')}` : '错题已自动进错题本，按 1/3/7/14 天提醒复习。',
    }));
    box.querySelectorAll('[data-rx-paper]').forEach(b => b.addEventListener('click', () => { trackVisit('eb_rx'); claudePaperAction(b.dataset.rxPaper, 'phone'); }));
    box.querySelector('[data-mark-upsell]')?.addEventListener('click', () => openUnlock('开通完整版（¥19.9 一次买断），即可做完并打印全部薄弱章节同步卷，并开启 1/3/7/14 天错题自动复习与云端同步。'));
    const small = document.querySelector(`[data-earlybird="${paper.id}"] small`);
    if (small) small.textContent = `上次 ${score} 分`;
  });
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
// ---- 同步章节卷：跟着课本一章一套，按期中期末题型出（前 5 题免费试做，完整版全部开放） ----
const SYNC_SUBJECTS = [['math', '数学'], ['physics', '物理'], ['chemistry', '化学'], ['english', '英语'], ['chinese', '语文']];
function syncPapers(stage = state.stage) {
  return (nationalCatalog || []).filter(p => p.sync && p.stage === stage).sort((a, b) => (a.order || 0) - (b.order || 0));
}
// 同步章节卷每套做了多少：题目 id 是 national-<paperId>-qNN
// “题库可以免费拿”：14.9 买 → 邀 3 位朋友也买 → 返现 15 元（规则见 functions/_referrals.js，套餐不参加）
function freeWayHTML() {
  if (paidAccess) return '';
  return `<details class="card fold-row free-way" data-free-way ${state.freeWayOpen ? 'open' : ''}>
      <summary><b>买后还能免单</b><span>分享/好友价 14.9 买下 → 邀 3 位朋友也来买 → 返现 15 元，等于免费用 ›</span></summary>
      <ol>
        <li><b>先按 14.9 买：</b>点“完整版 19.9”，选分享价，把专属链接发到家长群，3 位朋友点开就能按 14.9 买；点朋友邀请链接进来的，直接买好友价 14.9。</li>
        <li><b>买完你也有邀请链接：</b>解锁后首页会出现你的专属邀请链接和二维码海报。朋友点你的链接，按好友价 14.9 买，比原价省 5 元，他也划算。</li>
        <li><b>邀满 3 位，返现 15 元：</b>作者确认后 24 小时内打到你的微信或支付宝，题库等于免费用。不要返现的，也可以换考证题库完整版。邀到第 1 位就先解锁冲刺卷。</li>
      </ol>
      <p class="free-note">朋友用你的邀请码兑换题库才算邀请成功；双题库套餐不参加邀请奖励。</p>
    </details>`;
}
function syncPaperProgress(paperId, progress) {
  const prefix = `national-${paperId}-q`;
  let done = 0, right = 0;
  for (const [id, rec] of Object.entries(progress.banks || {})) {
    if (!id.startsWith(prefix) || !rec?.done) continue;
    done += 1;
    if (rec.correct) right += 1;
  }
  return { done, right };
}
// 期末节奏：按本学期还没做的同步卷，算每周做几套能在期末前 2 周做完。
// 期末日期各地不同，默认按多数地区估（上学期 1 月 18 日、下学期 6 月 28 日，九下是中考，估 6 月 20 日），家长可以改，存在本机。
function finalExamDate(stage) {
  const half = stage === '9-down' ? 'zhongkao' : String(stage).endsWith('up') ? 'up' : 'down';
  const today = todayStr();
  let saved = '';
  try { saved = localStorage.getItem('x4m-final-' + half) || ''; } catch {}
  if (/^\d{4}-\d{2}-\d{2}$/.test(saved) && saved > today) return { date: saved, own: true, half };
  const y = Number(today.slice(0, 4));
  const md = { up: '01-18', down: '06-28', zhongkao: '06-20' }[half];
  const date = `${y}-${md}` > today ? `${y}-${md}` : `${y + 1}-${md}`;
  return { date, own: false, half };
}
function syncPlanHTML(all, progress) {
  const { date, own, half } = finalExamDate(state.stage);
  const month = Number(todayStr().slice(5, 7));
  const inSession = half === 'up' ? (month >= 9 || month === 1) : (month >= 2 && month <= 7);
  if (!inSession) return `<div class="sync-plan"><p>📅 ${half === 'up' ? '这是上学期的卷子：9 月开学后学完一章做一套；暑假想预习，可以先做前一两章。' : '这是下学期的卷子：开学后学完一章做一套；寒假想预习，可以先做前一两章。'}</p></div>`;
  const exam = half === 'zhongkao' ? '中考' : '期末';
  const days = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(todayStr() + 'T00:00:00Z')) / 86400000);
  const left = all.filter(p => !syncPaperProgress(p.id, progress).done).length;
  const weeks = Math.floor((days - 14) / 7);
  const [, m, d] = date.split('-');
  const text = !left ? `这学期 ${all.length} 套同步卷都做过了：${exam}前把错题按时复习到会，再做一次早鸟卷对比进步。`
    : weeks < 1 ? `离${exam}不到 3 周：不用再赶新卷，先做早鸟卷找弱项，把错题复习到会。`
    : `这学期还有 ${left} 套同步卷没做，每周做 ${Math.ceil(left / weeks)} 套，${weeks} 周正好做完，最后 2 周留给错题复习和早鸟卷。`;
  return `<div class="sync-plan"><p>📅 ${exam} ${Number(m)} 月 ${Number(d)} 日${own ? '' : '（按多数地区估的）'}，还有 ${Math.max(1, Math.ceil(days / 7))} 周。${text}</p>
    <details class="sync-plan-edit"><summary>${own ? `改${exam}日期` : `按当地的${exam}日期改`}</summary><input type="date" id="finalDate" value="${date}" min="${todayStr(1)}" aria-label="${exam}日期" /></details></div>`;
}
function syncCardHTML() {
  if (!nationalCatalog) return '';
  const grade = STAGE_SHORT[state.stage].split(' ')[0];
  const head = `<div class="section-heading"><h2 id="syncTitle">📘 ${grade}同步章节卷</h2><span class="muted">跟着课本，一章一套</span></div>`;
  if (state.stage === '7-up') return `<section class="card sync-card" id="sync" aria-labelledby="syncTitle">${head}
    <p class="muted">七上的数学、语文、英语章节卷就是上面的“🎒 小升初衔接”：按七上章节一章一套，现在限时免费，能手机做也能打印。</p>
    <button class="btn" type="button" data-sync-xsc>去做七上章节卷 →</button></section>`;
  const all = syncPapers();
  const subjects = SYNC_SUBJECTS.filter(([k]) => all.some(p => p.subject === k));
  if (!subjects.length) return `<section class="card sync-card" id="sync" aria-labelledby="syncTitle">${head}
    <p class="muted">${grade}的同步章节卷正在编写，数学先上，其他科随后。可以先做上面的早鸟卷，看看哪一章最需要补。</p></section>`;
  const subject = subjects.some(([k]) => k === state.syncSubject) ? state.syncSubject : subjects[0][0];
  const papers = all.filter(p => p.subject === subject);
  const progress = loadProgress();
  const stats = Object.fromEntries(papers.map(p => [p.id, syncPaperProgress(p.id, progress)]));
  const started = papers.filter(p => stats[p.id].done);
  const next = started.length ? papers.find(p => !stats[p.id].done) : null;
  return `<section class="card sync-card" id="sync" aria-labelledby="syncTitle">${head}
    <p class="muted">按人教版章节，每章一套 100 分，对标期中期末，带坑点解析。${hasFullAccess() ? '' : '每套前 5 题免费试做。'}</p>
    ${subjects.length > 1 ? `<div class="weekly-chips" role="group" aria-label="选择科目">${subjects.map(([k, l]) => `<button type="button" class="drill-chip" data-sync-subject="${k}" aria-pressed="${subject === k}">${l}</button>`).join('')}</div>` : ''}
    ${syncPlanHTML(all, progress)}
    ${started.length ? `<p class="sync-progress">已经做过 ${started.length} / ${papers.length} 套${next ? `，下一套：<b>${esc(next.label || next.unit || next.title)}</b>` : '，这一科全部做过了，错题记得按时复习'}</p>` : ''}
    <div class="paper-rows sync-rows">${papers.map(p => `<div class="paper-row${stats[p.id].done ? ' is-started' : ''}">
      <span>${esc(p.label || p.unit || p.title)}<small>${p.questionCount} 题${stats[p.id].done ? ` · 已做 ${stats[p.id].done}，对 ${stats[p.id].right}` : ''}</small></span>
      <button class="btn" type="button" data-claude-phone="${p.id}">${freeButtonLabel('phone', p.id, ['手机做', '手机做', '试做'])}</button>
      <button class="btn" type="button" data-claude-print="${p.id}">${freeButtonLabel('print', p.id, ['打印', '打印', '试印'])}</button>
    </div>`).join('')}</div>
  </section>`;
}
function earlybirdPapers() {
  return (nationalCatalog || []).filter(p => p.earlybird && (p.stage || '9-down') === state.stage).sort((a, b) => EARLYBIRD_ORDER.indexOf(a.subject) - EARLYBIRD_ORDER.indexOf(b.subject));
}
function earlybirdCardHTML() {
  if (!nationalCatalog) return '';
  const papers = earlybirdPapers();
  const done = loadEarlybirdScores();
  if (!papers.length) return `<section class="card earlybird-card" id="earlybird"><span class="earlybird-badge">⏰ 限时免费 · 早鸟自测</span>
    <h2>${esc(STAGE_SHORT[state.stage])} 早鸟自测卷</h2><p>这个学期的早鸟卷正在编写，很快上线。可以先切到其他学期看看。</p></section>`;
  return `<section class="card earlybird-card" id="earlybird" aria-labelledby="earlybirdTitle">
    <span class="earlybird-badge">⏰ 限时免费 · 早鸟自测</span>
    <h2 id="earlybirdTitle">${esc(STAGE_SHORT[state.stage])} 早鸟自测卷：看看孩子现在的真实水平</h2>
    <p>${state.stage === '9-down' ? '中考全范围，九科各一套' : '只考到这个学期学过的内容，各科一套'}，${isNinth() ? '按中考题型出题' : '按期末题型出题'}、难度略高一点。做完出百分制总分，还告诉你错题集中在哪几章。</p>
    ${ebModesHTML()}
    <div class="earlybird-grid">${papers.map(p => `<button class="btn" type="button" data-earlybird="${p.id}"><b>${esc(EARLYBIRD_LABEL[p.subject] || p.subjectLabel)}</b><small>${done[p.id] != null ? `上次 ${done[p.id]} 分` : `${p.questionCount} 题`}</small></button>`).join('')}</div>
    <div class="eb-mark-box" id="ebMark"></div>
  </section>`;
}
function loadEarlybirdScores() {
  try { return JSON.parse(localStorage.getItem('earlybird-scores') || '{}') || {}; } catch { return {}; }
}
function saveEarlybirdScore(paperId, score) {
  try { const all = loadEarlybirdScores(); all[paperId] = score; localStorage.setItem('earlybird-scores', JSON.stringify(all)); } catch {}
}
async function startEarlybird(id) {
  try {
    const all = [...await window.NationalExams.loadPaper(id)].sort((a, b) => a.number - b.number);
    if (!all.length) throw new Error('这套卷暂时加载不了，请稍后再试。');
    state.earlybirdPaper = id;
    beginPractice(all, 'earlybird');
  } catch (error) { toast(error.message || '加载失败，请重试。'); }
}
// 给家长和孩子信心：分数段对应的鼓励语（卷子比中考略难，说明里要讲清楚）
function earlybirdVerdict(score, paper) {
  if (paper?.stage === 'xsc') {
    if (score >= 85) return ['太棒了！', '这一章的内容你已经提前掌握得很好了，上初一会轻松很多。可以接着做下一章。'];
    if (score >= 70) return ['很不错！', '初一的新知识你已经学进去了一大半，把错题的解析看懂，再做一遍会更稳。'];
    if (score >= 50) return ['已经有基础了！', '初中的题比小学多绕了几个弯，丢分很正常。先把错题解析看懂，弄明白“坑”在哪里。'];
    return ['别着急，这是初一的内容！', '这些题本来就是初一才学的，现在做不出来很正常。看懂解析就是收获，开学后再做一遍，你会发现自己进步很大。'];
  }
  const exam = /^9/.test(paper?.stage || '9-down') ? '中考' : '期末考试';
  return earlybirdVerdictZk(score).map(t => t.replace(/中考/g, exam));
}
function earlybirdVerdictZk(score) {
  if (score >= 85) return ['太厉害了！', '这套卷特意拔高过难度，能拿到这个分数，说明基础非常扎实。把错的几道题弄懂，保持节奏就好。'];
  if (score >= 75) return ['很不错！', '这套卷比中考略难，能拿到这个分数，说明大部分考点已经掌握。错题已经进了错题本，按 1、3、7、14 天复习，还能再往上走。'];
  if (score >= 60) return ['基础已经有了！', '这套卷故意加了难度和“坑”，丢分的地方恰好就是提分空间。先把错题解析看懂，再按学期把对应的知识点补一补。'];
  return ['别灰心，现在发现问题正是时候！', '这套卷比中考难，本来就是用来找漏洞的。离中考还有时间，从错题开始，一个知识点一个知识点地补，分数会一步步涨上来。'];
}
function earlybirdScore(results) {
  return Math.round(results.reduce((sum, [id, r]) => {
    const q = state.queue.find(item => item.id === id) || library.find(item => item.id === id);
    if (r.total) return sum + (r.score || 0);
    return sum + (r.correct && q?.paperScore ? q.paperScore : 0);
  }, 0) * 10) / 10;
}

function claudePapers(subject) { return (nationalCatalog || []).filter(p => p.claude && p.subject === subject); }
function subjectSectionsHTML() {
  if (!nationalCatalog) return '<section class="card" role="status">正在加载分科目录…</section>';
  if (!isNinth()) return `<details class="card fold-row subject-later"><summary><b>中考精编卷和全国真题</b><span>初三再刷 ›</span></summary><p class="muted">语数英物化的中考精编卷、全国各地真题是按中考全范围出的，初三（九上、九下）再刷更合适。现在先把本学期的早鸟卷和小四门练扎实；想提前看看，可以把上面的学期切到“九上”或“九下”。</p></details>`;
  const opened = state.openSubjects || new Set();
  return `<section class="subject-sections" aria-labelledby="subjectsTitle">
    <div class="section-heading"><h2 id="subjectsTitle">分科练习</h2><span class="muted">点开科目看模拟卷和真题</span></div>
    ${MAIN_SUBJECTS.map(({ key, label, icon: emoji }) => {
      const claude = claudePapers(key);
      const real = nationalCatalog.filter(p => p.subject === key && !p.claude && !p.earlybird && !p.sync);
      const practicable = real.filter(p => p.data);
      const count = practicable.reduce((s, p) => s + (p.questionCount || 0), 0);
      const meta = [claude.length ? `精编模拟卷 ${claude.length} 套` : '', real.length ? `真题 ${real.length} 套` : '', count ? `${count} 道可刷` : ''].filter(Boolean).join(' · ');
      return `<details class="card subject-section" data-subject-section="${key}" ${opened.has(key) ? 'open' : ''}>
        <summary><b>${emoji} ${label}</b><span>${meta || '即将上线'}</span></summary>
        ${claude.length ? `<div class="paper-rows"><p class="row-title">精编模拟卷 <span class="sprint-tag hot">变式题</span></p>${claude.map(p => `<div class="paper-row">
          <span>${esc(p.title)}<small>${p.questionCount} 题</small></span>
          <button class="btn" type="button" data-claude-phone="${p.id}">${freeButtonLabel('phone', p.id, ['手机做', '免费手机做整卷', '试前 5 题'])}</button>
          <button class="btn" type="button" data-claude-print="${p.id}">${freeButtonLabel('print', p.id, ['打印', '免费打印整卷', '打印前 5 题'])}</button>
        </div>`).join('')}</div>` : ''}
        <div class="paper-rows"><p class="row-title">全国真题</p>
          ${practicable.length ? `<div class="paper-row"><span>手机刷真题<small>${key === 'english' ? '按中考题型练，每题有中文解析' : '逐题判分'}</small></span><button class="btn" type="button" data-national-open="${key}" data-national-mode="short">去刷题 →</button></div>` : ''}
          ${real.length ? `<div class="paper-row"><span>看原卷 · 打印<small>免费 · ${[...new Set(real.map(p => p.region))].slice(0, 4).join('、')}${real.length > 4 ? ' 等' : ''}</small></span><button class="btn" type="button" data-national-open="${key}" data-national-mode="paper">看原卷 →</button></div>` : '<p class="muted">真题整理中。</p>'}
        </div>
        ${!claude.length ? '<p class="muted row-note">精编模拟卷正在编写，会按留言需求陆续加上。</p>' : ''}
      </details>`;
    }).join('')}
  </section>`;
}
function x4mGroupHTML(queue, progress) {
  const idx = resumeIndex(queue, progress);
  const x4mOriginals = (nationalCatalog || []).filter(p => SUBJECT_ORDER.includes(p.subject) || p.subject === 'daode' || p.subject === 'lishi');
  const open = state.x4mOpen ?? Object.keys(progress.banks || {}).some(id => !isNationalId(id));
  const countText = banks ? `${fmt.format(queue.length)} 道` : '2,453 道';
  return `<details class="card x4m-group" id="x4mGroup" ${open ? 'open' : ''}>
    <summary><b>🧭 小四门 · 道法 / 历史 / 地理 / 生物</b><span>按年级学期刷 · 主观题 · 冲刺卷</span></summary>
    <div class="x4m-bar">
      <div class="stage-field"><label for="stageSelect">年级学期</label>
        <select id="stageSelect">${STAGES.map(s => `<option value="${s.stage}" ${s.stage === state.stage ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
      <p class="muted">${activeSubjectsForStage(state.stage).map(k => SUBJECTS[k].short).join(' · ')} · ${countText} · ${idx > 0 ? `上次练到第 ${idx + 1} 题` : esc(STAGE_HINT[state.stage] || '')}</p>
      <div class="x4m-actions">
        <button class="btn primary" type="button" data-mode="all">${idx > 0 ? '继续练习' : '按学期刷题'} ${icon('arrow-right')}</button>
        <button class="btn" type="button" data-mode="random">${icon('shuffle')} 随机</button>
        <button class="btn" type="button" data-mode="unfinished">只做未做题${banks ? ` · ${fmt.format(applyMode(queue, 'unfinished', progress).length)}` : ''}</button>
        <a class="btn" href="./key-points.html">${icon('book-open')} 考点速记</a>
        ${x4mOriginals.length ? `<button class="btn" type="button" data-national-open="${x4mOriginals[0].subject}" data-national-mode="paper">中考原卷</button>` : ''}
      </div>
    </div>
    <section id="sprintTeaser"></section>
    ${drillCardHTML(progress)}
    <div class="dashboard-lower">
      ${subjectProgressHTML(progress)}
      <div class="daily-column">${dailyCardHTML(progress)}${reviewCardsHTML(progress)}</div>
    </div>
  </details>`;
}
function nationalRecordCount(progress, mode) {
  const today = todayStr();
  return Object.entries(progress.banks || {}).filter(([id, r]) => isNationalId(id) && r && (
    mode === 'wrong' ? r.wrong : mode === 'favorite' ? r.favorite : mode === 'everWrong' ? (r.wrong || (r.wrongCount || 0) > 0)
      : mode === 'due' ? (r.srs && !r.mastered && r.srs.due && r.srs.due <= today) : false)).length;
}
function reviewHubHTML(progress) {
  const options = [
    { name: '错题本', mode: 'wrong', icon: 'notebook-pen', tone: 'lishi' },
    { name: '到期复习', mode: 'due', icon: 'calendar-check', tone: 'dili' },
    { name: '曾错题', mode: 'everWrong', icon: 'rotate-ccw', tone: 'shengwu' },
    { name: '收藏题', mode: 'favorite', icon: 'bookmark', tone: 'daode' },
  ];
  return `<section class="quick-section" id="reviewHub" aria-labelledby="modesTitle">
    <div class="section-heading"><h2 id="modesTitle">错题与收藏 · 全科</h2><span class="muted">英语、语文、模拟卷、本周一卷、小四门都记在这里</span></div>
    <div class="quick-grid">
      ${options.map(entry => {
        const n = applyMode(library, entry.mode, progress).length + nationalRecordCount(progress, entry.mode);
        return `<button class="quick-card tone-${entry.tone}" data-mode="${entry.mode}">
        <span class="tile-icon">${icon(entry.icon)}</span>
        <span class="quick-name"><strong>${entry.name}</strong><small>${!hasFullAccess() && entry.mode === 'due' ? '完整版' : fmt.format(n) + ' 道'}</small></span>
        ${icon('chevron-right', 'quick-arrow')}
      </button>`;
      }).join('')}
    </div>
    <div class="wrong-print-bar">
      <div>
        <b>🖨️ 省掉错题打印机：一键印出专属 A4 错题重做卷</b>
        <span class="muted">自动汇总数理化知识点、同步卷、早鸟卷与小四门错题，附独立家长答案解析页。</span>
      </div>
      <div class="wrong-print-actions">
        <button type="button" class="btn primary" data-wrong-print="wrong">印当前错题卷</button>
        <button type="button" class="btn" data-wrong-print="everWrong">印全部曾错题</button>
      </div>
    </div>
  </section>`;
}
async function openWrongPrintSheet(mode) {
  if (!banks && typeof startBanksBackgroundLoad === 'function') {
    toast('正在整理全科错题…');
    await startBanksBackgroundLoad();
  }
  const progress = loadProgress();
  const baseList = [...applyMode(library, mode, progress), ...await withNationalExtras(mode, progress)];
  // 同时汇入数理化知识点补缺中的错题
  const kpIds = Object.entries(progress.banks || {})
    .filter(([id, r]) => id.startsWith('kp-') && r && (mode === 'wrong' ? r.wrong : (r.wrong || (r.wrongCount || 0) > 0)))
    .map(([id]) => id);
  const kpList = [];
  if (kpIds.length) {
    const sems = new Set(kpIds.map(id => { const p = id.split('-'); return p.length >= 3 ? `${p[1]}-${p[2]}` : ''; }).filter(Boolean));
    for (const semKey of sems) {
      if (!window.KNOWLEDGE_DATA?.[semKey]) {
        try {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = `./data/knowledge-${semKey}.js`;
            s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
          });
        } catch {}
      }
      const d = window.KNOWLEDGE_DATA?.[semKey];
      if (d?.questions) {
        const want = new Set(kpIds);
        for (const q of d.questions) if (want.has(q.id)) kpList.push(q);
      }
    }
  }
  const seen = new Set();
  const all = [...kpList, ...baseList].filter(q => q && !seen.has(q.id) && seen.add(q.id));
  if (!all.length) { toast('错题本还是空的，先做一套 3 分钟快测或同步卷吧！'); return; }
  trackVisit('wrong_print');
  const paid = hasFullAccess();
  const picked = paid ? all.slice(0, 45) : all.slice(0, 3);
  const label = mode === 'everWrong' ? '全部曾错题' : '当前错题';
  const title = paid
    ? `爱丽克丝中考题库 · 我的专属 A4 错题重做卷（${label} ${picked.length} 题）`
    : `我的专属 A4 错题重做卷（体验样卷 · 完整版可印全部 ${all.length} 题）`;
  printQuestions(title, picked);
  if (!paid && all.length > picked.length) {
    toast(`当前为免费体验样卷（前 ${picked.length} 题），开通完整版 ¥19.9 可无限打印全部 ${all.length} 道错题。`);
  }
}
function printCardHTML() {
  const claude = (nationalCatalog || []).filter(p => p.claude);
  return `<details class="card fold-row print-card" id="printFold" ${state.printOpen ? 'open' : ''}>
    <summary><b>🖨 打印练习卷</b><span>本周一卷 · 精编卷 · 小四门 ›</span></summary>
    <p class="muted">答案单独一页，带“姓名 / 用时 / 得分”栏。各地真题原卷在上面分科里点“看原卷”，免费打印。</p>
    <div class="print-row">
      <select id="printKind" aria-label="打印什么">
        <optgroup label="本周一卷">${weeklySubjectsNow().map(([key, label]) => `<option value="weekly:${key}">本周一卷 · ${label}</option>`).join('')}</optgroup>
        ${claude.length ? `<optgroup label="精编模拟卷">${claude.map(p => `<option value="claude:${p.id}">${esc(p.title)}</option>`).join('')}</optgroup>` : ''}
        <optgroup label="小四门"><option value="x4m">小四门 · 按科目和册次</option></optgroup>
      </select>
      <span class="print-x4m" id="printX4m" hidden>
        <select id="printSubject" aria-label="科目">${SUBJECT_ORDER.map(key => `<option value="${key}">${SUBJECTS[key].label}</option>`).join('')}</select>
        <select id="printChapter" aria-label="册次"></select>
      </span>
      <button class="btn primary" type="button" id="printPaper">生成并打印</button>
    </div>
    ${hasFullAccess() ? '' : `<p class="muted">${freeUses.print ? `免费整卷打印已用在《${esc(freeUses.print.title)}》上，这一套可以反复打印。` : '每个家庭可以免费打印 1 次整卷（任选一套），之后的卷子可打印前 5 题。'}</p>`}
  </details>`;
}
async function claudePaperAction(id, action) {
  try {
    const paper = (nationalCatalog || []).find(p => p.id === id);
    const all = [...await window.NationalExams.loadPaper(id)].sort((a, b) => a.number - b.number);
    const claim = await claimFree(action === 'phone' ? 'phone' : 'print', id, paper.title);
    if (claim === 'cancel') return;
    const list = claim === 'full' ? all : all.filter(q => q.preview);
    if (action === 'phone') beginPractice(list, paper?.sync ? 'sync' : 'paper');
    else printQuestions(`${paper.title}${claim === 'full' ? '' : ' · 体验版前 5 题'}`, list);
  } catch (error) { toast(error.message || '加载失败，请重试。'); }
}
async function printSelected() {
  const kind = byId('printKind').value;
  if (kind.startsWith('weekly:')) { state.weeklySubject = kind.slice(7); await runWeekly('print'); return; }
  if (kind.startsWith('claude:')) { await claudePaperAction(kind.slice(7), 'print'); return; }
  if (!banks) {
    toast('正在加载小四门题库…');
    await startBanksBackgroundLoad();
    fillPrintChapters();
  }
  const subject = byId('printSubject').value;
  const chapterId = Number(byId('printChapter').value);
  const title = `${SUBJECTS[subject].label} · ${printChapters(subject).find(c => c.id === chapterId)?.title || ''} 练习卷`;
  const claim = await claimFree('print', `x4m-${subject}-${chapterId}`, title);
  if (claim === 'cancel') return;
  const paper = buildPrintPaper(subject, chapterId, claim === 'full');
  if (!paper.count) { toast('这一册暂时没有可打印的题。'); return; }
  window.QuizReferrals?.showPapers?.([paper], { print: true });
}
function originCardHTML() {
  return `<details class="card origin-card">
    <summary><b>为什么做这个题库</b><span>一个初中生家长的想法 ›</span></summary>
    <p>孩子上初中以后，家里的教辅越买越多，真正做完的没几本；网上的“押题卷”一份比一份难，做完只剩焦虑。我想要的其实很简单：<b>题目准、讲得清、做完知道错在哪。</b></p>
    <p>所以我做了这个题库：全国各地的中考真题整理成可以逐题刷的题；再结合自己一路考证、陪孩子备考的经验，对照课标和中考考点编写精编模拟卷——都是紧贴考点的变式题，不刻意拔高，也不随意降低难度，每道题都写解析；小四门按年级学期整理，背过的东西有地方练。</p>
    <p><b>会用工具，但每题自己把关：</b>整理和编写时我会借助 AI 工具提高效率，但考什么、怎么考、哪道题该留，都由我自己判断。每套卷子上线前，我都从头到尾亲自做一遍，有错误、有歧义的题一律剔除。不押题、不保过，只帮孩子多练手、查漏补缺、稳步提分。</p>
    <p>说句实在话：孩子自己不花时间，再多的书和题也只是摆设。我们能做的，是让他的每一分钟都花在值得做的题上。</p>
    <p><b>手机党、纸笔党都照顾到：</b>每张卷子都能打印，答案单独一页。纸上做完，回来在“本周一卷”里点出错题号，错题本照样记着，到时间提醒复习。</p>
    <p><b>为什么收费：</b>整理题目、编写解析要用到付费的 AI 工具，服务器也要钱。各地原卷永远免费看、免费打印；手机刷真题、精编模拟卷整卷、本周一卷和错题复习属于完整版，19.9 一次买断。先免费试，孩子用得上再买。</p>
    <p>有想要的科目、地区、题型，到作者主页留言，我会按大家的需要加题。</p>
  </details>`;
}
async function withNationalExtras(mode, progress) {
  const ids = Object.keys(progress.banks || {}).filter(isNationalId);
  if (!ids.length || !window.NationalExams?.resolve) return [];
  try { return applyMode(await window.NationalExams.resolve(ids), mode, progress); } catch { return []; }
}
const nationalSearchLoaded = new Map();
let nationalSearchPool = [];
let searchSeq = 0;
let searchTimer;
async function ensureNationalSearch(subject = '', onProgress = null) {
  if (!window.NationalExams?.catalog) return [];
  const list = (await window.NationalExams.catalog()).filter(p => p.data && (!subject || p.subject === subject));
  const missing = list.filter(p => !nationalSearchLoaded.has(p.id));
  if (missing.length) {
    // 分批并发加载（每批 6 个），避免 180+ 个脚本同时涌入阻塞手机网络
    const CONCURRENCY = 6;
    let done = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < missing.length) {
        const paper = missing[cursor++];
        const qs = await window.NationalExams.loadPaper(paper.id).catch(() => []);
        nationalSearchLoaded.set(paper.id, qs);
        done++;
        onProgress?.(done, missing.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, missing.length) }, worker));
    nationalSearchPool = [...nationalSearchLoaded.values()].flat();
  }
  return subject ? list.flatMap(p => nationalSearchLoaded.get(p.id) || []) : nationalSearchPool;
}

function renderUpdateLogs(all = false) {
  const list = all ? UPDATE_LOG : UPDATE_LOG.slice(0, 5);
  const items = list.map(([date, text]) => `<li><time>${date}</time><span>${text}</span></li>`).join('');
  const moreBtn = (!all && UPDATE_LOG.length > 5)
    ? `<li class="update-more"><button type="button" class="btn text-button" id="expandUpdates">查看更早的更新记录（还有 ${UPDATE_LOG.length - 5} 条）›</button></li>`
    : '';
  return items + moreBtn;
}

function renderHome(focus = '') {
  if (!nationalCatalog && !banks) { renderLiteHome(); return; }
  window.NationalExams?.leave();
  window.KnowledgeHub?.leave();
  document.body.classList.remove('practice');
  const progress = loadProgress();
  if (!paidAccess && paidLaunchDate) persist(() => startLegacyTrial(progress, paidLaunchDate));
  const queue = availableQueue(progress);
  const trialDays = paidAccess ? 0 : legacyTrialDays();
  const accessNotice = accessNoticeHTML(trialDays);
  refreshStreak(progress);
  byId('headerSearch').hidden = false;
  const homeTab = state.homeTab || 'kp';
  const homeTabs = [
    ['kp', '🎯 补缺主线'],
    ['papers', '📝 同步与真题'],
    ['review', '📕 错题与小四门'],
    ['mine', '🎁 说明与更多'],
  ];
  view.innerHTML = `
    ${homeIntroHTML()}
    <nav class="home-tabs" role="tablist" aria-label="首页功能导航">
      ${homeTabs.map(([k, label]) => `<button type="button" class="home-tab-btn" role="tab" data-home-tab="${k}" aria-selected="${homeTab === k}">${label}</button>`).join('')}
    </nav>
    <div class="home-tab-panel" data-tab-panel="kp" ${homeTab !== 'kp' ? 'hidden' : ''}>
      ${window.KnowledgeHub?.homeCardHTML(state.stage) || ''}
      <section class="card home-tab-hint">
        <div><b>还需要刷整套同步章节卷、早鸟卷或全国各地真题？</b><span class="muted">点上方「📝 同步与真题」即可按学期刷卷或整卷打印；小四门、每周一卷与错题本在「📕 错题与小四门」。</span></div>
        <button type="button" class="btn" data-home-tab="papers">去看同步与真题 ›</button>
      </section>
    </div>
    <div class="home-tab-panel" data-tab-panel="papers" ${homeTab !== 'papers' ? 'hidden' : ''}>
      ${stageBarHTML()}
      <div class="home-section-head"><span>更多练习</span><small>早鸟自测卷、同步章节卷、分科整卷，按需选用</small></div>
      ${state.stage === '7-up' ? xscCardHTML() : ''}
      ${earlybirdCardHTML()}
      ${syncCardHTML()}
      <div id="subjectSections">${subjectSectionsHTML()}</div>
    </div>
    <div class="home-tab-panel" data-tab-panel="review" ${homeTab !== 'review' ? 'hidden' : ''}>
      <div class="home-section-head"><span>复习与提分工具</span><small>小四门、错题复习、学情分析与打印找题</small></div>
      <div class="home-tools-grid">
        ${x4mGroupHTML(queue, progress)}
        ${reviewHubHTML(progress)}
        ${weeklyCardHTML(progress)}
        ${unitCardHTML()}
        ${printCardHTML()}
        <details class="card fold-row search-card" id="searchPanel" ${state.searchOpen || state.keyword ? 'open' : ''}>
          <summary><b id="searchTitle">${icon('search')} 全题库找题</b><span>真题、模拟卷、小四门都能搜 ›</span></summary>
          <div class="search-fields">
            <input type="search" id="searchBox" aria-label="题目关键词" placeholder="试试输入「宋代」「现在完成时」「默写」" value="${esc(state.keyword)}">
            <select id="searchSubject" aria-label="搜索科目">
              <option value="">全部科目</option>
              ${MAIN_SUBJECTS.map(s => `<option value="${s.key}" ${state.searchSubject === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}
              ${SUBJECT_ORDER.map(key => `<option value="${key}" ${state.searchSubject === key ? 'selected' : ''}>${SUBJECTS[key].label}</option>`).join('')}
            </select>
          </div>
          <p class="muted" id="searchStatus" role="status"></p>
          <div id="searchOut" class="search-results"></div>
        </details>
        ${state.stage === '7-up' || String(state.stage).startsWith('9-') ? '' : xscCardHTML()}
        ${analysisCardHTML()}
      </div>
    </div>
    <div class="home-tab-panel" data-tab-panel="mine" ${homeTab !== 'mine' ? 'hidden' : ''}>
      <div class="home-section-head"><span>完整版权益与说明</span><small>一次买断用到中考 · 3 台设备共用 + 云端错题同步</small></div>
      ${freeWayHTML()}
      <div class="home-meta-grid">
        ${originCardHTML()}
        <details class="card origin-card update-card">
          <summary><b>更新日志</b><span>最近：${UPDATE_LOG[0][0]} · 查看更新内容 ›</span></summary>
          <ol class="update-list" id="updateList">${renderUpdateLogs(state.allUpdatesOpen)}</ol>
        </details>
      </div>
    </div>
    ${accessNotice}
    <section class="card cross-bank-card">${accountingRecommendation()}</section>`;
  wireHome();
  if (byId('knowledgeHome')) window.KnowledgeHub.wireHome(byId('knowledgeHome'));
  if (focus) moveFocus(byId(focus), focus === 'homeTitle');
  updateLegacyCountdown();
}
function wireSubjectSections() {
  const box = byId('subjectSections');
  if (!box) return;
  box.querySelectorAll('[data-subject-section]').forEach(section => section.addEventListener('toggle', () => {
    state.openSubjects = state.openSubjects || new Set();
    if (section.open) state.openSubjects.add(section.dataset.subjectSection); else state.openSubjects.delete(section.dataset.subjectSection);
  }));
  box.querySelectorAll('[data-claude-phone]').forEach(b => b.addEventListener('click', () => { void claudePaperAction(b.dataset.claudePhone, 'phone'); }));
  box.querySelectorAll('[data-claude-print]').forEach(b => b.addEventListener('click', () => { void claudePaperAction(b.dataset.claudePrint, 'print'); }));
}
// 原地重绘首页：记住当前卡片在视口中的位置，切换学期或科目后绝不跳屏
function rerenderHomeInPlace(anchorId) {
  const prevY = window.scrollY;
  const beforeEl = anchorId ? byId(anchorId) : null;
  const beforeTop = beforeEl ? beforeEl.getBoundingClientRect().top : null;
  renderHome();
  const afterEl = anchorId ? byId(anchorId) : null;
  if (afterEl && beforeTop !== null) {
    window.scrollBy(0, afterEl.getBoundingClientRect().top - beforeTop);
  } else {
    window.scrollTo(0, prevY);
  }
}
// 首屏几张卡（学期、早鸟卷、小升初、同步卷）的事件：完整首页和轻首页共用
function wireTopCards() {
  const sync = byId('sync');
  if (sync) {
    sync.querySelectorAll('[data-claude-phone]').forEach(b => b.addEventListener('click', () => { void claudePaperAction(b.dataset.claudePhone, 'phone'); }));
    sync.querySelectorAll('[data-claude-print]').forEach(b => b.addEventListener('click', () => { void claudePaperAction(b.dataset.claudePrint, 'print'); }));
    sync.querySelectorAll('[data-sync-subject]').forEach(b => b.addEventListener('click', () => { state.syncSubject = b.dataset.syncSubject; rerenderHomeInPlace('sync'); }));
    sync.querySelector('[data-sync-xsc]')?.addEventListener('click', () => { state.xscOpen = true; renderHome(); byId('xsc')?.scrollIntoView({ block: 'start' }); });
    byId('finalDate')?.addEventListener('change', e => {
      const value = e.target.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
      try { localStorage.setItem('x4m-final-' + finalExamDate(state.stage).half, value); } catch {}
      rerenderHomeInPlace('sync');
    });
  }
  view.querySelectorAll('[data-xsc-subject]').forEach(b => b.addEventListener('click', () => { state.xscSubject = b.dataset.xscSubject; state.xscOpen = true; rerenderHomeInPlace('xsc'); }));
  byId('xsc')?.addEventListener('toggle', event => { state.xscOpen = event.currentTarget.open; });
  view.querySelectorAll('[data-stage-pick]').forEach(b => b.addEventListener('click', () => { setStage(b.dataset.stagePick); rerenderHomeInPlace(b.closest('#stageBarTitle') ? 'stageBarTitle' : 'knowledgeHome'); }));
  view.querySelectorAll('[data-home-tab]').forEach(b => b.addEventListener('click', () => {
    state.homeTab = b.dataset.homeTab;
    view.querySelectorAll('[data-home-tab][role="tab"]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.homeTab === state.homeTab)));
    view.querySelectorAll('[data-tab-panel]').forEach(p => { p.hidden = p.dataset.tabPanel !== state.homeTab; });
  }));
  view.querySelectorAll('[data-earlybird]').forEach(b => b.addEventListener('click', () => { void earlybirdAction(b.dataset.earlybird, b.closest('#xsc') ? 'xscMark' : 'ebMark'); }));
  view.querySelectorAll('[data-eb-mode]').forEach(b => b.addEventListener('click', () => setEbMode(b.dataset.ebMode)));
}
// 主页、视频里的直达链接：x4m.cc.cd/?go=earlybird / xsc / sync，只跳一次
function jumpToGoTarget() {
  if (!state.printJumped && nationalCatalog) {
    // ?print=卷子 id：从微信复制到浏览器的打印链接，打开直接是这套卷的打印版（只限早鸟卷、小升初卷）
    const printId = new URLSearchParams(location.search).get('print');
    state.printJumped = true;
    if (printId && nationalCatalog.some(p => p.id === printId && p.earlybird)) {
      state.earlybirdJumped = true;
      setEbMode('print');
      void earlybirdAction(printId, 'ebMark');
      return;
    }
  }
  if (state.earlybirdJumped || !nationalCatalog) return;
  const go = new URLSearchParams(location.search).get('go');
  if (!['earlybird', 'xsc', 'sync'].includes(go)) return;
  state.earlybirdJumped = true;
  state.homeTab = 'papers';
  if (go === 'xsc' && !state.xscOpen) state.xscOpen = true;
  renderHome();
  // 不用 smooth：滚动动画进行中首页会再画一次（免费额度状态回来），动画会被打断，停在顶部
  byId(go)?.scrollIntoView({ block: 'start' });
}
// 轻首页：小四门题库（几 MB）还没下完时，先把学期、早鸟卷、同步卷画出来，家长不用干等
function renderLiteHome() {
  if (location.hash === '#national') return;
  document.body.classList.remove('practice');
  view.innerHTML = `
    ${homeIntroHTML()}
    ${stageBarHTML()}
    ${state.stage === '7-up' ? xscCardHTML() : ''}
    ${earlybirdCardHTML()}
    ${syncCardHTML()}
    ${state.stage === '7-up' || String(state.stage).startsWith('9-') ? '' : xscCardHTML()}
    <section class="card loading-card" id="liteLoading" role="status">${state.banksFailed
      ? '<p class="muted">按章节练、错题本、小四门等内容没加载下来（网络不稳）。上面的早鸟卷、同步章节卷、小升初衔接照常能用。</p><button class="btn" type="button" id="liteRetry">重新加载</button>'
      : '<p class="muted">按章节练、错题本、小四门等内容还在加载，网络慢的话要多等几秒……</p>'}</section>`;
  wireTopCards();
  byId('liteRetry')?.addEventListener('click', event => {
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = '正在加载…';
    void init();
  });
  jumpToGoTarget();
}
function wireHome() {
  wireTopCards();
  view.querySelectorAll('[data-unit-subject]').forEach(b => b.addEventListener('click', async () => {
    state.unitSubject = b.dataset.unitSubject;
    rerenderHomeInPlace('unitCard');
    await ensureUnitPool(state.unitSubject).catch(() => {});
    rerenderHomeInPlace('unitCard');
  }));
  view.querySelectorAll('[data-unit]').forEach(b => b.addEventListener('click', () => { void startUnit(b.dataset.unit); }));
  byId('analysisBtn')?.addEventListener('click', () => { void buildAnalysis(); });
  wireAnalysis();
  byId('stageSelect')?.addEventListener('change', event => {
    state.stage = event.target.value;
    persist(() => {
      const latest = loadProgress();
      latest.stage = state.stage;
      saveProgress(latest);
    });
    renderHome('stageSelect');
  });
  byId('x4mGroup')?.addEventListener('toggle', event => { state.x4mOpen = event.currentTarget.open; });
  view.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => { void startPractice(btn.dataset.mode); }));
  view.querySelectorAll('[data-wrong-print]').forEach(btn => btn.addEventListener('click', () => { void openWrongPrintSheet(btn.dataset.wrongPrint); }));
  view.querySelectorAll('[data-drill]').forEach(btn => btn.addEventListener('click', () => {
    state.drillSubject = btn.dataset.drill;
    rerenderHomeInPlace('x4mGroup');
    view.querySelector(`[data-drill="${state.drillSubject}"]`)?.focus({ preventScroll: true });
  }));
  view.querySelectorAll('[data-weekly-subject]').forEach(btn => btn.addEventListener('click', async () => {
    state.weeklySubject = btn.dataset.weeklySubject;
    try { await buildWeekly(state.weeklySubject); } catch { /* 网络不好时仍可切换 */ }
    rerenderHomeInPlace('weeklyCard');
  }));
  view.querySelectorAll('[data-weekly]').forEach(btn => btn.addEventListener('click', () => { void runWeekly(btn.dataset.weekly); }));
  view.querySelectorAll('[data-national-open]').forEach(btn => btn.addEventListener('click', () => {
    void window.NationalExams.open({ subject: btn.dataset.nationalOpen, mode: btn.dataset.nationalMode });
  }));
  wireSubjectSections();
  byId('dailyBtn')?.addEventListener('click', () => beginPractice([dailyQuestion()], 'daily'));
  byId('dailyShare')?.addEventListener('click', event => { void shareDailyQuestion(event.currentTarget); });
  view.querySelectorAll('#openUnlock').forEach(btn => btn.addEventListener('click', () => openUnlock()));
  const searchInput = byId('searchBox');
  let searchComposing = false;
  const scheduleSearch = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { void doSearch(); }, 250);
  };
  searchInput.addEventListener('compositionstart', () => { searchComposing = true; });
  searchInput.addEventListener('compositionend', event => { searchComposing = false; state.keyword = event.target.value; scheduleSearch(); });
  searchInput.addEventListener('input', event => { state.keyword = event.target.value; if (!searchComposing && !event.isComposing) scheduleSearch(); });
  byId('searchSubject').addEventListener('change', event => { state.searchSubject = event.target.value; void doSearch(); });
  byId('searchOut').addEventListener('click', event => {
    const id = event.target.closest('button[data-qid]')?.dataset.qid;
    const q = id && ([...library].find(item => item.id === id) || (nationalSearchPool || []).find(item => item.id === id));
    if (q) beginPractice([q], 'single');
  });
  wirePrintKind();
  byId('printFold')?.addEventListener('toggle', e => { state.printOpen = e.currentTarget.open; });
  byId('headerSearch')?.addEventListener('click', () => {
    if (state.homeTab !== 'review') {
      state.homeTab = 'review';
      view.querySelectorAll('[data-home-tab][role="tab"]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.homeTab === 'review')));
      view.querySelectorAll('[data-tab-panel]').forEach(p => { p.hidden = p.dataset.tabPanel !== 'review'; });
    }
    byId('searchPanel')?.setAttribute('open', '');
  });
  byId('searchPanel')?.addEventListener('toggle', e => { state.searchOpen = e.currentTarget.open; });
  byId('expandUpdates')?.addEventListener('click', () => {
    state.allUpdatesOpen = true;
    const ol = byId('updateList');
    if (ol) ol.innerHTML = renderUpdateLogs(true);
  });
  void doSearch();
  showReferralProfile();
  if (!nationalCatalog && window.NationalExams?.catalog) {
    window.NationalExams.catalog().then(list => {
      nationalCatalog = list;
      if (byId('subjectSections')) renderHome();
      jumpToGoTarget();
    }).catch(() => {
      const box = byId('subjectSections');
      if (box) box.innerHTML = '<section class="card"><p class="muted">分科目录加载失败，刷新页面再试。</p></section>';
    });
  }
}
function wirePrintKind() {
  const kind = byId('printKind');
  const x4m = byId('printX4m');
  if (!kind) return;
  const syncPrint = () => { x4m.hidden = kind.value !== 'x4m'; if (!x4m.hidden) fillPrintChapters(); };
  kind.addEventListener('change', syncPrint);
  byId('printSubject').addEventListener('change', fillPrintChapters);
  byId('printPaper').addEventListener('click', () => { void printSelected(); });
  syncPrint();
}
async function doSearch() {
  const seq = ++searchSeq;
  const kw = state.keyword.trim().normalize('NFKC').toLowerCase();
  const status = byId('searchStatus');
  const out = byId('searchOut');
  if (!status || !out) return;
  if (!kw) { status.textContent = ''; out.replaceChildren(); return; }
  if (!banks && typeof startBanksBackgroundLoad === 'function') {
    status.textContent = '正在加载小四门题库…';
    await startBanksBackgroundLoad();
    if (seq !== searchSeq || byId('searchStatus') !== status) return;
  }
  const wantsNational = !state.searchSubject || MAIN_SUBJECTS.some(s => s.key === state.searchSubject);
  let natPool = [];
  if (wantsNational) {
    status.textContent = state.searchSubject ? '正在加载该科真题与模拟卷…' : '正在分批加载全部真题和模拟卷…';
    try {
      natPool = await ensureNationalSearch(state.searchSubject, (done, total) => {
        if (seq === searchSeq && byId('searchStatus') === status) {
          status.textContent = `正在加载真题与模拟卷（${done}/${total}）…`;
        }
      });
    } catch { /* 只搜本地题 */ }
    if (seq !== searchSeq || byId('searchStatus') !== status) return;
  }
  const textOf = q => [q.unit || '', q.chapter, q.stem, q.material || '', q.materialHtml ? htmlToText(q.materialHtml) : '', q.explanation || ''];
  const hits = [...(bankQuestions || []), ...(subjectiveQuestions || []), ...natPool].filter(q =>
    (!state.searchSubject || q.subject === state.searchSubject) &&
    textOf(q).some(text => String(text).normalize('NFKC').toLowerCase().includes(kw)));
  const progress = loadProgress();
  status.textContent = hits.length ? `找到 ${hits.length} 道${hits.length > 20 ? '，显示前 20 道' : ''}` : '没有找到相关题目。试试更短的关键词。';
  out.innerHTML = hits.slice(0, 20).map(q => `<article class="search-hit">
    <div>${subjectChip(q.subject, q.subjectLabel)} ${q.claude ? '<span class="chip">精编模拟卷</span> ' : isSubjective(q) && q.meta ? `<span class="chip">${esc(q.meta)}</span> ` : ''}${q.unit ? `<span class="chip">${esc(q.unit)}</span> ` : ''}<span class="muted">${esc(q.chapter)}</span><p>${esc(q.stem)}</p></div>
    <button class="btn" data-qid="${q.id}">${hasFullAccess() || isTrialQuestion(q) ? '做这道' : hasQuestionHistory(progress, q) ? '回顾' : '查看完整版'} ${icon('arrow-right')}</button>
  </article>`).join('');
}

async function startPractice(mode) {
  if (!banks && typeof startBanksBackgroundLoad === 'function') {
    toast('正在加载题库…');
    await startBanksBackgroundLoad();
  }
  const fullAccess = hasFullAccess();
  if (!fullAccess && FULL_ONLY_MODES.has(mode)) {
    openUnlock('这项练习属于完整版。');
    return;
  }
  const progress = loadProgress();
  const clear = fullAccess ? clearWrongList(library, progress) : [];
  const studyMode = ['all', 'random', 'random20', 'unfinished'].includes(mode);
  if (mode === 'clearWrong' || (studyMode && clear.length)) {
    if (!clear.length) { toast('今天的错题已经订正完了。'); return; }
    if (mode !== 'clearWrong') toast(`先订正 ${clear.length} 道错题，再继续练习。`);
    beginPractice(clear, 'clearWrong');
    return;
  }
  let queue;
  if (mode === 'essay' || mode === 'blank') {
    queue = subjectiveQueue(mode, progress);
    if (!queue.length) { toast('当前学期还没有这类题，换个科目或年级学期试试。'); return; }
    beginPractice(queue, mode);
    return;
  }
  if (mode === 'sunday') {
    queue = sundayMock(bankQuestions, progress);
  } else if (['wrong', 'due', 'favorite', 'everWrong'].includes(mode)) {
    queue = [...applyMode(library, mode, progress), ...await withNationalExtras(mode, progress)];
  } else {
    const base = availableQueue(progress);
    const stats = mode === 'random20' ? checkinStatus(library, progress, fullAccess) : null;
    const remaining = stats ? Math.max(0, stats.freshTarget - stats.freshDone) : undefined;
    if (remaining === 0) { renderHome(); toast('今日新题已完成。'); return; }
    queue = applyMode(base, mode, progress, remaining);
  }
  if (!queue.length) {
    if (!fullAccess && ['unfinished', 'random20'].includes(mode)) {
      trackVisit('trial_done');
      openUnlock('当前学期的体验新题已练完，可以换学期或开通完整版。');
      return;
    }
    const empty = {
      wrong: '错题本是空的。', favorite: '还没有收藏题目。', due: '今天没有到期的错题。',
      random20: '本档新题已做完，可切换学期继续。', unfinished: '本档题目已全部作答。', everWrong: '还没有做错过的题。',
    };
    toast(empty[mode] || '当前没有可练习的题目。');
    return;
  }
  beginPractice(queue, mode, mode === 'all' ? resumeIndex(queue, progress) : 0);
}
function beginPractice(queue, mode, index = 0) {
  const selected = queue[index];
  if (!selected) return;
  if (!hasFullAccess()) {
    const retryAllowed = mode === 'retry' && queue.length && queue.every(isTrialQuestion);
    if (FULL_ONLY_MODES.has(mode) && !retryAllowed) {
      openUnlock('这项练习属于完整版。');
      return;
    }
    const claimedPaper = queue.length && queue.every(q => q.paperId && freeOpen('phone', q.paperId));
    if (!claimedPaper && !['daily', 'wrong', 'weekly', 'paper', 'sync', 'earlybird', 'national'].includes(mode)) {
      const progress = loadProgress();
      const includesHistory = ['favorite', 'single', 'everWrong', 'due'].includes(mode);
      queue = queue.filter(q => isTrialQuestion(q) || (includesHistory && hasQuestionHistory(progress, q)));
    }
    if (!queue.length) {
      openUnlock('这些题目属于完整版。');
      return;
    }
  }
  state.mode = mode;
  state.queue = queue;
  state.idx = Math.max(0, queue.indexOf(selected));
  state.streakCorrect = 0;
  state.navOpen = false;
  state.clearPending = new Set(mode === 'clearWrong' ? queue.map(q => q.id) : []);
  state.clearTotal = state.clearPending.size;
  state.session = new Map();
  renderPractice();
}

function renderFigure(q) {
  if (!q.image) return;
  const wrap = byId('qfig');
  const src = typeof q.image === 'string' ? q.image : `./data/figures/${encodeURIComponent(q.id)}.jpg`;
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
const REVIEW_MODES = new Set(['wrong', 'due', 'everWrong', 'favorite', 'retry']);
function questionStats(progress) {
  if (state.mode === 'clearWrong') return `已订正 ${state.clearTotal - state.clearPending.size} / ${state.clearTotal} 道`;
  // 错题本、到期复习、曾错题、收藏、重练错题：队列里全是以前做错 / 做过的题，按历史算会一进来就显示“正确率 0%”，改成只算这一次
  if (REVIEW_MODES.has(state.mode)) {
    const done = [...state.session.values()];
    return done.length ? `这次已做 ${done.length} 道 · 做对 ${done.filter(r => r.correct).length} 道` : '';
  }
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
// ---- 整卷计时：手机上做整套早鸟卷、同步章节卷、精编卷、小升初卷时按考试时长倒计时 ----
// 时长在后台“整卷计时”里改（site_config.exam_minutes 的 x4m 部分），没设就用这里的默认值。
const X4M_MINUTES_DEFAULT = { sync: 90, eb_chinese: 120, eb_math: 120, eb_english: 100, eb_physics: 90, eb_chemistry: 60, eb_other: 60, paper_chinese: 150, paper_math: 120, paper_english: 120, paper_physics: 90, paper_chemistry: 60 };
let x4mMinutes = { ...X4M_MINUTES_DEFAULT };
const X4M_TIMER_KEY = 'x4m-exam-timer-v1';
const TIMED_MODES = new Set(['earlybird', 'sync', 'paper']);
function timedPaper() {
  if (!TIMED_MODES.has(state.mode) || !state.queue.length) return null;
  const id = state.queue[0]?.paperId;
  if (!id || !state.queue.every(q => q.paperId === id)) return null;
  const paper = (nationalCatalog || []).find(p => p.id === id);
  // 只给整套卷计时；前 5 题体验、只练一部分题时不计时
  return paper && state.queue.length >= paper.questionCount ? paper : null;
}
function paperMinutes(paper) {
  if (paper.sync || paper.stage === 'xsc') return x4mMinutes.sync;
  const main = ['chinese', 'math', 'english', 'physics', 'chemistry'].includes(paper.subject) ? paper.subject : '';
  const zhongkao = paper.claude || (paper.earlybird && (paper.stage || '9-down') === '9-down');
  if (!main) return x4mMinutes.eb_other;
  return zhongkao ? x4mMinutes['paper_' + main] : x4mMinutes['eb_' + main];
}
function loadX4mTimers() {
  try { return JSON.parse(localStorage.getItem(X4M_TIMER_KEY) || '{}') || {}; } catch { return {}; }
}
function saveX4mTimer(id, value) {
  const all = loadX4mTimers();
  if (value) all[id] = value; else delete all[id];
  try { localStorage.setItem(X4M_TIMER_KEY, JSON.stringify(all)); } catch { /* 隐私模式：本页内仍计时 */ }
}
function x4mElapsed(t) { return (t.elapsed || 0) + (t.runningSince ? Date.now() - t.runningSince : 0); }
function clockText(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return `${h ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
}
function x4mTimerText(t, limitMs) {
  const used = x4mElapsed(t);
  if (t.doneAt) return `✅ 用时 ${clockText(used)}（考试时长 ${Math.round(limitMs / 60000)} 分钟）${used > limitMs ? `，超时 ${clockText(used - limitMs)}` : '，没超时'}`;
  const left = limitMs - used;
  const head = t.runningSince ? '⏱' : '⏸ 已暂停 ·';
  return left >= 0 ? `${head} 还剩 ${clockText(left)}` : `${head} 已超时 ${clockText(-left)}`;
}
function examTimerHTML() {
  const paper = timedPaper();
  if (!paper) return '';
  const minutes = paperMinutes(paper);
  const limitMs = minutes * 60000;
  const t = loadX4mTimers()[paper.id];
  if (!t) return `<div class="exam-timer idle"><span>⏱ 想按考试来练？${minutes} 分钟</span><button class="btn" type="button" data-timer="start">开始计时</button></div>`;
  const cls = t.doneAt ? 'done' : x4mElapsed(t) > limitMs ? 'over' : t.runningSince ? 'running' : 'paused';
  return `<div class="exam-timer ${cls}" data-limit="${limitMs}" data-paper="${esc(paper.id)}">
    <span id="examTimerText" role="timer">${esc(x4mTimerText(t, limitMs))}</span>
    <span class="exam-timer-actions">${t.doneAt ? '' : t.runningSince ? '<button class="btn" type="button" data-timer="pause">暂停</button>' : '<button class="btn primary" type="button" data-timer="resume">继续</button>'}<button class="btn text-button" type="button" data-timer="reset">重新计时</button></span>
  </div>`;
}
function wireExamTimer() {
  view.querySelectorAll('[data-timer]').forEach(b => b.addEventListener('click', () => {
    const paper = timedPaper();
    if (!paper) return;
    const t = loadX4mTimers()[paper.id];
    const act = b.dataset.timer;
    if (act === 'start' || act === 'resume') { saveX4mTimer(paper.id, { elapsed: t ? x4mElapsed(t) : 0, runningSince: Date.now() }); if (act === 'start') trackVisit('x4m_timer_start'); }
    if (act === 'pause' && t) saveX4mTimer(paper.id, { elapsed: x4mElapsed(t), runningSince: 0 });
    if (act === 'reset' && window.confirm('重新计时会清掉这套卷的用时（做题记录不受影响），确定吗？')) saveX4mTimer(paper.id, null);
    const box = b.closest('.exam-timer');
    if (box) box.outerHTML = examTimerHTML();
    wireExamTimer();
  }));
}
// 做完一套（出总结）时停表，总结里显示用时
function stopExamTimer() {
  const paper = timedPaper();
  if (!paper) return '';
  const t = loadX4mTimers()[paper.id];
  if (!t) return '';
  let done = t;
  if (!t.doneAt) { done = { elapsed: x4mElapsed(t), runningSince: 0, doneAt: Date.now() }; saveX4mTimer(paper.id, done); trackVisit('x4m_timer_done'); }
  const limitMs = paperMinutes(paper) * 60000;
  return `<p class="exam-timer-result">${esc(x4mTimerText(done, limitMs))}</p>`;
}
if (typeof setInterval === 'function') setInterval(() => {
  const el = document.getElementById('examTimerText');
  const box = el?.closest('.exam-timer');
  if (!box) return;
  const t = loadX4mTimers()[box.dataset.paper];
  if (!t || t.doneAt || !t.runningSince) return;
  const limitMs = Number(box.dataset.limit || 0);
  el.textContent = x4mTimerText(t, limitMs);
  if (x4mElapsed(t) > limitMs && !box.classList.contains('over')) { box.classList.remove('running'); box.classList.add('over'); }
}, 1000);
// 练习页外壳：进度、科目/题型、材料、题干、配图、作答区、结果区、操作按钮、答题卡。
function practiceShellHTML(q, progress, { title, body = '', submitLabel = '提交答案', submitDisabled = true, revealLabel = '查看解析' }) {
  const rec = qProgress(progress, q.id);
  const clearing = state.mode === 'clearWrong';
  const total = state.queue.length;
  const position = state.idx + 1;
  const typeLabel = q.section || (q.type === 'essay' ? q.meta : (TYPE_LABEL[q.type] || '选择题'));
  const studyMode = ['all', 'random', 'random20', 'unfinished', 'essay', 'blank'].includes(state.mode);
  return `
    <div class="practice-shell tone-${esc(q.subject)}">
      <div class="practice-top"><button class="btn text-button" id="backBtn">${icon('arrow-left')} ${state.mode === 'national' ? '返回全国真题' : state.mode === 'knowledge' ? '返回知识点' : '返回首页'}</button><span>${esc(state.mode === 'earlybird' && String(state.earlybirdPaper || '').startsWith('xsc-') ? '小升初衔接' : MODE_LABEL[state.mode] || '')}${studyMode ? ' · ' + STAGE_MAP[state.stage].label : ''}</span></div>
      ${examTimerHTML()}
      <section class="card question-card" aria-labelledby="questionTitle">
        <div class="question-progress">
          <div class="progress-label"><strong>${clearing ? '订正进度' : `第 ${position} <span>/ ${total} 题</span>`}</strong><span id="qProg">${questionStats(progress)}</span></div>
          ${clearing ? meter(state.clearTotal - state.clearPending.size, state.clearTotal, '错题订正进度') : meter(position, total, `第 ${position} 题，共 ${total} 题`)}
        </div>
        <div class="question-meta">${subjectChip(q.subject, q.subjectLabel)}<span class="chip type-chip">${esc(typeLabel)}</span>${q.type === 'essay' ? `<span class="chip score-chip">${q.score} 分</span>` : ''}${/中考/.test(q.source || '') && isSubjective(q) ? '<span class="chip real-chip">中考真题</span>' : ''}<span class="chapter-tag">${esc(q.chapter)}</span></div>
        ${q.material ? `<div class="material">${isSubjective(q) ? `<p class="material-label">材料</p>${materialHTML(q.material)}` : expParas(q.material)}</div>` : ''}
        ${title}
        ${q.image ? '<div id="qfig"></div>' : ''}
        ${body}
        <div id="result" tabindex="-1"></div>
        <div class="question-actions">
          <div class="question-tools">
            <button class="btn text-button" id="revealBtn">${icon('eye')} ${revealLabel}</button>
            <button class="btn text-button" id="favBtn" aria-pressed="${!!rec?.favorite}">${icon('bookmark')} ${rec?.favorite ? '已收藏' : '收藏'}</button>
          </div>
          <div class="question-flow">
            <button class="btn primary" id="submitBtn" ${submitDisabled ? 'disabled' : ''}>${submitLabel}</button>
            <button class="btn" id="nextBtn" ${clearing || total === 1 ? 'hidden' : ''}>${position < total ? '跳过' : '结束练习'} ${icon('arrow-right')}</button>
          </div>
        </div>
      </section>
      ${!clearing && total > 1 ? `<details class="card navbox" id="navBox" ${state.navOpen ? 'open' : ''}><summary>答题卡 <span class="muted">${total} 道</span></summary><div id="qNav"></div></details>` : ''}
    </div>`;
}
// 外壳里通用按钮的事件；返回结束作答后切换按钮状态的函数。
function returnFromPractice() {
  if (state.mode === 'national') { void window.NationalExams.open(); return; }
  if (state.mode === 'knowledge') { void window.KnowledgeHub.open(); return; }
  renderHome('homeTitle');
}

function wireShell(q) {
  const submit = byId('submitBtn');
  const reveal = byId('revealBtn');
  const next = byId('nextBtn');
  byId('backBtn').addEventListener('click', returnFromPractice);
  byId('favBtn').addEventListener('click', event => {
    const favorited = persist(() => toggleFavorite(q.id));
    if (favorited === undefined) return;
    event.currentTarget.innerHTML = `${icon('bookmark')} ${favorited ? '已收藏' : '收藏'}`;
    event.currentTarget.setAttribute('aria-pressed', String(favorited));
  });
  next.addEventListener('click', () => {
    if (state.idx < state.queue.length - 1) goToQuestion(state.idx + 1);
    else finishPractice();
  });
  const nav = byId('navBox');
  if (nav) {
    nav.addEventListener('toggle', () => {
      state.navOpen = nav.open;
      if (nav.open && !byId('qNav').childElementCount) renderAnswerSheet();
    });
  }
  if (q.image) renderFigure(q);
  state.keys = { submit, next, options: [] };
  return function finishUI() {
    const result = byId('result');
    byId('qProg').textContent = questionStats(loadProgress());
    if (state.mode === 'clearWrong') view.querySelector('.question-progress progress').value = state.clearTotal - state.clearPending.size;
    submit.hidden = true;
    reveal.hidden = true;
    if (state.keys) state.keys.submit = null;
    next.hidden = false;
    next.classList.add('primary');
    next.innerHTML = `${state.idx < state.queue.length - 1 ? '下一题' : '完成练习'} ${icon('arrow-right')}`;
    if (byId('navBox')?.open) renderAnswerSheet();
    const resultTop = result.getBoundingClientRect().top;
    result.focus({ preventScroll: true });
    if (resultTop > window.innerHeight - 120) result.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
}
function sourceHTML(q) {
  return `${q.source ? `<details class="source-details"><summary>题目来源</summary><p>${esc(q.source)}</p></details>` : ''}
    ${q.verify === 'unverified-answer-page' ? '<p class="result-note">此题答案按教材核对，原卷答案页待核。</p>' : ''}`;
}
// 作答后的公共记账：积分提示、订正队列、本组小结。
function afterAnswer(q, correct, res, extra = {}) {
  if (state.mode === 'daily' && !state.session.has(q.id)) {
    trackVisit('daily_answer');
    if (correct) trackVisit('daily_correct');
  }
  const clearing = state.mode === 'clearWrong';
  state.session.set(q.id, { correct, ...extra });
  state.streakCorrect = correct ? state.streakCorrect + 1 : 0;
  if (clearing && !correct) {
    state.queue.push(q);
    toast('这道题已放回队尾，稍后再做一次。');
  } else if (clearing && state.clearPending.delete(q.id) && !state.clearPending.size) {
    toast('错题订正完成。');
  } else if (correct && state.streakCorrect % 5 === 0) {
    toast(`连续答对 ${state.streakCorrect} 题${hasFullAccess() && res.points ? ` · +${res.points} 分` : ''}`);
  } else if (hasFullAccess() && res.points > 0) {
    toast(`+${res.points} 分`);
  }
  refreshStreak();
}
function answerOptions(q) {
  return { mode: state.mode, stage: state.stage, nextId: state.queue[state.idx + 1]?.id };
}
function onReveal(q) {
  persist(() => recordReveal(q.id));
  if (state.mode === 'clearWrong') {
    state.queue.push(q);
    toast('看过解析后，这道题会在队尾再出现。');
  }
}

function renderSavedQuestion(q) {
  state.keys = null;
  const hasNext = state.idx + 1 < state.queue.length;
  view.innerHTML = `
    <div class="practice-shell tone-${esc(q.subject)}">
      <div class="practice-top"><button class="btn text-button" id="savedHome">${icon('arrow-left')} 返回首页</button><span>已做题回顾</span></div>
      <section class="card question-card" aria-labelledby="questionTitle">
        <div class="question-meta">${subjectChip(q.subject, q.subjectLabel)}<span class="chapter-tag">${esc(q.chapter)}</span></div>
        ${q.material ? `<div class="material">${materialHTML(q.material)}</div>` : ''}
        <h1 class="stem-title" id="questionTitle" tabindex="-1">${esc(q.stem)}</h1>
        ${q.image ? '<div id="qfig"></div>' : ''}
        ${q.options?.length ? `<ol class="saved-options">${q.options.map(option => `<li>${esc(option.key)}. ${esc(option.text)}</li>`).join('')}</ol>` : ''}
        <p><strong>参考答案</strong> ${esc(displayAnswer(q))}</p>
        ${q.explanation ? `<div class="saved-explanation">${expParas(q.explanation)}</div>` : ''}
        ${sourceHTML(q)}
        <div class="dialog-actions">
          ${hasNext ? '<button class="btn" id="savedNext">看下一题</button>' : ''}
          <button class="btn" id="savedAccess">解锁错题复习</button>
        </div>
      </section>
    </div>`;
  byId('savedHome').addEventListener('click', returnFromPractice);
  byId('savedNext')?.addEventListener('click', () => goToQuestion(state.idx + 1));
  byId('savedAccess').addEventListener('click', () => openUnlock('自动复习与订正错题属于完整版。'));
  if (q.image) renderFigure(q);
  moveFocus(byId('questionTitle'), true);
}

function renderPractice() {
  const q = state.queue[state.idx];
  if (!q) { renderHome('homeTitle'); return; }
  document.body.classList.add('practice');
  byId('headerSearch').hidden = true;
  refreshStreak();
  const retryAllowed = state.mode === 'retry' && isTrialQuestion(q);
  if (!hasFullAccess() && state.mode !== 'daily' &&
      (state.mode === 'wrong' || (FULL_ONLY_MODES.has(state.mode) && !retryAllowed) || !isTrialQuestion(q))) {
    if (hasQuestionHistory(loadProgress(), q)) return renderSavedQuestion(q);
    renderHome('homeTitle');
    openUnlock('这项练习属于完整版。');
    return;
  }
  if (q.type === 'essay') renderEssay(q);
  else if (q.type === 'blank') renderBlank(q);
  else renderChoice(q);
  wireExamTimer();
}

function renderChoice(q) {
  const progress = loadProgress();
  const type = TYPE_LABEL[q.type] || '选择题';
  const required = q.type === 'multiple' ? 2 : 1;
  const maximum = q.type === 'multiple' ? q.maxSelections || 4 : 1;
  const choices = q.type === 'judge' ? [{ key: 'true', text: '正确' }, { key: 'false', text: '错误' }] : q.options;
  let selected = [];
  let finished = false;
  view.innerHTML = practiceShellHTML(q, progress, {
    title: `<h1 id="questionTitle" tabindex="-1"${q.national ? ' class="national-stem"' : ''}>${q.national && q.originalHtml ? '原题练习 · 第 ' + q.number + ' 题' : esc(q.stem)}</h1>`,
    body: `${q.materialHtml ? `<div class="national-reading">${q.materialHtml}</div>` : ''}${q.originalHtml ? `<div class="national-source">${q.originalHtml}</div>` : ''}
      ${q.type === 'multiple' ? `<p class="muted selection-hint">请选择 ${required}–${maximum} 项后提交。</p>` : ''}
      <div class="options" role="group" aria-label="${type}选项">
        ${choices.map((o, i) => `<button class="opt" type="button" data-choice="${i}" aria-pressed="false">
          ${q.type === 'judge' ? `<span class="opt-key">${o.key === 'true' ? '✓' : '✗'}</span>` : `<span class="opt-key">${esc(o.key)}</span>`}<span class="opt-text">${esc(o.text)}</span><span class="opt-status"></span>
        </button>`).join('')}
      </div>`,
  });
  const finishUI = wireShell(q);
  if (q.national) focusGap(q);
  const optionButtons = [...view.querySelectorAll('[data-choice]')];
  const submit = byId('submitBtn');
  state.keys.options = optionButtons;
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
    byId('result').innerHTML = `<div class="result-panel ${tone}">
      <p class="result-title"><strong>${verdict}</strong><span>正确答案 <b>${esc(displayAnswer(q))}</b></span></p>
      <div class="exp-body">${expParas(q.explanation)}</div>
      ${q.trap ? `<p class="result-note">易错点 · ${esc(q.trap.replace(/^易错点[：:]\s*/, ''))}</p>` : ''}
      ${sourceHTML(q)}
    </div>`;
    finishUI();
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
  byId('revealBtn').addEventListener('click', () => {
    if (finished) return;
    onReveal(q);
    showResult(null);
  });
  submit.addEventListener('click', () => {
    if (finished || selected.length < required) return;
    const correct = isSameSet(selected, q.answer);
    const res = persist(() => recordAnswer(q, selected, correct, answerOptions(q)));
    if (!res) return;
    afterAnswer(q, correct, res);
    showResult(correct);
  });
  moveFocus(byId('questionTitle'), true);
}

function renderBlank(q) {
  const progress = loadProgress();
  // 题干里的空用 4 个及以上下划线表示（全国卷、同步卷、小升初卷用 8 个），连续的下划线只算一个空
  // 试卷题干开头的“第 11 题：”是给打印用的，手机上已经有“第 11 / 21 题”，去掉不重复
  const parts = (q.national ? q.stem.replace(/^第\s*\d+\s*题[：:]\s*/, '') : q.stem).split(/_{4,}/);
  const width = (alts = ['']) => Math.min(14, Math.max(4, ...alts.map(a => a.length + 2)));
  const stemHTML = parts.map((part, i) => esc(part) + (i < parts.length - 1
    ? `<span class="blank-slot"><span class="blank-no" aria-hidden="true">${i + 1}</span><input class="blank-input" data-blank="${i}" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="${i < parts.length - 2 ? 'next' : 'done'}" aria-label="第 ${i + 1} 空" style="--w:${width(q.blanks[i])}em"></span>`
    : '')).join('');
  let finished = false;
  view.innerHTML = practiceShellHTML(q, progress, {
    title: `<h1 id="questionTitle" class="blank-stem${q.national ? ' national-blank' : ''}" tabindex="-1">${stemHTML}</h1>`,
    body: `${q.materialHtml ? `<div class="national-reading">${q.materialHtml}</div>` : ''}<p class="muted selection-hint">在横线处填写答案，回车跳到下一空；同义写法也能判对。</p>`,
    submitDisabled: false, revealLabel: '看答案',
  });
  const finishUI = wireShell(q);
  if (q.national) focusGap(q);
  const inputs = [...view.querySelectorAll('.blank-input')];
  const submit = byId('submitBtn');
  function showResult(correct, marks) {
    finished = true;
    inputs.forEach((input, i) => {
      input.readOnly = true;
      if (marks) input.classList.add(marks[i] ? 'right' : 'wrong');
    });
    const preview = correct === null;
    const verdict = preview ? '参考答案' : correct ? '全部填对' : `填对 ${marks.filter(Boolean).length} / ${marks.length} 空`;
    const tone = preview ? 'preview' : correct ? 'correct' : 'incorrect';
    byId('result').innerHTML = `<div class="result-panel ${tone}">
      <p class="result-title"><strong>${verdict}</strong></p>
      <ol class="blank-answers">${q.blanks.map((alts, i) => `<li><b>${esc(alts[0])}</b>${alts.length > 1 ? `<span class="muted">（也可写：${esc(alts.slice(1).join('、'))}）</span>` : ''}${marks && !marks[i] ? `<span class="your">你填：${esc(inputs[i].value || '未填')}</span>` : ''}</li>`).join('')}</ol>
      <div class="exp-body">${expParas(q.explanation)}</div>
      ${sourceHTML(q)}
    </div>`;
    finishUI();
  }
  inputs.forEach((input, i) => input.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    if (finished) { byId('nextBtn').click(); return; }
    if (inputs[i + 1]) inputs[i + 1].focus();
    else submit.click();
  }));
  byId('revealBtn').addEventListener('click', () => {
    if (finished) return;
    onReveal(q);
    showResult(null);
  });
  submit.addEventListener('click', () => {
    if (finished) return;
    if (!inputs.some(input => input.value.trim())) { toast('先填写答案，或点「看答案」。'); inputs[0].focus(); return; }
    const marks = inputs.map((input, i) => blankMatches(input.value, q.blanks[i]));
    const correct = marks.every(Boolean);
    const res = persist(() => recordAnswer(q, inputs.map(input => input.value.trim()), correct, answerOptions(q)));
    if (!res) return;
    afterAnswer(q, correct, res);
    showResult(correct, marks);
  });
  window.scrollTo(0, 0);
  inputs[0].focus({ preventScroll: true });
}

// 英语作文按单词数计，其他科按字数。
function essayLength(q, text) {
  const value = String(text || '').trim();
  return q.subject === 'english' ? `${value ? value.split(/\s+/).length : 0} 词` : `${value.length} 字`;
}
// 完形、短文填空：把当前这一空标出来并滚到它的位置。
function focusGap(q) {
  const box = view.querySelector('.national-reading');
  const gap = [...(box?.querySelectorAll('.gap') || [])].find(el => el.textContent.trim() === String(q.number));
  if (!gap) return;
  gap.classList.add('current');
  box.scrollTop = Math.max(0, gap.offsetTop - box.offsetTop - box.clientHeight / 3);
}
function renderEssay(q) {
  const progress = loadProgress();
  const draftKey = 'xiaosimen-draft-' + q.id;
  let draft = '';
  try { draft = sessionStorage.getItem(draftKey) || ''; } catch { /* 无存储权限时不保存草稿 */ }
  const tip = q.method || METHOD_TIPS[q.meta] || METHOD_TIPS['简答题'];
  let finished = false;
  view.innerHTML = practiceShellHTML(q, progress, {
    title: `<h1 id="questionTitle" tabindex="-1"${q.national ? ' class="national-stem"' : ''}>${esc(q.stem)}</h1>`,
    body: `${q.materialHtml ? `<div class="national-reading">${q.materialHtml}</div>` : ''}<div class="essay-box">
        <details class="method-tip"><summary>${icon('lightbulb')} 答题思路</summary><p>${esc(tip)}</p></details>
        <label class="essay-label" for="essayInput">${icon('pen-line')} 我的答案</label>
        <textarea id="essayInput" rows="7" placeholder="分点作答，例如：&#10;① ……&#10;② ……&#10;也可以先写在本子上，写完直接点「对照得分点」。">${esc(draft)}</textarea>
        <div class="essay-meta"><span id="essayCount">${essayLength(q, draft)}</span><span>满分 ${q.score} 分 · ${q.points.length} 个得分点</span></div>
      </div>
      <div id="scoring"></div>`,
    submitLabel: `${icon('list-checks')} 对照得分点`, submitDisabled: false, revealLabel: '直接看参考答案',
  });
  const finishUI = wireShell(q);
  if (q.national) focusGap(q);
  const input = byId('essayInput');
  const submit = byId('submitBtn');
  const reveal = byId('revealBtn');
  input.addEventListener('input', () => {
    byId('essayCount').textContent = essayLength(q, input.value);
    try { sessionStorage.setItem(draftKey, input.value); } catch { /* 忽略 */ }
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submit.click(); }
  });
  function referenceHTML(checked) {
    return `<div class="ref-block">
        <p class="ref-title">得分点（满分 ${q.score} 分）</p>
        <ol class="point-ref">${q.points.map((p, i) => `<li class="${checked ? (checked[i] ? 'got' : 'miss') : ''}"><span>${esc(p.text)}</span><b>${p.score} 分</b></li>`).join('')}</ol>
      </div>
      ${q.sample ? `<details class="ref-sample" open><summary>参考示例</summary>${materialHTML(q.sample)}</details>` : ''}
      ${q.explanation ? `<div class="exp-body">${expParas(q.explanation)}</div>` : ''}
      ${sourceHTML(q)}`;
  }
  function showResult(score, checked) {
    finished = true;
    input.readOnly = true;
    const preview = score === null;
    const pass = !preview && score / q.score >= ESSAY_PASS;
    const tone = preview ? 'preview' : pass ? 'correct' : 'incorrect';
    const verdict = preview ? '参考答案' : `自评 ${score} / ${q.score} 分 · ${pass ? '过关' : '未过关，已加入错题本'}`;
    byId('scoring').replaceChildren();
    byId('result').innerHTML = `<div class="result-panel ${tone}">
      <p class="result-title"><strong>${verdict}</strong>${preview ? '' : `<span>得分率 ${Math.round(score / q.score * 100)}%</span>`}</p>
      ${referenceHTML(checked)}
    </div>`;
    finishUI();
  }
  reveal.addEventListener('click', () => {
    if (finished) return;
    onReveal(q);
    byId('scoring').replaceChildren();
    showResult(null);
  });
  submit.addEventListener('click', () => {
    if (finished) return;
    const hits = essayHits(q, input.value);
    const written = input.value.trim().length > 0;
    submit.hidden = true;
    reveal.hidden = true;
    input.readOnly = true;
    const scoring = byId('scoring');
    scoring.innerHTML = `<div class="score-panel">
        <p class="score-head"><strong>${icon('list-checks')} 对照得分点，给自己打分</strong>
          <span class="muted">${written ? '已按关键词预先勾选，请对照意思如实调整。' : '对照你写在本子上的答案，勾选答到的要点。'}</span></p>
        <ul class="point-list">${q.points.map((p, i) => `<li><label class="point-item">
          <input type="checkbox" data-point="${i}" ${hits[i] ? 'checked' : ''}>
          <span class="point-text">${esc(p.text)}${hits[i] ? '<em>关键词命中</em>' : ''}</span>
          <span class="point-score">${p.score} 分</span></label></li>`).join('')}</ul>
        <div class="score-foot"><span class="score-total">自评 <b id="selfScore">0</b> / ${q.score} 分</span>
          <button class="btn primary" id="confirmScore" type="button">${icon('check')} 确认得分</button></div>
      </div>`;
    const boxes = [...scoring.querySelectorAll('[data-point]')];
    const total = () => boxes.reduce((sum, box, i) => sum + (box.checked ? q.points[i].score : 0), 0);
    const update = () => { byId('selfScore').textContent = total(); };
    boxes.forEach(box => box.addEventListener('change', update));
    update();
    state.keys.submit = byId('confirmScore');
    byId('confirmScore').addEventListener('click', () => {
      if (finished) return;
      const score = total();
      const checked = boxes.map(box => box.checked);
      const correct = score / q.score >= ESSAY_PASS;
      const res = persist(() => recordAnswer(q, checked.flatMap((c, i) => c ? [String(i)] : []), correct, {
        ...answerOptions(q), extra: { score, total: q.score },
      }));
      if (!res) return;
      try { sessionStorage.removeItem(draftKey); } catch { /* 忽略 */ }
      afterAnswer(q, correct, res, { score, total: q.score });
      showResult(score, checked);
    });
    scoring.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    boxes[0]?.focus({ preventScroll: true });
  });
  moveFocus(byId('questionTitle'), true);
}

// 一组题做完：给出本组小结（正确率、主观题得分、错题重练）。
function isTrialSliceSession() {
  if (hasFullAccess() || !['paper', 'sync', 'national'].includes(state.mode)) return false;
  const paper = (nationalCatalog || []).find(p => p.id === state.queue[0]?.paperId);
  return Boolean(paper && state.queue.length && state.queue.length < paper.questionCount);
}
function finishPractice() {
  keepPosition(null);
  if (state.queue.length < 2 || (!state.session.size && !isTrialSliceSession())) { renderHome('homeTitle'); return; }
  renderSummary();
}
// 试做完一套卷的前 5 题：告诉家长这套还有多少题、完整版包含什么（不夸大、不制造焦虑）
function trialUpsellHTML() {
  if (hasFullAccess() || !['paper', 'sync', 'national'].includes(state.mode)) return '';
  const paperId = state.queue[0]?.paperId;
  const paper = (nationalCatalog || []).find(p => p.id === paperId);
  if (!paper || !state.queue.length || state.queue.length >= paper.questionCount) return '';
  const rest = paper.questionCount - state.queue.length;
  return `<div class="trial-upsell"><p><b>这套卷还有 ${rest} 题</b>（含压轴解答题与逐题解析）在完整版里。</p>
    <p class="muted">完整版 ¥19.9 一次买断（分享可省 5 元）：71 套同步章节卷、全国真题、精编模拟卷整卷做与打印、3 台设备共用、错题按 1/3/7/14 天自动复习，后续新卷免费更新。</p>
    <button class="btn primary" type="button" id="upsellBtn">解锁完整版（¥19.9）</button></div>`;
}
// 早鸟卷做完：按错题所在章节，直接给出那一章的同步章节卷（错得多的章排前面，最多 3 章）
// 早鸟卷里跨学期合并的考点模块，对应到同步卷的章节
const RX_UNIT_ALIAS = { '轴对称与旋转（八上·九上）': ['八上·轴对称', '九上·旋转'], '统计与概率（综合）': ['八下·数据的分析', '九上·概率初步'] };
function syncPrescriptions(wrongQs, subject, stage) {
  const counts = new Map();
  for (const q of wrongQs) if (q.unit) counts.set(q.unit, (counts.get(q.unit) || 0) + 1);
  // 只推荐这个学期及以前学过的章节
  const all = (nationalCatalog || []).filter(p => p.sync && p.subject === subject && stageOrder(p.stage) <= stageOrder(stage));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([unit, n]) => {
      const units = RX_UNIT_ALIAS[unit] || [unit];
      return { unit: RX_UNIT_ALIAS[unit] ? unit.replace(/（.*）$/, '') : unit, n, papers: all.filter(p => units.includes(p.unit)).sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage) || (a.order || 0) - (b.order || 0)) };
    })
    .filter(x => x.papers.length)
    .slice(0, 3);
}

// ---- 成绩单 / 诊断单一键晒图裂变海报（复用 ./qrcode.js，已付费老客自动带专属邀请码） ----
function loadQrLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = './qrcode.js';
    s.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error('qr')));
    s.onerror = () => reject(new Error('qr'));
    document.head.appendChild(s);
  });
}
async function openScorePoster({ title, metric, metricSub, verdict, focusLine }) {
  try {
    const qrFactory = await loadQrLib();
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('from', 'score-poster');
    const inviteCode = byId('referralPanel')?.querySelector('[data-ref-code]')?.textContent?.trim()
      || (document.querySelector('#referralPanel code')?.textContent?.trim() || '');
    if (/^ALIX-[A-Z0-9]{8}$/i.test(inviteCode)) url.searchParams.set('invite', inviteCode.toUpperCase());

    const W = 750, H = 980;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, W, 380);
    grad.addColorStop(0, '#0e352a'); grad.addColorStop(1, '#164e3f');
    ctx.fillStyle = '#f4f2e8'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 390);
    ctx.fillStyle = '#b83b2a'; ctx.fillRect(0, 390, W, 6);

    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = '600 26px system-ui, -apple-system, sans-serif';
    ctx.fillText('爱丽克丝中考题库 · 练习成绩单', 52, 74);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '22px system-ui, -apple-system, sans-serif';
    ctx.fillText(todayStr(), W - 185, 74);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px system-ui, -apple-system, sans-serif';
    ctx.fillText(String(title || '中考同步自测').slice(0, 20), 52, 138);

    ctx.font = '800 96px system-ui, -apple-system, sans-serif';
    ctx.fillText(String(metric || ''), 52, 265);
    ctx.font = '500 26px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(String(metricSub || ''), 52, 320);

    ctx.fillStyle = '#fcfbf6';
    ctx.fillRect(42, 424, W - 84, 236);
    ctx.strokeStyle = '#dcd9cc'; ctx.lineWidth = 2;
    ctx.strokeRect(42, 424, W - 84, 236);

    ctx.fillStyle = '#1a2420';
    ctx.font = '700 28px Georgia, "Songti SC", serif';
    ctx.fillText(String(verdict || '继续加油，把错题过一遍就更稳！').slice(0, 22), 72, 482);
    ctx.fillStyle = '#37413c';
    ctx.font = '24px system-ui, -apple-system, sans-serif';
    const focus = String(focusLine || '错题已自动收录进错题本，按 1、3、7、14 天提醒复习。');
    ctx.fillText(focus.slice(0, 26), 72, 540);
    if (focus.length > 26) ctx.fillText(focus.slice(26, 52), 72, 580);
    ctx.fillStyle = '#b83b2a';
    ctx.font = '600 22px system-ui, -apple-system, sans-serif';
    ctx.fillText('作者亲测 · 七上到九下同步卷与全国中考真题 · 手机做 & 可打印', 72, 632);

    // 二维码区域
    const qr = qrFactory(0, 'M');
    qr.addData(url.href); qr.make();
    const count = qr.getModuleCount();
    const qrSize = 188, cell = qrSize / count, qx = 64, qy = 716;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(qx - 10, qy - 10, qrSize + 20, qrSize + 20);
    ctx.fillStyle = '#0f172a';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(qx + c * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 28px system-ui, -apple-system, sans-serif';
    ctx.fillText('长按识别二维码，免费试做同款试卷', 282, 778);
    ctx.fillStyle = '#475569';
    ctx.font = '22px system-ui, -apple-system, sans-serif';
    ctx.fillText('每个家庭免费送 1 套手机整卷 + 1 次整卷打印', 282, 826);
    ctx.fillText('网址：x4m.cc.cd', 282, 868);

    const dataUrl = canvas.toDataURL('image/png');
    trackVisit('score_poster');
    const overlay = document.createElement('div');
    overlay.className = 'share-poster-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML = `<div class="share-poster-card" style="background:#fff;border-radius:14px;padding:14px;max-width:380px;width:100%;text-align:center;">
      <p style="margin:0 0 8px;font-size:14px;color:#334155;">长按图片保存，可直接发朋友圈或家长群</p>
      <img src="${dataUrl}" alt="练习成绩单海报" style="width:100%;border-radius:8px;display:block;border:1px solid #e2e8f0;">
      <div style="display:flex;gap:8px;justify-content:center;margin-top:10px;">
        <a class="btn primary" href="${dataUrl}" download="xiaosimen-score-${todayStr()}.png">保存图片</a>
        <button class="btn" type="button" data-close-poster>关闭</button>
      </div>
    </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('[data-close-poster]')) overlay.remove(); });
    document.body.appendChild(overlay);
  } catch {
    toast('成绩单海报生成失败，请稍后重试。');
  }
}

function renderSummary() {
  document.body.classList.add('practice');
  const timerLine = stopExamTimer();
  const results = [...state.session.entries()];
  const right = results.filter(([, r]) => r.correct).length;
  const essays = results.filter(([, r]) => r.total);
  const essayScore = essays.reduce((s, [, r]) => s + r.score, 0);
  const essayTotal = essays.reduce((s, [, r]) => s + r.total, 0);
  const wrongQs = dedupeById(results.filter(([, r]) => !r.correct).map(([id]) => state.queue.find(q => q.id === id) || library.find(q => q.id === id)).filter(Boolean));
  const acc = results.length ? Math.round(right / results.length * 100) : 0;
  if (state.mode === 'earlybird') {
    const score = earlybirdScore(results);
    const paperForVerdict = (nationalCatalog || []).find(p => p.id === state.earlybirdPaper);
    const [head, body] = earlybirdVerdict(score, paperForVerdict);
    const paperId = state.earlybirdPaper;
    const paper = (nationalCatalog || []).find(p => p.id === paperId);
    const finished = paper && results.length >= paper.questionCount;
    const rx = paper && paper.stage !== 'xsc' ? syncPrescriptions(wrongQs, paper.subject, paper.stage) : [];
    if (finished && paperId) {
      const first = loadEarlybirdScores()[paperId] == null;
      saveEarlybirdScore(paperId, score);
      const isXsc = paper?.stage === 'xsc';
      if (first) { trackVisit(isXsc ? 'xsc_done' : 'earlybird_done'); if (score >= 75) trackVisit(isXsc ? 'xsc_75' : 'earlybird_75'); }
    }
    view.innerHTML = `
    <div class="practice-shell">
      <section class="card summary-card earlybird-summary" aria-labelledby="summaryTitle">
        <span class="summary-icon">${icon('trophy')}</span>
        <p class="summary-kicker">${esc(paper?.title || '早鸟自测')}</p>
        <h1 id="summaryTitle" tabindex="-1">${esc(head)}</h1>
        <div class="summary-stats">
          <div><b>${score}<small>/100</small></b><span>${finished ? '总分' : `已做 ${results.length} 题的得分`}</span></div>
          <div><b>${right}</b><span>客观题答对</span></div>
          ${essayTotal ? `<div><b>${essayScore}<small>/${essayTotal}</small></b><span>主观题自评</span></div>` : ''}
        </div>
        <p class="earlybird-verdict">${esc(body)}</p>
        ${timerLine}
        ${wrongQs.length ? `<div class="summary-wrong"><p class="ref-title">需要再看的题（${wrongQs.length}）</p>
          <ol>${wrongQs.slice(0, 8).map(q => `<li>${subjectChip(q.subject)} <span>${esc(q.stem)}</span></li>`).join('')}</ol></div>` : ''}
        <div class="summary-actions">
          ${wrongQs.length ? `<button class="btn primary" id="retryBtn">${icon('rotate-ccw')} 重练本卷错题</button>` : ''}
          <button class="btn" type="button" id="scorePosterBtn">生成成绩单海报</button>
          <button class="btn ${wrongQs.length ? '' : 'primary'}" id="homeBtn">${icon('arrow-left')} ${paper?.stage === 'xsc' ? '返回，做下一章' : '返回首页，测下一科'}</button>
        </div>
        ${rx.length ? `<div class="eb-rx"><p class="earlybird-next">下一步：错题集中在下面几章，先做这几章的<b>同步章节卷</b>，一章一章补，比整卷反复刷更快见效。</p>
          ${rx.map(x => `<div class="eb-rx-row"><span>${esc(x.unit.replace(/^[^·]+·/, ''))}<small>错 ${x.n} 题</small></span><div>${x.papers.map(p => `<button class="btn" type="button" data-rx-paper="${p.id}">做「${esc(p.label || p.title)}」→</button>`).join('')}</div></div>`).join('')}
          <button class="btn ghost" type="button" id="toSyncBtn">看全部同步章节卷</button>
          ${!hasFullAccess() ? `<div class="eb-rx-upsell"><span class="muted">每章前 5 题可免费试做；完整版 ¥19.9 解锁全套同步卷 + 自动错题复习（3 台设备共用）。</span><button class="btn primary" type="button" id="ebUpsellBtn">看看完整版</button></div>` : ''}</div>`
        : paper && paper.stage !== 'xsc' && syncPapers(paper.stage).some(p => p.subject === paper.subject) ? `<p class="earlybird-next">下一步：看看错题集中在哪几章，用<b>同步章节卷</b>一章一章补，比整卷反复刷更快见效。</p>
        <button class="btn" type="button" id="toSyncBtn">去同步章节卷补弱项 →</button>` : ''}
      </section>
    </div>`;
    byId('retryBtn')?.addEventListener('click', () => beginPractice(wrongQs, 'retry'));
    byId('toSyncBtn')?.addEventListener('click', () => { state.syncSubject = paper.subject; if (paper.stage) setStage(paper.stage); renderHome(); byId('sync')?.scrollIntoView({ block: 'start' }); });
    view.querySelectorAll('[data-rx-paper]').forEach(b => b.addEventListener('click', () => { trackVisit('eb_rx'); claudePaperAction(b.dataset.rxPaper, 'phone'); }));
    byId('scorePosterBtn')?.addEventListener('click', () => void openScorePoster({
      title: paper?.title || '早鸟自测卷',
      metric: `${score} 分`,
      metricSub: `客观题答对 ${right} 题${essayTotal ? ` · 主观题 ${essayScore}/${essayTotal} 分` : ''}`,
      verdict: head,
      focusLine: rx.length ? `本次诊断薄弱章：${rx.map(x => x.unit.replace(/^[^·]+·/, '')).join('、')}` : '错题已自动进错题本，按 1/3/7/14 天提醒复习。',
    }));
    byId('ebUpsellBtn')?.addEventListener('click', () => openUnlock('开通完整版（¥19.9 一次买断），即可做完整套薄弱章节同步卷并开启 1/3/7/14 天错题自动复习。'));
    byId('homeBtn').addEventListener('click', () => { const xsc = paper?.stage === 'xsc'; if (xsc) { state.xscOpen = true; state.xscSubject = paper.subject; } renderHome('homeTitle'); byId(xsc ? 'xsc' : 'earlybird')?.scrollIntoView(); });
    state.keys = null;
    moveFocus(byId('summaryTitle'), true);
    return;
  }
  const cheer = !results.length ? '已完成本套试做题浏览，看看完整版包含哪些内容：'
    : acc >= 90 ? '太棒了，保持这个状态！' : acc >= 70 ? '不错，把错题再过一遍就更稳了。' : '别灰心，错题已进错题本，按时复习就能拿下。';
  // 整套同步卷做完：按卷面算百分制得分，并给出“下一章”按钮
  const syncDone = state.mode === 'sync' ? timedPaper() : null;
  const syncScore = syncDone ? earlybirdScore(results) : null;
  const syncList = syncDone ? syncPapers(syncDone.stage).filter(p => p.subject === syncDone.subject) : [];
  const nextSync = syncDone ? syncList[syncList.findIndex(p => p.id === syncDone.id) + 1] : null;
  view.innerHTML = `
    <div class="practice-shell">
      <section class="card summary-card" aria-labelledby="summaryTitle">
        <span class="summary-icon">${icon('trophy')}</span>
        <p class="summary-kicker">${esc(MODE_LABEL[state.mode] || '练习')} · 本组完成</p>
        <h1 id="summaryTitle" tabindex="-1">${cheer}</h1>
        <div class="summary-stats">
          ${!results.length ? `<div><b>${state.queue.length}</b><span>已浏览试做题</span></div>` : `
          ${syncDone ? `<div><b>${syncScore}<small>/100</small></b><span>本卷得分${essayTotal ? '（含主观题自评）' : ''}</span></div>` : `<div><b>${results.length}</b><span>本组作答</span></div>`}
          <div><b>${right}</b><span>答对 / 过关</span></div>
          <div><b>${acc}%</b><span>正确率</span></div>
          ${essayTotal ? `<div><b>${essayScore}<small>/${essayTotal}</small></b><span>主观题得分</span></div>` : ''}`}
        </div>
        ${timerLine}
        ${wrongQs.length ? `<div class="summary-wrong"><p class="ref-title">需要再看的题（${wrongQs.length}）</p>
          <ol>${wrongQs.slice(0, 8).map(q => `<li>${subjectChip(q.subject)} <span>${esc(q.stem)}</span></li>`).join('')}</ol></div>` : ''}
        <div class="summary-actions">
          ${wrongQs.length ? `<button class="btn primary" id="retryBtn">${icon('rotate-ccw')} 重练本组错题</button>` : ''}
          ${results.length ? `<button class="btn" type="button" id="scorePosterBtn">生成成绩单海报</button>` : ''}
          <button class="btn ${wrongQs.length ? '' : 'primary'}" id="homeBtn">${icon('arrow-left')} ${state.mode === 'national' ? '返回全国真题' : state.mode === 'knowledge' ? '返回知识点' : '返回首页'}</button>
        </div>
        ${state.mode === 'knowledge' ? (window.KnowledgeHub?.summaryRxHTML?.(state.queue, results) || '') : ''}
        ${trialUpsellHTML()}
        ${nextSync ? `<button class="btn next-sync" type="button" id="nextSyncBtn">下一章：${esc(nextSync.label || nextSync.title)} →</button>` : ''}
        <p class="checkin-cross">${accountingRecommendation()}</p>
      </section>
    </div>`;
  byId('retryBtn')?.addEventListener('click', () => beginPractice(wrongQs, state.mode === 'national' ? 'national' : 'retry'));
  byId('homeBtn').addEventListener('click', returnFromPractice);
  byId('nextSyncBtn')?.addEventListener('click', () => { void claudePaperAction(nextSync.id, 'phone'); });
  byId('upsellBtn')?.addEventListener('click', () => openUnlock());
  if (state.mode === 'knowledge') window.KnowledgeHub?.wireSummaryRx?.(view, state.queue, results);
  byId('scorePosterBtn')?.addEventListener('click', () => void openScorePoster({
    title: syncDone?.title || `${MODE_LABEL[state.mode] || '同步练习'}`,
    metric: syncDone ? `${syncScore} 分` : `${acc}%`,
    metricSub: `本组作答 ${results.length} 题 · 答对 ${right} 题`,
    verdict: cheer,
    focusLine: wrongQs.length ? `本组有 ${wrongQs.length} 道错题已自动进入错题本按时复习。` : '本组全部答对，继续保持！',
  }));
  state.keys = null;
  moveFocus(byId('summaryTitle'), true);
}
// 键盘快捷键：1–4 / A–D 选选项，回车提交或下一题（输入框内不拦截）。
document.addEventListener('keydown', event => {
  if (!document.body.classList.contains('practice') || !state.keys || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest?.('input, textarea, select, button, summary, a, dialog') || document.querySelector('dialog[open]')) return;
  const { options, submit, next } = state.keys;
  const index = '1234'.indexOf(event.key) >= 0 ? '1234'.indexOf(event.key) : 'abcd'.indexOf(event.key.toLowerCase());
  if (index >= 0 && options[index] && !options[index].disabled) { event.preventDefault(); options[index].click(); return; }
  if (event.key === 'Enter') {
    if (submit && !submit.hidden && !submit.disabled) { event.preventDefault(); submit.click(); }
    else if (next && !next.hidden) { event.preventDefault(); next.click(); }
  }
});

const progressDialog = byId('progressDialog');
const importInput = byId('importFile');
let importProgress;
let importRevision = 0;
function showImportMessage(message = '', preview = false) {
  byId('importMessage').textContent = message;
  byId('importPreview').hidden = !preview;
}
function formatCloudTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
async function refreshCloudSyncUI() {
  const paidBox = byId('cloudPaidActions');
  const lockBox = byId('cloudLockedActions');
  const statusEl = byId('cloudSyncStatus');
  if (!paidBox || !lockBox || !statusEl) return;
  paidBox.hidden = !paidAccess;
  lockBox.hidden = paidAccess;
  statusEl.textContent = '';
  if (!paidAccess) return;
  statusEl.textContent = '正在检查云端备份…';
  try {
    const res = await fetch('/api/access/backup', { cache: 'no-store' });
    const data = await res.json();
    if (!progressDialog.open) return;
    if (res.ok && data.ok) {
      statusEl.textContent = data.hasBackup ? `上次云端备份：${formatCloudTime(data.updatedAt)}` : '还没有云端备份，点「上传到云端」即可保存当前进度。';
    } else {
      statusEl.textContent = '云端状态暂不可用，仍可使用下方本机文件备份。';
    }
  } catch {
    if (progressDialog.open) statusEl.textContent = '网络不太稳，稍后再试或先用本机文件备份。';
  }
}
byId('cloudUnlockBtn')?.addEventListener('click', () => {
  progressDialog.close();
  openUnlock('云端错题本同步与 3 台设备跨端恢复属于完整版（¥19.9 一次买断，换手机或清微信缓存也不丢错题）。');
});
byId('cloudSaveBtn')?.addEventListener('click', async () => {
  const btn = byId('cloudSaveBtn');
  const statusEl = byId('cloudSyncStatus');
  btn.disabled = true;
  statusEl.textContent = '正在上传到云端…';
  try {
    const payload = JSON.stringify(createProgressBackup());
    const res = await fetch('/api/access/backup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      statusEl.textContent = `已同步到云端（${formatCloudTime(data.updatedAt)}），在另一台设备登录同一兑换码即可恢复。`;
      toast('学习进度与错题本已同步到云端。');
    } else {
      statusEl.textContent = data.message || '上传失败，请稍后重试。';
    }
  } catch {
    statusEl.textContent = '网络异常，上传失败，请稍后重试。';
  } finally {
    btn.disabled = false;
  }
});
byId('cloudLoadBtn')?.addEventListener('click', async () => {
  const btn = byId('cloudLoadBtn');
  const statusEl = byId('cloudSyncStatus');
  const revision = ++importRevision;
  btn.disabled = true;
  statusEl.textContent = '正在从云端读取…';
  try {
    const res = await fetch('/api/access/backup', { cache: 'no-store' });
    const data = await res.json();
    if (revision !== importRevision || !progressDialog.open) return;
    if (!res.ok || !data.ok) { statusEl.textContent = data.message || '读取云端备份失败。'; return; }
    if (!data.hasBackup || !data.payload) { statusEl.textContent = '云端还没有备份记录，请先在旧设备点「上传到云端」。'; return; }
    const progress = readProgressBackup(data.payload);
    importProgress = progress;
    const count = Object.values(progress.banks).filter(hasAnswered).length;
    statusEl.textContent = `已读取云端备份（${formatCloudTime(data.updatedAt)}），请在下方确认导入。`;
    showImportMessage(`云端备份包含 ${count} 道作答记录。确认后将覆盖当前浏览器的本机进度。`, true);
  } catch {
    if (revision === importRevision) statusEl.textContent = '云端备份读取失败，请稍后再试。';
  } finally {
    btn.disabled = false;
  }
});
byId('progressButton').addEventListener('click', () => {
  progressDialog.showModal();
  void refreshCloudSyncUI();
});
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
    showImportMessage('无法读取此备份，请选择从本题库（原中考提分题库）下载的 JSON 文件。');
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
  if (!confirm('确定清空当前浏览器的题库答题、收藏和打卡记录？')) return;
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
  if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    renderHome('homeTitle');
  }
});
byId('headerSearch').addEventListener('click', event => {
  event.preventDefault();
  if (!byId('searchBox')) {
    window.NationalExams?.leave?.();
    window.KnowledgeHub?.leave?.();
    state.searchOpen = true;
    renderHome('searchTitle');
  }
  const fold = byId('searchPanel');
  if (fold && !fold.open) { fold.open = true; state.searchOpen = true; }
  fold?.scrollIntoView({ block: 'start' });
  byId('searchBox')?.focus({ preventScroll: true });
});
const figureDialog = byId('figureDialog');
figureDialog.addEventListener('click', event => { if (event.target === figureDialog) figureDialog.close(); });
figureDialog.addEventListener('close', () => byId('figureFull').removeAttribute('src'));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateLegacyCountdown();
});

let loadBanksTask = null;
function startBanksBackgroundLoad() {
  if (loadBanksTask) return loadBanksTask;
  loadBanksTask = Promise.all([
    ensureBanks(SUBJECT_ORDER),
    Promise.allSettled(SUBJECT_ORDER.map(key => loadScript(`./data/subjective-${key}.js?v=${SUBJECTIVE_VERSION}`)))
  ]).then(async ([b]) => {
    banks = b;
    bankQuestions = allQuestions(banks, SUBJECT_ORDER);
    subjectiveQuestions = await loadSubjective().catch(error => { console.warn(error); return []; });
    library = [...bankQuestions, ...subjectiveQuestions, ...dailyQuestions()];
    baseTrialIds = trialQuestionIds(bankQuestions, subjectiveQuestions);
    // 后台加载完成后，静默更新首页小四门进度、主观题、错题与收藏计数，无闪烁
    if (!document.body.classList.contains('practice') && byId('x4mGroup')) {
      const progress = loadProgress();
      const queue = availableQueue(progress);
      const idx = resumeIndex(queue, progress);
      const pCount = byId('x4mGroup')?.querySelector('.x4m-bar p.muted');
      if (pCount) {
        pCount.textContent = `${activeSubjectsForStage(state.stage).map(k => SUBJECTS[k].short).join(' · ')} · ${fmt.format(queue.length)} 道 · ${idx > 0 ? `上次练到第 ${idx + 1} 题` : (STAGE_HINT[state.stage] || '')}`;
      }
      const unfinishedBtn = byId('x4mGroup')?.querySelector('[data-mode="unfinished"]');
      if (unfinishedBtn) {
        unfinishedBtn.textContent = `只做未做题 · ${fmt.format(applyMode(queue, 'unfinished', progress).length)}`;
      }
      const sc = byId('x4mGroup')?.querySelector('.subject-card');
      if (sc) {
        const temp = document.createElement('div');
        temp.innerHTML = subjectProgressHTML(progress);
        if (temp.firstElementChild) sc.replaceWith(temp.firstElementChild);
      }
      if (!byId('drillTitle') && subjectiveQuestions.length) {
        const dl = byId('x4mGroup')?.querySelector('.dashboard-lower');
        if (dl) {
          const temp = document.createElement('div');
          temp.innerHTML = drillCardHTML(progress);
          const el = temp.firstElementChild;
          if (el) {
            dl.before(el);
            el.querySelectorAll('[data-drill]').forEach(btn => btn.addEventListener('click', () => {
              state.drillSubject = btn.dataset.drill;
              renderHome();
              view.querySelector(`[data-drill="${state.drillSubject}"]`)?.focus();
            }));
            el.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => { void startPractice(btn.dataset.mode); }));
          }
        }
      }
      const dailyCol = byId('x4mGroup')?.querySelector('.daily-column');
      if (dailyCol) {
        dailyCol.innerHTML = `${dailyCardHTML(progress)}${reviewCardsHTML(progress)}`;
        byId('dailyBtn')?.addEventListener('click', () => beginPractice([dailyQuestion()], 'daily'));
        byId('dailyShare')?.addEventListener('click', event => { void shareDailyQuestion(event.currentTarget); });
        dailyCol.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => { void startPractice(btn.dataset.mode); }));
      }
      const hub = byId('reviewHub');
      if (hub) {
        const temp = document.createElement('div');
        temp.innerHTML = reviewHubHTML(progress);
        const nextHub = temp.firstElementChild;
        if (nextHub) {
          hub.replaceWith(nextHub);
          nextHub.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => { void startPractice(btn.dataset.mode); }));
        }
      }
      const cs = document.querySelector('.content-stats');
      if (cs) cs.outerHTML = contentStatsHTML();
    }
    return banks;
  }).catch(error => {
    console.warn('Banks background load error:', error);
    loadBanksTask = null;
    state.banksFailed = true;
  });
  return loadBanksTask;
}

async function init() {
  state.banksFailed = false;
  try {
    void restoreAccess();
    void loadPurchaseOptions();

    // 目录（早鸟卷、同步卷、分科练习、真题全靠它）优先下载，仅 ~180KB
    const catalogReady = window.NationalExams?.catalog
      ? window.NationalExams.catalog().then(list => { nationalCatalog = list; return list; }).catch(() => null)
      : Promise.resolve(null);
    const loadDaily = dailyQuestions().length ? Promise.resolve() : loadScript('./data/daily-questions-xiaosimen.js?v=7').catch(console.warn);

    window.NationalExams.attach({
      view,
      home: () => renderHome('homeTitle'),
      practice: questions => beginPractice(questions, 'national'),
      progress: loadProgress,
      hasAccess: hasFullAccess,
      claimPaper: paper => claimFree('phone', paper.id, paper.title),
      paperOpen: paper => freeOpen('phone', paper.id),
      unlock: message => openUnlock(message),
      hideSearch: () => { byId('headerSearch').hidden = true; },
      toast,
      freePhonePaper: () => freeUses.phone,
      freePrintPaper: () => freeUses.print,
    });

    prettifyGrades(view);
    new MutationObserver(list => { for (const m of list) m.addedNodes.forEach(prettifyGrades); }).observe(view, { childList: true, subtree: true });
    window.KnowledgeHub?.attach({
      view,
      home: () => renderHome('homeTitle'),
      practice: questions => beginPractice(questions, 'knowledge'),
      progress: loadProgress,
      hasAccess: hasFullAccess,
      isTrial: isTrialQuestion,
      unlock: message => openUnlock(message),
      toast,
      stage: () => state.stage,
      track: trackVisit,
      loadQrLib,
    });
    // 知识点目录（约 15KB）到了就刷新首页的知识点卡片
    void window.KnowledgeHub?.loadIndex().then(() => { if (byId('knowledgeHome') && !document.body.classList.contains('practice')) rerenderHomeInPlace('knowledgeHome'); }).catch(() => {});

    // 目录一就位，首屏瞬间秒开；小四门 2.5MB 题库等首屏画完后再后台空闲拉取，避免与首屏抢带宽
    await catalogReady;
    await loadDaily;

    if (location.hash === '#national') {
      await window.NationalExams.open();
    } else if (location.hash === '#knowledge' && window.KnowledgeHub) {
      await window.KnowledgeHub.open();
    } else if (!document.body.classList.contains('practice')) {
      renderHome();
      jumpToGoTarget();
    }

    const deferBanks = () => { void startBanksBackgroundLoad(); };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(deferBanks, { timeout: 1200 });
    else setTimeout(deferBanks, 400);

    void refreshReferralProfile();
    void refreshFreeUses().then(() => {
      if (paidAccess) return;
      if (byId('subjectSections')) renderHome();
      else window.NationalExams?.refresh?.();
    });
    trackVisit('visit');
  } catch (error) {
    console.error(error);
    state.banksFailed = true;
    // 已经从轻首页点进做卷的，不打断；回首页时轻首页会显示“重新加载”
    if (document.body.classList.contains('practice')) return;
    if (byId('liteLoading')) { renderLiteHome(); return; }
    view.innerHTML = '<section class="card loading-card"><h1>题库暂时无法加载</h1><p class="muted">检查网络后再试一次。</p><button class="btn primary" id="retryBtn">重新加载</button></section>';
    byId('retryBtn')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = '正在加载…';
      await init();
    });
  }
}
init();

// 首页“看怎么用”：点了才加载视频，不拖慢首页
document.addEventListener('click', event => {
  if (!event.target.closest('[data-demo-video]')) return;
  const dialog = byId('demoDialog');
  const video = byId('demoVideo');
  if (!video.src) { video.poster = video.dataset.poster || ''; video.src = video.dataset.src; }
  dialog.showModal();
  video.play().catch(() => {});
  trackVisit('demo_video');
});
byId('demoDialog').addEventListener('close', () => byId('demoVideo').pause());
// “免费拿”展开：记住状态，每天记一次
document.addEventListener('toggle', event => {
  if (!event.target.matches?.('[data-free-way]')) return;
  if (event.target.closest('#view')) state.freeWayOpen = event.target.open;
  if (event.target.open && !sessionStorage.getItem('fw')) { try { sessionStorage.setItem('fw', '1'); } catch {} trackVisit('free_way_open_x4m'); }
}, true);
