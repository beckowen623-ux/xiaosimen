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
  weekly: '本周一卷', paper: '精编模拟卷', everWrong: '曾错题', earlybird: '早鸟自测', chapter: '按章节练', sync: '同步章节卷',
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
  if (q.earlybird) return true; // 早鸟自测卷限时免费
  if (q.national) return q.preview === true; // 原卷免费看；在线刷题属于完整版，每种题型可免费试一组
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
byId('copySeller')?.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText('王者荣耀速度飞车'); redeemMessage.textContent = '已复制，打开闲鱼搜索框粘贴，切换到“用户”就能找到。'; }
  catch { redeemMessage.textContent = '复制失败，请手动输入用户名搜索。'; }
});
// ---------- 打印练习卷：按科目、册次组一张纸质卷（未解锁时用免费题组“体验卷”） ----------
function printChapters(subject) {
  return (banks?.[subject]?.chapters || []).map(c => ({ id: c.id, title: c.title }));
}
function fillPrintChapters() {
  const subjectSelect = byId('printSubject');
  const chapterSelect = byId('printChapter');
  if (!subjectSelect || !chapterSelect) return;
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
  byId('unlockReason').textContent = message || '先免费试：各地原卷随时免费看、免费打印；每个家庭再送 1 次整卷打印 + 1 套手机整卷。觉得孩子用得上再买。';
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
        DEVICE_LIMIT: '这个兑换码在本题库已激活两个浏览器。',
        INVALID_CODE: '兑换码无效，或不适用于爱丽克丝中考题库。',
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
    toast('已解锁爱丽克丝中考题库完整版。');
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
    <div><h2>免费试用</h2>${expired}<p class="muted">每个家庭送 <b>1 次整卷打印</b> + <b>1 套手机整卷</b>（模拟卷、本周一卷、真题卷任选）：${freeUses.print ? '打印已用' : '打印未用'} · ${freeUses.phone ? '手机整卷已用' : '手机整卷未用'}。各地原卷随时免费看、免费打印；其他卷子可试前 5 题。</p></div>
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
  const text = `爱丽克丝中考题库 · 每日一题 · ${question.subjectLabel || SUBJECTS[question.subject]?.label || ''}\n${question.stem}\n${url.href}`;
  button.disabled = true;
  try {
    if (navigator.share) await navigator.share({ title: '爱丽克丝中考题库 · 每日一题', text });
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
// 首页“更新日志”（折叠），新内容加在最前面。
const UPDATE_LOG = [
  ['2026-11-21', '同步章节卷新增七下英语 4 套：Units 1–2 Animal Friends / No Rules, No Order、Units 3–4 Keep Fit / Eat Well、Units 5–6 Here and Now / Rain or Shine、Units 7–8 A Day to Remember / Once upon a Time。每套 46 题 100 分，单选、完形、阅读、短文填空、书面表达（带范文和评分要点），短文全部原创，前 5 题免费试做。'],
  ['2026-11-21', '同步章节卷化学全册上线：九上 7 个单元（走进化学世界到燃料及其利用）＋九下 5 套（金属和金属材料、溶液、常见的酸和碱、盐和化肥、化学与生活），每套 100 分，实验探究题写清现象和结论，计算题按规范格式写全，前 5 题免费试做。'],
  ['2026-11-21', '同步章节卷新增九下物理 2 章：生活用电、电与磁。至此物理八上到九下 18 章全部上线，前 5 题免费试做。'],
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
async function claimFree(kind, paperId, title) {
  if (freeOpen(kind, paperId)) return 'full';
  if (freeUses[kind]) {
    toast(`免费${FREE_KIND_LABEL[kind]}已用在《${freeUses[kind].title || '另一套卷子'}》上；这套先试前 5 题，完整版可用全部卷子。`);
    return 'preview';
  }
  const again = kind === 'print' ? '打印' : '做';
  if (!window.confirm(`每个家庭可以免费${FREE_KIND_LABEL[kind]} 1 次。\n确定用在《${title}》上吗？\n（这一套以后还能反复${again}）`)) return 'cancel';
  try {
    const response = await fetch('/api/access/free-use', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, paperId, title, deviceId: await deviceId() }),
    });
    const data = await response.json();
    if (data.free) freeUses = data.free;
    if (response.ok && data.ok) { trackVisit(`free_${kind}`); return 'full'; }
    if (data.reason === 'USED') { toast(`这台手机或这个网络已经用过免费${FREE_KIND_LABEL[kind]}（《${freeUses[kind]?.title || '另一套卷子'}》）。`); return 'preview'; }
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
  const x4m = bankQuestions.length + subjectiveQuestions.length;
  const items = [
    eb && `早鸟自测卷 ${eb} 套<small>限时免费</small>`,
    xsc && `小升初衔接 ${xsc} 套<small>限时免费</small>`,
    sync && `同步章节卷 ${sync} 套`,
    claude && `中考精编模拟卷 ${claude} 套`,
    real && `全国中考真题 ${real} 套<small>原卷免费看</small>`,
    x4m && `小四门 ${x4m} 道题`,
  ].filter(Boolean);
  return items.length ? `<div class="content-stats" aria-label="题库现有内容"><b>现在题库里有：</b>${items.map(s => `<span>${s}</span>`).join('')}</div>` : '';
}
function homeIntroHTML() {
  return `<section class="card home-intro">
    <p class="intro-kicker">精编模拟卷 · 全国真题 · 手机刷、打印都行</p>
    <h1 id="homeTitle" tabindex="-1">爱丽克丝中考题库</h1>
    <p class="muted">紧贴课标和中考考点编写的精编模拟卷，加上全国各地真题整理成能刷的题，每套都由我亲自先做、把关后才上线；手机上做自动判分、记错题，不想看手机就打印出来在纸上做。</p>
    <p class="promise-line">有能力、有决心、有诚意：用科学的刷题方法帮孩子把考点真正掌握，中考稳稳提分。</p>
    ${contentStatsHTML()}
    <button class="btn demo-btn" type="button" data-demo-video>▶ 43 秒看怎么用</button>
  </section>`;
}
function weeklyCardHTML(progress) {
  const subject = weeklySubjectNow();
  const list = weeklyCache.get(`${weekKeyOf(todayStr())}-${subject}-${subject === 'x4m' ? state.stage : ''}`);
  const done = list ? weeklyFor(list).filter(q => hasAnswered(qProgress(progress, q.id))).length : 0;
  const total = list ? list.length : WEEKLY_SIZE[subject];
  return `<section class="card weekly-card" aria-labelledby="weeklyTitle">
    <div class="section-heading"><h2 id="weeklyTitle">🗓 本周一卷</h2><span class="muted">${weekRangeLabel()} · 每周一换</span></div>
    <div class="weekly-chips" role="group" aria-label="选择科目">${weeklySubjectsNow().map(([key, label]) => `<button type="button" class="drill-chip" data-weekly-subject="${key}" aria-pressed="${subject === key}">${label}</button>`).join('')}</div>
    <p class="weekly-meta"><b>${esc(weeklySubjectLabel(subject))}</b> · ${total} 题${list ? ` · 已做 ${done}` : ''}</p>
    <div class="weekly-actions">
      <button class="btn primary" type="button" data-weekly="phone">📱 手机上做</button>
      <button class="btn" type="button" data-weekly="print">🖨 打印</button>
      <button class="btn" type="button" data-weekly="mark">✍️ 纸上做完，登记错题</button>
    </div>
    <div id="weeklyMark"></div>
    <p class="muted weekly-note">手机上做，自动判分、错题进错题本；打印出来在纸上做完，回来点出做错的题号，同样进错题本，按 1、3、7、14 天提醒复习。</p>
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
      item = { type: 'essay', kind, tag, material: q.material || '', stem: q.stem, score: q.score, points: (q.points || []).map(p => ({ text: p.text, score: p.score })), sample: q.sample, explanation: q.explanation || '', source: q.source || '' };
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
function printQuestions(title, questions) {
  if (!questions.length) { toast('暂时没有可打印的题。'); return; }
  if (!window.QuizReferrals?.showPapers) { toast('打印功能加载中，请稍后再试。'); return; }
  window.QuizReferrals.showPapers([paperFromQuestions(title, questions)], { print: true });
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
  return `<details class="plan-tip"><summary>📋 ${esc(grade)}怎么用这个题库？4 步走</summary><ol>
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
async function ensureUnitPool() {
  if (unitPool) return unitPool;
  const list = (await window.NationalExams.catalog()).filter(p => p.data && (p.claude || p.earlybird || p.sync));
  const loaded = await Promise.all(list.map(p => window.NationalExams.loadPaper(p.id).catch(() => [])));
  unitPool = loaded.flat().filter(q => q.unit);
  return unitPool;
}
function unitCardHTML() {
  const subject = state.unitSubject || '';
  const chips = UNIT_SUBJECTS.map(([k, l]) => `<button type="button" class="drill-chip" data-unit-subject="${k}" aria-pressed="${subject === k}">${l}</button>`).join('');
  let body = '<p class="muted">先选科目，再选章节专项练。也可以在下面“全题库找题”里直接搜章节名，比如“浮力”“二次函数”“文言文”。</p>';
  if (subject && !unitPool) body = '<p class="muted" role="status">正在整理章节…</p>';
  if (subject && unitPool) {
    const qs = unitPool.filter(q => q.subject === subject);
    const units = [...new Set(qs.map(q => q.unit))].sort((a, b) => unitRank(a) - unitRank(b) || a.localeCompare(b, 'zh'));
    body = units.length ? `<div class="unit-list">${units.map(u => {
      const inUnit = qs.filter(q => q.unit === u);
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
        ${weak.length ? `<p class="analysis-weak">需要加强：${weak.map(([n, r, c]) => (unitPool || []).some(q => q.subject === k && q.unit === n)
          ? `<button type="button" class="analysis-go" data-go-subject="${esc(k)}" data-go-unit="${esc(n)}">${esc(n)}（${r}%，${c} 题）去补 →</button>`
          : `${esc(n)}（${r}%，${c} 题）`).join('；')}</p>` : ''}
        ${strong.length ? `<p class="analysis-strong">掌握较好：${strong.map(([n, r]) => `${esc(n)}（${r}%）`).join('；')}</p>` : ''}
        <p class="muted">${tip}</p></div>`;
    }).join('');
    state.analysisHTML = `<p>近 7 天学习 <b>${days}</b> 天 · 待复习错题 <b>${due}</b> 道${due ? '（先清掉到期的错题，效果最好）' : ''}</p>${rows}
      <p class="muted">说明：只统计在本机做过的题；某一章做题少于 3 道时不评价。点“去补”直接练这一章（同步章节卷、早鸟卷、精编卷里这一章的题）。建议每周看一次。</p>`;
  }
  const box = byId('analysisOut');
  if (box) box.innerHTML = state.analysisHTML;
  wireAnalysis();
}
function wireAnalysis() {
  byId('analysisOut')?.querySelectorAll('[data-go-unit]').forEach(b => b.addEventListener('click', async () => {
    state.unitSubject = b.dataset.goSubject;
    await ensureUnitPool().catch(() => {});
    await startUnit(b.dataset.goUnit);
  }));
}
function analysisCardHTML() {
  return `<section class="card analysis-card" id="analysisCard" aria-labelledby="analysisTitle">
    <div class="section-heading"><h2 id="analysisTitle">📊 学情分析</h2><span class="muted">按科目、章节自动统计</span></div>
    <div id="analysisOut">${state.analysisHTML || '<p class="muted">根据孩子做过的题，按科目和章节统计正确率，找出最需要补的章节，并给出复习建议。数据只保存在这台设备上。</p>'}</div>
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
    <summary><b>🎒 小升初衔接 · 按七年级上册章节</b><span>限时免费 · 六年级暑假、初一开学前用</span></summary>
    <p class="muted">语文、数学、英语按初一上册的章节，每章一套练习，题型和题干按初中考试标准出，难度贴近初一期中期末。每题有解析，做完出分。</p>
    <div class="weekly-chips" role="group" aria-label="选择科目">${XSC_SUBJECTS.map(([k, l]) => `<button type="button" class="drill-chip" data-xsc-subject="${k}" aria-pressed="${subject === k}">${l}</button>`).join('')}</div>
    ${ebModesHTML()}
    ${papers.length ? `<div class="unit-list">${papers.map(p => `<button type="button" class="btn unit-btn" data-earlybird="${p.id}"><b>${esc(p.unit || p.title)}</b><small>${done[p.id] != null ? `上次 ${done[p.id]} 分` : `${p.questionCount} 题 · 100 分`}</small></button>`).join('')}</div>` : '<p class="muted">这一科的衔接练习正在编写，很快上线。</p>'}
    <div class="eb-mark-box" id="xscMark"></div>
  </details>`;
}

// 早鸟卷、小升初卷三种做法：手机上做 / 打印整卷 / 纸上做完回来登记（家长多数让孩子在纸上做）
const EB_MODES = [['phone', '📱 手机上做'], ['print', '🖨 打印整卷'], ['mark', '✍️ 纸上做完，登记']];
const EB_MODE_TIP = {
  phone: '先选做法，再点科目。手机上做：客观题自动判分，主观题对照得分点自评。',
  print: '点科目生成整套卷：题目和答案页分开，每大题标好分值。限时免费，不占免费打印次数。',
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
      printQuestions(`${paper.title}（满分 100 分）`, all);
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
    box.innerHTML = `<div class="weekly-mark"><p><b>${score} 分${estimated ? '（按错题号估算）' : ''} · ${esc(head)}</b></p>
      <p class="earlybird-verdict">${esc(body)}</p>
      <p class="muted">${wrong.size ? `错的 ${wrong.size} 题已进错题本，明天开始按 1、3、7、14 天提醒复习；学情分析也已算进去。` : '全对，已登记！'}</p></div>`;
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
  return `<section class="card sync-card" id="sync" aria-labelledby="syncTitle">${head}
    <p class="muted">按人教版章节顺序出题，题型和难度对标期中、期末，每章一套 100 分，带易错“坑点”和逐题解析。学完一章做一套，哪章弱就补哪章。${hasFullAccess() ? '' : '每套前 5 题免费试做；完整版全部开放，手机做、打印都行。'}</p>
    ${subjects.length > 1 ? `<div class="weekly-chips" role="group" aria-label="选择科目">${subjects.map(([k, l]) => `<button type="button" class="drill-chip" data-sync-subject="${k}" aria-pressed="${subject === k}">${l}</button>`).join('')}</div>` : ''}
    <div class="paper-rows">${papers.map(p => `<div class="paper-row">
      <span>${esc(p.label || p.unit || p.title)}<small>${p.questionCount} 题 · 100 分</small></span>
      <button class="btn" type="button" data-claude-phone="${p.id}">${freeButtonLabel('phone', p.id, ['手机做', '免费手机做整卷', '试前 5 题'])}</button>
      <button class="btn" type="button" data-claude-print="${p.id}">${freeButtonLabel('print', p.id, ['打印', '免费打印整卷', '打印前 5 题'])}</button>
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
    <p>${state.stage === '9-down' ? '中考全范围，九科各一套' : '只考到这个学期为止学过的内容，各科一套'}，${isNinth() ? '按中考题型和题干长度出题，难度比中考略高一点' : '按期末考试题型和题干长度出题，难度比期末考试略高一点'}。客观题自动判分，主观题对照得分点自评，做完出百分制总分，每道题都有解析。</p>
    <p class="earlybird-tip">分数不是目的：找到会的、找到漏的，后面的复习就有方向了。</p>
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
  if (score >= 75) return ['很不错！', '这套卷比中考略难，这个分数放到中考里是稳稳的好成绩。错题已经进了错题本，按 1、3、7、14 天复习，还能再往上走。'];
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
  if (!isNinth()) return `<section class="card subject-later"><h2>中考精编卷和全国真题</h2><p class="muted">语数英物化的中考精编卷、全国各地真题是按中考全范围出的，初三（九上、九下）再刷更合适。现在先把本学期的早鸟卷和小四门练扎实；想提前看看，可以把上面的学期切到“九上”或“九下”。</p></section>`;
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
  return `<details class="card x4m-group" id="x4mGroup" ${open ? 'open' : ''}>
    <summary><b>🧭 小四门 · 道法 / 历史 / 地理 / 生物</b><span>按年级学期刷 · 主观题 · 冲刺卷</span></summary>
    <div class="x4m-bar">
      <div class="stage-field"><label for="stageSelect">年级学期</label>
        <select id="stageSelect">${STAGES.map(s => `<option value="${s.stage}" ${s.stage === state.stage ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
      <p class="muted">${activeSubjectsForStage(state.stage).map(k => SUBJECTS[k].short).join(' · ')} · ${fmt.format(queue.length)} 道 · ${idx > 0 ? `上次练到第 ${idx + 1} 题` : esc(STAGE_HINT[state.stage] || '')}</p>
      <div class="x4m-actions">
        <button class="btn primary" type="button" data-mode="all">${idx > 0 ? '继续练习' : '按学期刷题'} ${icon('arrow-right')}</button>
        <button class="btn" type="button" data-mode="random">${icon('shuffle')} 随机</button>
        <button class="btn" type="button" data-mode="unfinished">只做未做题 · ${fmt.format(applyMode(queue, 'unfinished', progress).length)}</button>
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
  return `<section class="quick-section" aria-labelledby="modesTitle">
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
  </section>`;
}
function printCardHTML() {
  const claude = (nationalCatalog || []).filter(p => p.claude);
  return `<section class="card print-card">
    <div><h2>🖨 打印练习卷</h2><p class="muted">答案单独一页，带“姓名 / 用时 / 得分”栏。各地真题原卷在上面分科里点“看原卷”，免费打印。</p></div>
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
  </section>`;
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
let nationalSearchPool = null;
async function ensureNationalSearch() {
  if (nationalSearchPool || !window.NationalExams?.catalog) return;
  const list = (await window.NationalExams.catalog()).filter(p => p.data);
  const loaded = await Promise.all(list.map(p => window.NationalExams.loadPaper(p.id).catch(() => [])));
  nationalSearchPool = loaded.flat();
}

function renderHome(focus = '') {
  if (!banks) return;
  window.NationalExams?.leave();
  document.body.classList.remove('practice');
  const progress = loadProgress();
  if (!paidAccess && paidLaunchDate) persist(() => startLegacyTrial(progress, paidLaunchDate));
  const queue = availableQueue(progress);
  const trialDays = paidAccess ? 0 : legacyTrialDays();
  const accessNotice = accessNoticeHTML(trialDays);
  refreshStreak(progress);
  byId('headerSearch').hidden = false;
  view.innerHTML = `
    ${homeIntroHTML()}
    ${xscCardHTML()}
    ${stageBarHTML()}
    ${earlybirdCardHTML()}
    ${syncCardHTML()}
    ${unitCardHTML()}
    ${analysisCardHTML()}
    ${accessNotice}
    ${weeklyCardHTML(progress)}
    <div id="subjectSections">${subjectSectionsHTML()}</div>
    ${x4mGroupHTML(queue, progress)}
    ${reviewHubHTML(progress)}
    ${printCardHTML()}
    <section class="card search-card" id="searchPanel" aria-labelledby="searchTitle">
      <div class="section-heading"><h2 id="searchTitle">${icon('search')} 全题库找题</h2><span class="muted">真题、模拟卷、小四门都能搜</span></div>
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
    </section>
    ${originCardHTML()}
    <details class="card origin-card update-card">
      <summary><b>📝 更新日志</b><span>最近：${UPDATE_LOG[0][0]} · 点开看我们做了什么 ›</span></summary>
      <ol class="update-list">${UPDATE_LOG.map(([date, text]) => `<li><time>${date}</time><span>${text}</span></li>`).join('')}</ol>
    </details>
    <section class="card cross-bank-card">${accountingRecommendation()}</section>`;
  wireHome();
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
function wireHome() {
  const sync = byId('sync');
  if (sync) {
    sync.querySelectorAll('[data-claude-phone]').forEach(b => b.addEventListener('click', () => { void claudePaperAction(b.dataset.claudePhone, 'phone'); }));
    sync.querySelectorAll('[data-claude-print]').forEach(b => b.addEventListener('click', () => { void claudePaperAction(b.dataset.claudePrint, 'print'); }));
    sync.querySelectorAll('[data-sync-subject]').forEach(b => b.addEventListener('click', () => { state.syncSubject = b.dataset.syncSubject; renderHome(); byId('sync')?.scrollIntoView({ block: 'start' }); }));
    sync.querySelector('[data-sync-xsc]')?.addEventListener('click', () => { state.xscOpen = true; renderHome(); byId('xsc')?.scrollIntoView({ block: 'start' }); });
  }
  view.querySelectorAll('[data-xsc-subject]').forEach(b => b.addEventListener('click', () => { state.xscSubject = b.dataset.xscSubject; state.xscOpen = true; renderHome(); byId('xsc')?.scrollIntoView({ block: 'start' }); }));
  byId('xsc')?.addEventListener('toggle', event => { state.xscOpen = event.currentTarget.open; });
  view.querySelectorAll('[data-unit-subject]').forEach(b => b.addEventListener('click', async () => {
    state.unitSubject = b.dataset.unitSubject;
    renderHome();
    if (!unitPool) { await ensureUnitPool().catch(() => {}); renderHome(); }
    byId('unitCard')?.scrollIntoView({ block: 'start' });
  }));
  view.querySelectorAll('[data-unit]').forEach(b => b.addEventListener('click', () => { void startUnit(b.dataset.unit); }));
  byId('analysisBtn')?.addEventListener('click', () => { void buildAnalysis(); });
  wireAnalysis();
  view.querySelectorAll('[data-stage-pick]').forEach(b => b.addEventListener('click', () => { setStage(b.dataset.stagePick); renderHome(); requestAnimationFrame(() => byId('stageBarTitle')?.scrollIntoView({ block: 'start' })); }));
  view.querySelectorAll('[data-earlybird]').forEach(b => b.addEventListener('click', () => { void earlybirdAction(b.dataset.earlybird, b.closest('#xsc') ? 'xscMark' : 'ebMark'); }));
  view.querySelectorAll('[data-eb-mode]').forEach(b => b.addEventListener('click', () => setEbMode(b.dataset.ebMode)));
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
  view.querySelectorAll('[data-drill]').forEach(btn => btn.addEventListener('click', () => {
    state.drillSubject = btn.dataset.drill;
    renderHome();
    view.querySelector(`[data-drill="${state.drillSubject}"]`)?.focus();
  }));
  view.querySelectorAll('[data-weekly-subject]').forEach(btn => btn.addEventListener('click', async () => {
    state.weeklySubject = btn.dataset.weeklySubject;
    try { await buildWeekly(state.weeklySubject); } catch { /* 网络不好时仍可切换 */ }
    renderHome();
  }));
  view.querySelectorAll('[data-weekly]').forEach(btn => btn.addEventListener('click', () => { void runWeekly(btn.dataset.weekly); }));
  view.querySelectorAll('[data-national-open]').forEach(btn => btn.addEventListener('click', () => {
    void window.NationalExams.open({ subject: btn.dataset.nationalOpen, mode: btn.dataset.nationalMode });
  }));
  wireSubjectSections();
  byId('dailyBtn')?.addEventListener('click', () => beginPractice([dailyQuestion()], 'daily'));
  byId('dailyShare')?.addEventListener('click', event => { void shareDailyQuestion(event.currentTarget); });
  view.querySelectorAll('#openUnlock').forEach(btn => btn.addEventListener('click', () => openUnlock()));
  byId('searchBox').addEventListener('input', event => { state.keyword = event.target.value; void doSearch(); });
  byId('searchSubject').addEventListener('change', event => { state.searchSubject = event.target.value; void doSearch(); });
  byId('searchOut').addEventListener('click', event => {
    const id = event.target.closest('button[data-qid]')?.dataset.qid;
    const q = id && ([...library].find(item => item.id === id) || (nationalSearchPool || []).find(item => item.id === id));
    if (q) beginPractice([q], 'single');
  });
  wirePrintKind();
  void doSearch();
  showReferralProfile();
  if (!nationalCatalog && window.NationalExams?.catalog) {
    window.NationalExams.catalog().then(list => {
      nationalCatalog = list;
      if (byId('subjectSections')) renderHome();
      // 主页、视频里的直达链接：x4m.cc.cd/?go=earlybird
      const go = new URLSearchParams(location.search).get('go');
      if (['earlybird', 'xsc', 'sync'].includes(go) && !state.earlybirdJumped) { state.earlybirdJumped = true; if (go === 'xsc') { state.xscOpen = true; renderHome(); } byId(go)?.scrollIntoView({ behavior: 'smooth' }); }
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
  const kw = state.keyword.trim().normalize('NFKC').toLowerCase();
  const status = byId('searchStatus');
  const out = byId('searchOut');
  if (!kw) { status.textContent = ''; out.replaceChildren(); return; }
  const wantsNational = !state.searchSubject || MAIN_SUBJECTS.some(s => s.key === state.searchSubject);
  if (wantsNational && !nationalSearchPool) {
    status.textContent = '正在加载全部真题和模拟卷…';
    try { await ensureNationalSearch(); } catch { /* 只搜本地题 */ }
    if (byId('searchStatus') !== status) return;
  }
  const textOf = q => [q.unit || '', q.chapter, q.stem, q.material || '', q.materialHtml ? htmlToText(q.materialHtml) : '', q.explanation || ''];
  const hits = [...bankQuestions, ...subjectiveQuestions, ...(nationalSearchPool || [])].filter(q =>
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
    if (FULL_ONLY_MODES.has(mode)) {
      openUnlock('这项练习属于完整版。');
      return;
    }
    const claimedPaper = queue.length && queue.every(q => q.paperId && freeOpen('phone', q.paperId));
    if (!claimedPaper && !['daily', 'wrong', 'weekly', 'paper', 'sync', 'earlybird'].includes(mode)) {
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
  const typeLabel = q.section || (q.type === 'essay' ? q.meta : (TYPE_LABEL[q.type] || '选择题'));
  const studyMode = ['all', 'random', 'random20', 'unfinished', 'essay', 'blank'].includes(state.mode);
  return `
    <div class="practice-shell tone-${esc(q.subject)}">
      <div class="practice-top"><button class="btn text-button" id="backBtn">${icon('arrow-left')} ${state.mode === 'national' ? '返回全国真题' : '返回首页'}</button><span>${esc(state.mode === 'earlybird' && String(state.earlybirdPaper || '').startsWith('xsc-') ? '小升初衔接' : MODE_LABEL[state.mode] || '')}${studyMode ? ' · ' + STAGE_MAP[state.stage].label : ''}</span></div>
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
  const parts = q.stem.split('____');
  const width = alts => Math.min(14, Math.max(4, ...alts.map(a => a.length + 2)));
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
// 试做完一套卷的前 5 题：告诉家长这套还有多少题、完整版包含什么（不夸大、不制造焦虑）
function trialUpsellHTML() {
  if (hasFullAccess() || !['paper', 'sync'].includes(state.mode)) return '';
  const paperId = state.queue[0]?.paperId;
  const paper = (nationalCatalog || []).find(p => p.id === paperId);
  if (!paper || !state.queue.length || state.queue.length >= paper.questionCount) return '';
  const rest = paper.questionCount - state.queue.length;
  return `<div class="trial-upsell"><p><b>这套卷还有 ${rest} 题</b>（含压轴的解答题）在完整版里。</p>
    <p class="muted">完整版 19.9 元一次买断：精编模拟卷、同步章节卷、本周一卷都能做完整套、也能打印，错题自动进错题本按 1、3、7、14 天复习，以后的更新也包含在内。</p>
    <button class="btn primary" type="button" id="upsellBtn">看看完整版</button></div>`;
}
function renderSummary() {
  document.body.classList.add('practice');
  const results = [...state.session.entries()];
  const right = results.filter(([, r]) => r.correct).length;
  const essays = results.filter(([, r]) => r.total);
  const essayScore = essays.reduce((s, [, r]) => s + r.score, 0);
  const essayTotal = essays.reduce((s, [, r]) => s + r.total, 0);
  const wrongQs = dedupeById(results.filter(([, r]) => !r.correct).map(([id]) => state.queue.find(q => q.id === id) || library.find(q => q.id === id)).filter(Boolean));
  const acc = Math.round(right / results.length * 100);
  if (state.mode === 'earlybird') {
    const score = earlybirdScore(results);
    const paperForVerdict = (nationalCatalog || []).find(p => p.id === state.earlybirdPaper);
    const [head, body] = earlybirdVerdict(score, paperForVerdict);
    const paperId = state.earlybirdPaper;
    const paper = (nationalCatalog || []).find(p => p.id === paperId);
    const finished = paper && results.length >= paper.questionCount;
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
        ${wrongQs.length ? `<div class="summary-wrong"><p class="ref-title">需要再看的题（${wrongQs.length}）</p>
          <ol>${wrongQs.slice(0, 8).map(q => `<li>${subjectChip(q.subject)} <span>${esc(q.stem)}</span></li>`).join('')}</ol></div>` : ''}
        <div class="summary-actions">
          ${wrongQs.length ? `<button class="btn primary" id="retryBtn">${icon('rotate-ccw')} 重练本卷错题</button>` : ''}
          <button class="btn ${wrongQs.length ? '' : 'primary'}" id="homeBtn">${icon('arrow-left')} ${paper?.stage === 'xsc' ? '返回，做下一章' : '返回首页，测下一科'}</button>
        </div>
        ${paper && paper.stage !== 'xsc' && syncPapers(paper.stage).some(p => p.subject === paper.subject) ? `<p class="earlybird-next">下一步：看看错题集中在哪几章，用<b>同步章节卷</b>一章一章补，比整卷反复刷更快见效。</p>
        <button class="btn" type="button" id="toSyncBtn">去同步章节卷补弱项 →</button>` : ''}
      </section>
    </div>`;
    byId('retryBtn')?.addEventListener('click', () => beginPractice(wrongQs, 'retry'));
    byId('toSyncBtn')?.addEventListener('click', () => { state.syncSubject = paper.subject; if (paper.stage) setStage(paper.stage); renderHome(); byId('sync')?.scrollIntoView({ block: 'start' }); });
    byId('homeBtn').addEventListener('click', () => { const xsc = paper?.stage === 'xsc'; if (xsc) { state.xscOpen = true; state.xscSubject = paper.subject; } renderHome('homeTitle'); byId(xsc ? 'xsc' : 'earlybird')?.scrollIntoView(); });
    state.keys = null;
    moveFocus(byId('summaryTitle'), true);
    return;
  }
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
        ${trialUpsellHTML()}
        <div class="summary-actions">
          ${wrongQs.length ? `<button class="btn primary" id="retryBtn">${icon('rotate-ccw')} 重练本组错题</button>` : ''}
          <button class="btn ${wrongQs.length ? '' : 'primary'}" id="homeBtn">${icon('arrow-left')} ${state.mode === 'national' ? '返回全国真题' : '返回首页'}</button>
        </div>
        <p class="checkin-cross">${accountingRecommendation()}</p>
      </section>
    </div>`;
  byId('retryBtn')?.addEventListener('click', () => beginPractice(wrongQs, state.mode === 'national' ? 'national' : 'retry'));
  byId('homeBtn').addEventListener('click', returnFromPractice);
  byId('upsellBtn')?.addEventListener('click', () => openUnlock());
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
    });
    if (location.hash === '#national') await window.NationalExams.open();
    else renderHome();
    void refreshReferralProfile();
    void refreshFreeUses().then(() => { if (!paidAccess && byId('subjectSections')) renderHome(); });
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

// 首页“看怎么用”：点了才加载视频，不拖慢首页
document.addEventListener('click', event => {
  if (!event.target.closest('[data-demo-video]')) return;
  const dialog = byId('demoDialog');
  const video = byId('demoVideo');
  if (!video.src) video.src = video.dataset.src;
  dialog.showModal();
  video.play().catch(() => {});
  trackVisit('demo_video');
});
byId('demoDialog').addEventListener('close', () => byId('demoVideo').pause());
