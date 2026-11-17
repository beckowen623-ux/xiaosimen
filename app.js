/* 小四门刷题 · 福州人教版 · 纯静态 + localStorage
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

// ---------- 主观题（材料分析 / 论述 / 简答）与填空题 ----------
// data/subjective-<科目>.js 用紧凑格式书写，这里展开成与选择题相同的题目对象。
// id = 科目-z<章>-<序号>（主观题）或 科目-k<章>-<序号>（填空题），按文件内顺序编号。
function expandSubjective(subject, list, chapters = []) {
  const counters = {};
  return list.map(entry => {
    const blank = typeof entry.b === 'string';
    const key = (blank ? 'k' : 'z') + entry.c;
    counters[key] = (counters[key] || 0) + 1;
    const stage = STAGES[entry.c - 1] || STAGES[0];
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
  return String(text || '').normalize('NFKC').toLowerCase()
    .replace(/[\s，,。.、；;：:“”"'‘’《》<>（）()【】\[\]—\-_·…!！?？]/g, '');
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
  essay: '主观题提分', blank: '填空速记', retry: '本组错题重练',
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
let paidAccess = false;
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
const visitorSource = new URL(location.href).searchParams.get('from') || 'direct';

function isTrialQuestion(q) {
  return baseTrialIds.has(q.id) || shareTrial.ids.includes(q.id);
}

function hasQuestionHistory(progress, q) {
  const record = qProgress(progress, q.id);
  return hasAnswered(record) || !!record?.revealed;
}

function availableQueue(progress) {
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

function trackVisit(event) {
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
    if (response.ok) paidAccess = (await response.json()).authenticated === true;
  } catch {
    // A connection failure leaves the trial available.
  }
}

async function loadPurchaseOptions() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) return;
    const options = await response.json();
    for (const [elementId, offer] of [['schoolOffer', options.xiaosimen], ['bundleOffer', options.bundle]]) {
      const offerElement = byId(elementId);
      const link = offerElement.querySelector('a');
      const copy = offerElement.querySelector('button');
      link.hidden = true;
      copy.hidden = true;
      if (/^https:\/\//i.test(offer?.link || '')) {
        link.href = offer.link;
        link.hidden = false;
      }
      if (offer?.text) {
        copy.hidden = false;
        copy.onclick = async () => {
          try {
            await navigator.clipboard.writeText(offer.text);
            redeemMessage.textContent = '闲鱼口令已复制。';
          } catch {
            redeemMessage.textContent = '复制失败，请重试。';
          }
        };
      }
    }
  } catch {
    // Codes can still be submitted when the offer configuration is unavailable.
  }
}

window.addEventListener?.('quiz-sprint-buy', () => openUnlock());
function openUnlock(message = '') {
  byId('unlockReason').textContent = message || '开通后可练全部题目、自动复习错题并参加周日小测。';
  redeemMessage.textContent = '';
  if (!unlockDialog.open) unlockDialog.showModal();
  void loadPurchaseOptions();
  trackVisit('purchase_view');
}

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
        DEVICE_LIMIT: '这个兑换码在小四门已激活两个浏览器。',
        INVALID_CODE: '兑换码无效，或不适用于小四门。',
        INVALID_REFERRAL: '邀请码有误，请核对或留空后继续。',
        REFERRAL_REQUIRED: '这是好友价兑换码，请填写邀请你的朋友的邀请码（ALIX- 开头，问朋友要）。',
        RATE_LIMITED: '尝试次数太多，请 15 分钟后再试。',
        UNAVAILABLE: '兑换服务暂时不可用，请稍后再试。',
      };
      redeemMessage.textContent = messages[data.reason] || '兑换失败，请稍后再试。';
      return;
    }
    paidAccess = true;
    input.value = '';
    unlockDialog.close();
    renderHome('homeTitle');
    void refreshReferralProfile();
    toast('已解锁小四门完整版。');
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
  return `<section class="card mini-card access-notice">
    <div><h2>免费练习</h2>${expired}<p class="muted">每科每学期前 ${TRIAL_QUESTIONS_PER_TERM} 道客观题，每科 ${TRIAL_ESSAYS_PER_SUBJECT} 道主观题。</p></div>
    <button class="btn" type="button" id="openUnlock">查看完整版 / 兑换</button>
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
  const text = `小四门每日一题 · ${question.subjectLabel || SUBJECTS[question.subject]?.label || ''}\n${question.stem}\n${url.href}`;
  button.disabled = true;
  try {
    if (navigator.share) await navigator.share({ title: '小四门每日一题', text });
    else await navigator.clipboard.writeText(text);
    trackVisit('daily_share');
    if (!hasFullAccess()) {
      const currentTrial = readShareTrial();
      const candidates = buildQueue(state.stage, banks, loadProgress(), false).filter(q => !baseTrialIds.has(q.id));
      const nextTrial = extendShareTrial(currentTrial, todayStr(), candidates);
      if (nextTrial !== currentTrial && persist(() => {
        localStorage.setItem(SHARE_TRIAL_KEY, JSON.stringify(nextTrial));
        return true;
      })) {
        shareTrial = nextTrial;
        renderHome('dailyShare');
        toast(`已解锁 ${nextTrial.ids.length - currentTrial.ids.length} 道额外练习题。`);
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
  return `<span class="chip tone-${esc(key)}">${esc(label || SUBJECTS[key]?.label || '')}</span>`;
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
  const weak = weakChapters(bankQuestions, progress);
  return `
    <section class="card subject-card" aria-labelledby="subjectTitle">
      <div class="section-heading"><h2 id="subjectTitle">四科进度</h2><span class="muted">选择题 ${fmt.format(bankQuestions.length)} 道${subjectiveQuestions.length ? ` · 主观/填空 ${fmt.format(subjectiveQuestions.length)} 道` : ''}</span></div>
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
function renderHome(focus = '') {
  if (!banks) return;
  document.body.classList.remove('practice');
  const progress = loadProgress();
  if (!paidAccess && paidLaunchDate) persist(() => startLegacyTrial(progress, paidLaunchDate));
  const queue = availableQueue(progress);
  const trialDays = paidAccess ? 0 : legacyTrialDays();
  const accessNotice = accessNoticeHTML(trialDays);
  refreshStreak(progress);
  byId('headerSearch').hidden = false;
  view.innerHTML = `
    ${trialDays ? accessNotice : ''}
    <div class="dashboard-top">
      ${studyHeroHTML(queue, progress)}
      ${checkinCardHTML(progress, checkinStatus(library, progress, hasFullAccess()))}
    </div>
    ${trialDays ? '' : accessNotice}
    <section id="sprintTeaser"></section>
    ${quickModesHTML(queue, progress)}
    ${drillCardHTML(progress)}
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
    </section>
    <section class="card cross-bank-card">${accountingRecommendation()}</section>`;
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
  view.querySelectorAll('[data-drill]').forEach(btn => btn.addEventListener('click', () => {
    state.drillSubject = btn.dataset.drill;
    renderHome();
    view.querySelector(`[data-drill="${state.drillSubject}"]`)?.focus();
  }));
  byId('dailyBtn')?.addEventListener('click', () => beginPractice([dailyQuestion()], 'daily'));
  byId('dailyShare')?.addEventListener('click', event => { void shareDailyQuestion(event.currentTarget); });
  byId('openUnlock')?.addEventListener('click', () => openUnlock());
  byId('checkinBtn')?.addEventListener('click', () => {
    const fullAccess = hasFullAccess();
    const res = persist(() => doCheckin(library, loadProgress(), fullAccess));
    if (!res) return;
    if (!res.ok) { toast('请先完成今日打卡任务。'); renderHome(); return; }
    toast(`${res.isMakeup ? '补打成功' : '打卡成功'}，+${res.points} 分${fullAccess && res.newBadges.length ? ' · 获得「' + res.newBadges.join('、') + '」' : ''}`);
    renderHome();
  });
  byId('searchBox').addEventListener('input', event => { state.keyword = event.target.value; doSearch(); });
  byId('searchSubject').addEventListener('change', event => { state.searchSubject = event.target.value; doSearch(); });
  byId('searchOut').addEventListener('click', event => {
    const id = event.target.closest('button[data-qid]')?.dataset.qid;
    if (id) beginPractice([library.find(q => q.id === id)], 'single');
  });
  doSearch();
  showReferralProfile();
  if (focus) moveFocus(byId(focus), focus === 'homeTitle');
  updateLegacyCountdown();
}
function doSearch() {
  const kw = state.keyword.trim().normalize('NFKC').toLowerCase();
  const status = byId('searchStatus');
  const out = byId('searchOut');
  if (!kw) { status.textContent = ''; out.replaceChildren(); return; }
  const hits = [...bankQuestions, ...subjectiveQuestions].filter(q =>
    (!state.searchSubject || q.subject === state.searchSubject) &&
    [q.chapter, q.stem, q.material || '', q.explanation || ''].some(text => text.normalize('NFKC').toLowerCase().includes(kw)));
  const progress = loadProgress();
  status.textContent = hits.length ? `找到 ${hits.length} 道${hits.length > 20 ? '，显示前 20 道' : ''}` : '没有找到相关题目。试试更短的关键词。';
  out.innerHTML = hits.slice(0, 20).map(q => `<article class="search-hit">
    <div>${subjectChip(q.subject)} ${isSubjective(q) ? `<span class="chip">${esc(q.meta)}</span> ` : ''}<span class="muted">${esc(q.chapter)}</span><p>${esc(q.stem)}</p></div>
    <button class="btn" data-qid="${q.id}">${hasFullAccess() || isTrialQuestion(q) ? '做这道' : hasQuestionHistory(progress, q) ? '回顾' : '查看完整版'} ${icon('arrow-right')}</button>
  </article>`).join('');
}

function startPractice(mode) {
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
  } else if (['wrong', 'due', 'favorite'].includes(mode)) {
    queue = applyMode(library, mode, progress);
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
      random20: '本档新题已做完，可切换学期继续。', unfinished: '本档题目已全部作答。',
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
    if (FULL_ONLY_MODES.has(mode)) {
      openUnlock('这项练习属于完整版。');
      return;
    }
    if (mode !== 'daily' && mode !== 'wrong') {
      const progress = loadProgress();
      const includesHistory = mode === 'favorite' || mode === 'single';
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
// 练习页外壳：进度、科目/题型、材料、题干、配图、作答区、结果区、操作按钮、答题卡。
function practiceShellHTML(q, progress, { title, body = '', submitLabel = '提交答案', submitDisabled = true, revealLabel = '查看解析' }) {
  const rec = qProgress(progress, q.id);
  const clearing = state.mode === 'clearWrong';
  const total = state.queue.length;
  const position = state.idx + 1;
  const typeLabel = q.type === 'essay' ? q.meta : (TYPE_LABEL[q.type] || '选择题');
  const studyMode = ['all', 'random', 'random20', 'unfinished', 'essay', 'blank'].includes(state.mode);
  return `
    <div class="practice-shell tone-${esc(q.subject)}">
      <div class="practice-top"><button class="btn text-button" id="backBtn">${icon('arrow-left')} 返回首页</button><span>${esc(MODE_LABEL[state.mode] || '')}${studyMode ? ' · ' + STAGE_MAP[state.stage].label : ''}</span></div>
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
function wireShell(q) {
  const submit = byId('submitBtn');
  const reveal = byId('revealBtn');
  const next = byId('nextBtn');
  byId('backBtn').addEventListener('click', () => renderHome('homeTitle'));
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
  byId('savedHome').addEventListener('click', () => renderHome('homeTitle'));
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
  if (!hasFullAccess() && state.mode !== 'daily' &&
      (state.mode === 'wrong' || FULL_ONLY_MODES.has(state.mode) || !isTrialQuestion(q))) {
    if (hasQuestionHistory(loadProgress(), q)) return renderSavedQuestion(q);
    renderHome('homeTitle');
    openUnlock('这项练习属于完整版。');
    return;
  }
  if (q.type === 'essay') return renderEssay(q);
  if (q.type === 'blank') return renderBlank(q);
  renderChoice(q);
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
    title: `<h1 id="questionTitle" tabindex="-1">${esc(q.stem)}</h1>`,
    body: `${q.type === 'multiple' ? `<p class="muted selection-hint">请选择 ${required}–${maximum} 项后提交。</p>` : ''}
      <div class="options" role="group" aria-label="${type}选项">
        ${choices.map((o, i) => `<button class="opt" type="button" data-choice="${i}" aria-pressed="false">
          ${q.type === 'judge' ? `<span class="opt-key">${o.key === 'true' ? '✓' : '✗'}</span>` : `<span class="opt-key">${esc(o.key)}</span>`}<span class="opt-text">${esc(o.text)}</span><span class="opt-status"></span>
        </button>`).join('')}
      </div>`,
  });
  const finishUI = wireShell(q);
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
  const parts = q.stem.split('____');
  const width = alts => Math.min(14, Math.max(4, ...alts.map(a => a.length + 2)));
  const stemHTML = parts.map((part, i) => esc(part) + (i < parts.length - 1
    ? `<span class="blank-slot"><span class="blank-no" aria-hidden="true">${i + 1}</span><input class="blank-input" data-blank="${i}" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="${i < parts.length - 2 ? 'next' : 'done'}" aria-label="第 ${i + 1} 空" style="--w:${width(q.blanks[i])}em"></span>`
    : '')).join('');
  let finished = false;
  view.innerHTML = practiceShellHTML(q, progress, {
    title: `<h1 id="questionTitle" class="blank-stem" tabindex="-1">${stemHTML}</h1>`,
    body: `<p class="muted selection-hint">在横线处填写答案，回车跳到下一空；同义写法也能判对。</p>`,
    submitDisabled: false, revealLabel: '看答案',
  });
  const finishUI = wireShell(q);
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

function renderEssay(q) {
  const progress = loadProgress();
  const draftKey = 'xiaosimen-draft-' + q.id;
  let draft = '';
  try { draft = sessionStorage.getItem(draftKey) || ''; } catch { /* 无存储权限时不保存草稿 */ }
  const tip = q.method || METHOD_TIPS[q.meta] || METHOD_TIPS['简答题'];
  let finished = false;
  view.innerHTML = practiceShellHTML(q, progress, {
    title: `<h1 id="questionTitle" tabindex="-1">${esc(q.stem)}</h1>`,
    body: `<div class="essay-box">
        <details class="method-tip"><summary>${icon('lightbulb')} 答题思路</summary><p>${esc(tip)}</p></details>
        <label class="essay-label" for="essayInput">${icon('pen-line')} 我的答案</label>
        <textarea id="essayInput" rows="7" placeholder="分点作答，例如：&#10;① ……&#10;② ……&#10;也可以先写在本子上，写完直接点「对照得分点」。">${esc(draft)}</textarea>
        <div class="essay-meta"><span id="essayCount">${draft.length} 字</span><span>满分 ${q.score} 分 · ${q.points.length} 个得分点</span></div>
      </div>
      <div id="scoring"></div>`,
    submitLabel: `${icon('list-checks')} 对照得分点`, submitDisabled: false, revealLabel: '直接看参考答案',
  });
  const finishUI = wireShell(q);
  const input = byId('essayInput');
  const submit = byId('submitBtn');
  const reveal = byId('revealBtn');
  input.addEventListener('input', () => {
    byId('essayCount').textContent = `${input.value.trim().length} 字`;
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
      <div class="exp-body">${expParas(q.explanation)}</div>
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
function finishPractice() {
  keepPosition(null);
  if (state.queue.length < 2 || !state.session.size) { renderHome('homeTitle'); return; }
  renderSummary();
}
function renderSummary() {
  document.body.classList.add('practice');
  const results = [...state.session.entries()];
  const right = results.filter(([, r]) => r.correct).length;
  const essays = results.filter(([, r]) => r.total);
  const essayScore = essays.reduce((s, [, r]) => s + r.score, 0);
  const essayTotal = essays.reduce((s, [, r]) => s + r.total, 0);
  const wrongQs = dedupeById(results.filter(([, r]) => !r.correct).map(([id]) => library.find(q => q.id === id)).filter(Boolean));
  const acc = Math.round(right / results.length * 100);
  const cheer = acc >= 90 ? '太棒了，保持这个状态！' : acc >= 70 ? '不错，把错题再过一遍就更稳了。' : '别灰心，错题已进错题本，按时复习就能拿下。';
  view.innerHTML = `
    <div class="practice-shell">
      <section class="card summary-card" aria-labelledby="summaryTitle">
        <span class="summary-icon">${icon('trophy')}</span>
        <p class="summary-kicker">${esc(MODE_LABEL[state.mode] || '练习')} · 本组完成</p>
        <h1 id="summaryTitle" tabindex="-1">${cheer}</h1>
        <div class="summary-stats">
          <div><b>${results.length}</b><span>本组作答</span></div>
          <div><b>${right}</b><span>答对 / 过关</span></div>
          <div><b>${acc}%</b><span>正确率</span></div>
          ${essayTotal ? `<div><b>${essayScore}<small>/${essayTotal}</small></b><span>主观题得分</span></div>` : ''}
        </div>
        ${wrongQs.length ? `<div class="summary-wrong"><p class="ref-title">需要再看的题（${wrongQs.length}）</p>
          <ol>${wrongQs.slice(0, 8).map(q => `<li>${subjectChip(q.subject)} <span>${esc(q.stem)}</span></li>`).join('')}</ol></div>` : ''}
        <div class="summary-actions">
          ${wrongQs.length ? `<button class="btn primary" id="retryBtn">${icon('rotate-ccw')} 重练本组错题</button>` : ''}
          <button class="btn ${wrongQs.length ? '' : 'primary'}" id="homeBtn">${icon('arrow-left')} 返回首页</button>
        </div>
        <p class="checkin-cross">${accountingRecommendation()}</p>
      </section>
    </div>`;
  byId('retryBtn')?.addEventListener('click', () => beginPractice(wrongQs, 'retry'));
  byId('homeBtn').addEventListener('click', () => renderHome('homeTitle'));
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
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateLegacyCountdown();
});

async function init() {
  try {
    const accessReady = restoreAccess();
    const loadDaily = dailyQuestions().length ? null : loadScript('./data/daily-questions-xiaosimen.js?v=7').catch(console.warn);
    const subjectiveReady = Promise.allSettled(SUBJECT_ORDER.map(key => loadScript(`./data/subjective-${key}.js?v=${SUBJECTIVE_VERSION}`)));
    banks = await ensureBanks(SUBJECT_ORDER);
    await loadDaily;
    await subjectiveReady;
    bankQuestions = allQuestions(banks, SUBJECT_ORDER);
    subjectiveQuestions = await loadSubjective().catch(error => { console.warn(error); return []; });
    library = [...bankQuestions, ...subjectiveQuestions, ...dailyQuestions()];
    baseTrialIds = trialQuestionIds(bankQuestions, subjectiveQuestions);
    await accessReady;
    renderHome();
    void refreshReferralProfile();
    trackVisit('visit');
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
