// 小四门刷题自检：node tests/validate.mjs
// 校验：id 唯一、total 一致、每章 count 一致、答案格式、每题有解析、grade/stage 映射，
// 以及 app.js 里真正的 buildQueue(stage) 在 6 个学期档下的顺序规则。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = (msg) => errors.push(msg);
const STAGE_GRADE = { '7-up': '七上', '7-down': '七下', '8-up': '八上', '8-down': '八下', '9-up': '九上', '9-down': '九下' };

function loadDataFile(rel) {
  const code = fs.readFileSync(path.join(root, rel), 'utf8');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: rel });
  return sandbox.window;
}

// 前端脚本先过一遍语法：只编译不运行，防止一个没转义的引号把整站弄坏
for (const rel of ['app.js', 'national-exams.js', 'key-points.js', 'referrals.js', 'share-offer.js', 'qrcode.js']) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  try { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: rel }); }
  catch (e) { fail(`${rel} 语法错误：${e.message}`); }
}

const subjects = ['daode', 'lishi', 'dili', 'shengwu'];
const banks = {};
const allIds = new Set();
const stats = {}; // subject -> stage -> count
for (const s of subjects) {
  const w = loadDataFile(`data/${s}.js`);
  const bank = w.XIAOSIMEN_BANKS && w.XIAOSIMEN_BANKS[s];
  if (!bank) { fail(`${s}: window.XIAOSIMEN_BANKS["${s}"] 缺失`); continue; }
  banks[s] = bank;
  stats[s] = {};
  if (bank.total !== bank.questions.length) fail(`${s}: total=${bank.total} 与实际题数 ${bank.questions.length} 不一致`);
  const perChapter = {};
  for (const q of bank.questions) {
    if (!q.id) fail(`${s}: 有题缺 id`);
    else if (allIds.has(q.id)) fail(`id 重复: ${q.id}`);
    else allIds.add(q.id);
    if (!q.stem || !String(q.stem).trim()) fail(`${q.id}: stem 为空`);
    if (!q.explanation || !String(q.explanation).trim()) fail(`${q.id}: 缺 explanation`);
    if (!q.grade || !q.stage || STAGE_GRADE[q.stage] !== q.grade) fail(`${q.id}: grade/stage 不匹配 (${q.grade}/${q.stage})`);
    const ch = bank.chapters.find(c => c.id === q.chapterId);
    if (!ch) fail(`${q.id}: chapterId ${q.chapterId} 不在 chapters 里`);
    else if (ch.title !== q.chapter) fail(`${q.id}: chapter 文字与 chapters[${q.chapterId}] 不一致`);
    perChapter[q.chapterId] = (perChapter[q.chapterId] || 0) + 1;
    stats[s][q.stage] = (stats[s][q.stage] || 0) + 1;
    if (q.type === 'single') {
      if (!Array.isArray(q.options) || q.options.length !== 4) fail(`${q.id}: 单选 options 不是 4 个`);
      if (!Array.isArray(q.answer) || q.answer.length !== 1) fail(`${q.id}: 单选 answer 不是 1 个`);
    } else if (q.type === 'multiple') {
      if (!Array.isArray(q.options) || q.options.length !== 4) fail(`${q.id}: 多选 options 不是 4 个`);
      if (!Array.isArray(q.answer) || q.answer.length < 2 || q.answer.length > 4) fail(`${q.id}: 多选 answer 不是 2-4 个`);
    } else if (q.type === 'judge') {
      if (!Array.isArray(q.options) || q.options.length !== 0) fail(`${q.id}: 判断题 options 应为空数组`);
      if (JSON.stringify(q.answer) !== '["true"]' && JSON.stringify(q.answer) !== '["false"]') fail(`${q.id}: 判断题 answer 必须是 ["true"] 或 ["false"]`);
    } else fail(`${q.id}: 未知 type ${q.type}`);
    if (q.type !== 'judge' && Array.isArray(q.options)) {
      const keys = q.options.map(o => o.key);
      for (const a of q.answer || []) if (!keys.includes(a)) fail(`${q.id}: 答案 ${a} 不在选项里`);
      if (new Set(keys).size !== keys.length) fail(`${q.id}: 选项 key 重复`);
    }
    // 章内题号连续
    if (typeof q.number !== 'number' || q.number < 1) fail(`${q.id}: number 异常`);
  }
  for (const c of bank.chapters) {
    if ((perChapter[c.id] || 0) !== c.count) fail(`${s} 第 ${c.id} 章: count=${c.count} 与实际 ${perChapter[c.id] || 0} 不一致`);
  }
  const typeCount = {};
  for (const q of bank.questions) typeCount[q.type] = (typeCount[q.type] || 0) + 1;
  console.log(`${s}: ${bank.questions.length} 道 (single ${typeCount.single || 0} / multiple ${typeCount.multiple || 0} / judge ${typeCount.judge || 0})`);
}

// ---- 配图校验：有 image: true 的题必须在 data/figures/ 有同名 JPEG ----
const figureDir = path.join(root, 'data/figures');
const expectedFigures = new Set();
let figureBytes = 0;
for (const subject of subjects) {
  for (const q of banks[subject].questions) {
    if (q.image === undefined) continue;
    if (q.image !== true) { fail(`${q.id}: image 字段应为 true`); continue; }
    const name = q.id + '.jpg';
    expectedFigures.add(name);
    const file = path.join(figureDir, name);
    if (!fs.existsSync(file)) { fail(`${q.id}: 缺少配图 ${name}`); continue; }
    const jpeg = fs.readFileSync(file);
    if (jpeg.length < 4 || jpeg.readUInt16BE(0) !== 0xffd8 || jpeg.readUInt16BE(jpeg.length - 2) !== 0xffd9) {
      fail(`${q.id}: 配图 JPEG 格式异常`);
    }
    figureBytes += jpeg.length;
  }
}
for (const name of fs.readdirSync(figureDir)) {
  if (!expectedFigures.has(name)) fail(`多余的配图文件 ${name}`);
}
const bankBytes = subjects.reduce((total, key) => total + fs.statSync(path.join(root, `data/${key}.js`)).size, 0);
const totalBytes = figureBytes + bankBytes;
console.log(`figures: ${expectedFigures.size} 道题带图，独立 JPEG ${(figureBytes / 1024).toFixed(0)} KB；四科题库和配图合计 ${(totalBytes / 1048576).toFixed(2)} MiB`);
if (totalBytes > 12 * 1048576) fail(`四科题库和配图超 12 MiB：${(totalBytes / 1048576).toFixed(2)} MiB`);

// 每日一题
const dailyW = loadDataFile('data/daily-questions-xiaosimen.js');
const daily = dailyW.DAILY_QUESTIONS_XIAOSIMEN;
if (!daily || !Array.isArray(daily.questions) || !daily.questions.length) fail('每日一题缺失或为空');
else {
  for (const q of daily.questions) {
    if (allIds.has(q.id)) fail(`每日一题 id 与题库重复: ${q.id}`);
    allIds.add(q.id);
    if (!q.explanation) fail(`${q.id}: 每日一题缺 explanation`);
    if (q.type === 'judge' && JSON.stringify(q.answer) !== '["true"]' && JSON.stringify(q.answer) !== '["false"]') fail(`${q.id}: 每日一题判断答案格式错`);
  }
  console.log(`daily: ${daily.questions.length} 道，startDate=${daily.startDate}`);
}

// 考点速记的每册、每类和来源引用都要能在静态页面中加载。
const pointIds = new Set();
for (const subject of subjects) {
  const dataFile = `data/key-points-${subject}.js`;
  if (!fs.existsSync(path.join(root, dataFile))) { fail(`考点速记缺少 ${dataFile}`); continue; }
  const data = loadDataFile(dataFile).XIAOSIMEN_KEY_POINTS?.[subject];
  if (!Array.isArray(data?.items) || !data.items.length || !data.sources) {
    fail(`${subject}: 考点或来源缺失`);
    continue;
  }
  const stages = Object.keys(STAGE_GRADE).slice(0, ['dili', 'shengwu'].includes(subject) ? 4 : 6);
  for (const stage of stages) {
    if (!data.items.some(item => item.stage === stage)) fail(`${subject}: ${STAGE_GRADE[stage]}缺考点`);
  }
  for (const type of ['core', 'trap']) {
    if (!data.items.some(item => item.type === type)) fail(`${subject}: 缺少 ${type} 类型`);
  }
  for (const [ref, source] of Object.entries(data.sources)) {
    let protocol;
    try { protocol = new URL(source?.url).protocol; } catch { /* 无效的来源地址 */ }
    if (typeof source?.label !== 'string' || !source.label.trim() ||
        protocol !== 'https:') {
      fail(`${subject}: 来源 ${ref} 缺少标签或 HTTPS 链接`);
    }
  }
  for (const item of data.items) {
    const id = item.id;
    if (!new RegExp(`^${subject}-[a-z0-9-]+$`).test(id) || pointIds.has(id)) fail(`考点 ID 无效或重复: ${id}`);
    pointIds.add(id);
    if (!stages.includes(item.stage) || !['core', 'trap'].includes(item.type)) fail(`${id}: 册次或分类无效`);
    for (const field of ['title', 'topic', 'rule', 'pitfall', 'question', 'answer']) {
      if (typeof item[field] !== 'string' || !item[field].trim()) fail(`${id}: 缺少 ${field}`);
    }
    if (!Array.isArray(item.refs) || !item.refs.length || item.refs.some(ref => !Object.hasOwn(data.sources, ref))) {
      fail(`${id}: 来源引用不存在`);
    }
  }
  console.log(`考点速记 ${subject}: ${data.items.length} 条`);
}
console.log(`考点速记合计: ${pointIds.size} 条`);

// ---- buildQueue 真实代码测试：只取 app.js 核心部分（界面之前），在 vm 里跑 ----
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const coreSrc = appSrc.split('// ---------- 界面 ----------')[0];
if (!coreSrc || coreSrc === appSrc) fail('app.js 里找不到“界面”分界，buildQueue 测试无法截取核心部分');
const store = {};
const sandbox = {
  window: { XIAOSIMEN_BANKS: banks },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  console,
};
vm.createContext(sandbox);
vm.runInContext(coreSrc, sandbox, { filename: 'app-core.js' });
const { buildQueue, applyMode } = sandbox;

{
  const { startLegacyTrial, legacyTrialDays } = sandbox;
  if (!startLegacyTrial || !legacyTrialDays) fail('缺少老用户 7 天完整版体验');
  else {
    const launch = '2026-11-17';
    const startedAt = Date.parse('2026-11-17T09:00:00+08:00');
    const day = 86400000;
    const key = 'xiaosimen-legacy-trial-start-v1';
    const oldProgress = { studyDays: ['2026-11-17', '2026-11-15'], banks: { sample: { done: true } } };
    const oldProgressText = JSON.stringify(oldProgress);
    startLegacyTrial({ studyDays: [launch, '2026-11-18'] }, launch, startedAt);
    if (legacyTrialDays(startedAt) !== 0 || key in store) fail('上线当日或之后首次作答的新用户不能开通老用户体验');
    startLegacyTrial(oldProgress, launch, Date.parse('2026-11-16T23:59:59+08:00'));
    if (key in store) fail('上线之前不能开始倒计时');
    startLegacyTrial(oldProgress, launch, startedAt);
    const firstRecord = store[key];
    if (JSON.stringify(oldProgress) !== oldProgressText) fail('开通体验不应覆盖原答题进度');
    if (legacyTrialDays(startedAt) !== 7 || legacyTrialDays(startedAt + day) !== 6) fail('体验从首次开通起倒计时 7 天');
    startLegacyTrial(oldProgress, launch, startedAt + 3 * day);
    if (store[key] !== firstRecord || legacyTrialDays(startedAt + 7 * day - 1) !== 1) fail('再次进入不能重置起算时间');
    startLegacyTrial(oldProgress, launch, startedAt + 7 * day);
    if (legacyTrialDays(startedAt + 7 * day) !== 0 || store[key] !== firstRecord) fail('准确到期后不能重开体验');
    delete store[key];
    store['xiaosimen-growth-v1'] = JSON.stringify({ studyDays: ['2026-11-16'] });
    startLegacyTrial({ banks: oldProgress.banks }, launch, startedAt);
    if (legacyTrialDays(startedAt) !== 7) fail('更早版本单独保存的作答日期也应识别');
    delete store[key];
    delete store['xiaosimen-growth-v1'];
  }
}

// The trial picks separate quotas per term and subject and does not count fill-in questions as essay samples.
if (typeof sandbox.trialQuestionIds !== "function") fail("缺少免费题范围选择");
else {
  const sample = (subject, stage) => Array.from({ length: 21 }, (_, i) => ({
    id: [subject, stage, i + 1].join("-"), subject, stage, chapterId: 1, number: i + 1,
  }));
  const objectives = [...sample("lishi", "7-up"), ...sample("lishi", "7-down"), ...sample("dili", "7-up")];
  const subjective = [
    { id: "blank", subject: "lishi", type: "blank" },
    ...[1, 2, 3].map(i => ({ id: "essay" + i, subject: "lishi", type: "essay" })),
    { id: "essay-dili", subject: "dili", type: "essay" },
  ];
  const allowed = sandbox.trialQuestionIds(objectives, subjective);
  if (allowed.size !== 63 || !allowed.has("lishi-7-down-20") || allowed.has("lishi-7-down-21") ||
      allowed.has("dili-7-up-21") || allowed.has("blank") || allowed.has("essay3") || !allowed.has("essay-dili")) {
    fail("免费范围应为每科每学期前 20 道客观题、每科前 2 道主观题");
  }
  const day = "2026-11-17";
  const trial = sandbox.extendShareTrial({ days: [], ids: [] }, day, objectives.filter(q => !allowed.has(q.id)));
  if (trial.ids.length !== 3 || sandbox.extendShareTrial(trial, day, objectives) !== trial) {
    fail("每日分享最多领一次 3 道额外试题");
  }
  const capped = sandbox.extendShareTrial({ days: [], ids: Array.from({ length: 29 }, (_, i) => "old-" + i) }, day, objectives);
  if (capped.ids.length !== 30) fail("分享额外试题最多累计 30 道");
}

if (typeof buildQueue !== 'function') fail('app.js 里没有 buildQueue 函数');
else {
  const emptyProgress = { banks: {} };
  const stages = ['7-up', '7-down', '8-up', '8-down', '9-up', '9-down'];
  for (const st of stages) {
    const q = buildQueue(st, banks, emptyProgress);
    const subs = [...new Set(q.map(x => x.subject))];
    console.log(`buildQueue(${st}): ${q.length} 道，科目=${subs.join(',')}`);
    if (!q.length) fail(`buildQueue(${st}) 为空`);
    if ((st === '9-up' || st === '9-down') && subs.some(s => s === 'dili' || s === 'shengwu')) fail(`buildQueue(${st}) 初三不应含地理/生物`);
    if (st === '7-up') {
      const first4 = q.slice(0, 4).map(x => x.subject);
      if (new Set(first4).size !== 4) fail(`buildQueue(7-up) 开头 4 道不是四门轮刷: ${first4.join(',')}`);
    }
    if (st === '8-down') {
      const hasReview = q.some(x => (x.subject === 'dili' || x.subject === 'shengwu') && x.chapterId >= 5);
      if (!hasReview) fail('buildQueue(8-down) 没有地理/生物总复习章');
    }
    if (st === '9-down') {
      const hasOld = q.some(x => x.subject === 'daode' && x.stage === '7-up');
      if (!hasOld) fail('buildQueue(9-down) 没有七年级道法总复习');
    }
  }
  // 到期错题插队：把一道七上道法题设为昨天到期
  const firstQ = banks.daode.questions[0];
  const p2 = { banks: { [firstQ.id]: { srs: { stage: 0, due: '2000-01-01' } } } };
  const q2 = buildQueue('7-up', banks, p2);
  if (q2[0] && q2[0].id !== firstQ.id) fail('到期错题没有排在队首');
  // 每天 20 题真截取
  const r20 = applyMode(buildQueue('7-up', banks, emptyProgress), 'random20', emptyProgress);
  if (r20.length !== 20) fail(`random20 应为 20 道，实际 ${r20.length}`);
  console.log('buildQueue / random20 规则检查通过');
}

// ---- 打卡 / 积分 / 补打：app.js 核心逻辑测试（在同一个 vm 沙箱里跑） ----
{
  const { recordAnswer, doCheckin, checkinStatus, clearWrongList, allQuestions, todayStr: tstr, addDays: addD, weekKeyOf: wkOf } = sandbox;
  const RI = vm.runInContext('REVIEW_INTERVALS', sandbox);
  const today = tstr();
  const all = allQuestions(banks, subjects);
  const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`打卡测试 ${msg}: 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); };
  eq(RI, [1, 3, 7, 14], 'SRS 应为 1/3/7/14 天');
  for (const k of Object.keys(store)) delete store[k]; // localStorage mock 复位
  const q1 = banks.daode.questions.find(q => q.type === 'single');
  const q2 = banks.daode.questions.find(q => q.type === 'single' && q.id !== q1.id);
  const q3 = banks.daode.questions.find(q => q.type === 'single' && q.id !== q1.id && q.id !== q2.id);
  // 答对 +1，同题当天再答对不重复计分
  let r = recordAnswer(q1, [...q1.answer], true, { mode: 'all' });
  eq(r.points, 1, '新题答对 +1');
  r = recordAnswer(q1, [...q1.answer], true, { mode: 'all' });
  eq(r.points, 0, '同题当天重复答对不计分');
  // 答错：+0，SRS 回到第 1 级（明天复习）
  const wrongKey2 = q2.options.find(o => !q2.answer.includes(o.key)).key;
  r = recordAnswer(q2, [wrongKey2], false, { mode: 'all' });
  eq(r.points, 0, '答错 +0');
  eq(r.rec.srs, { stage: 0, due: tstr(1) }, '答错后 SRS 回第 1 级');
  // 订正答对 +2
  r = recordAnswer(q2, [...q2.answer], true, { mode: 'wrong' });
  eq(r.points, 2, '错题订正答对 +2');
  eq(r.rec.srs, { stage: 0, due: tstr(1) }, '提前订正保留次日复习');
  eq(clearWrongList(all, sandbox.loadProgress()).some(q => q.id === q2.id), false, '提前订正后等到期再复习');
  // SRS 四级走完才掌握：连续 4 次到期答对，提前重答不消耗复习次数。
  recordAnswer(q3, [q3.options.find(o => !q3.answer.includes(o.key)).key], false, { mode: 'all' });
  for (let i = 0; i < 4; i++) {
    const review = sandbox.loadProgress();
    review.banks[q3.id].srs.due = today;
    sandbox.saveProgress(review);
    const rr = recordAnswer(q3, [...q3.answer], true, { mode: 'due' });
    if (i < 3 && (!rr.rec.srs || rr.rec.srs.stage !== i + 1)) fail(`打卡测试 SRS 第 ${i + 1} 次答对应在 stage ${i + 1}`);
    if (i === 3 && (rr.rec.srs !== null || rr.rec.mastered !== true)) fail('打卡测试 SRS 第 4 次答对后应掌握');
  }
  const mkFirst = (n, correctN) => { const f = {}; for (let i = 0; i < n; i++) f['test-q' + i] = i < correctN ? 1 : 0; return f; };
  const mkProgress = (checkin) => ({ banks: {}, checkin });
  // 正常打卡：昨天打过，今天 20 道新题 90% 正确 → 连续 6 天，打卡 10 + 连续加成 10 + 正确率 5 = 25 分，拿「坚持者」+「小火苗」
  let p = mkProgress({ lastDate: tstr(-1), streak: 5, totalPoints: 90, badges: [], dayStats: { date: today, first: mkFirst(20, 18) } });
  let res = doCheckin(all, p);
  if (!res.ok) fail('打卡测试 正常打卡应成功');
  else {
    eq(res.streak, 6, '连续打卡 6 天');
    eq(res.points, 25, '打卡分 10+10+5');
    eq(res.newBadges, ['坚持者', '小火苗'], '新徽章');
    eq(p.checkin.totalPoints, 115, '总积分');
  }
  // 补打：漏 1 天，今天 40 道全对 → 连续 5+2=7 天，打卡 10 + 连续加成 10 + 正确率 15 = 35 分，标已补打，本月补打 1 次，不计全勤
  p = mkProgress({ lastDate: tstr(-2), streak: 5, totalPoints: 0, badges: [], makeup: { countThisMonth: 0, month: today.slice(0, 7) }, dayStats: { date: today, first: mkFirst(40, 40) } });
  res = doCheckin(all, p);
  if (!res.ok) fail('打卡测试 补打应成功');
  else {
    eq(res.isMakeup, true, '是补打');
    eq(res.streak, 7, '补打后连续 7 天');
    eq(res.points, 35, '补打分 10+10+15');
    eq(p.checkin.makeup.countThisMonth, 1, '本月补打 1 次');
    eq(p.checkin.lastMakeupDate, today, '标已补打');
    eq(p.checkin.weekDays.includes(today), false, '补打不计全勤');
  }
  // 补打次数用完：漏 1 天但本月已补 3 次 → 只能按 20 道打卡，连续天数重算为 1
  p = mkProgress({ lastDate: tstr(-2), streak: 9, totalPoints: 0, badges: [], makeup: { countThisMonth: 3, month: today.slice(0, 7) }, dayStats: { date: today, first: mkFirst(20, 20) } });
  const st = checkinStatus(all, p);
  eq(st.makeupAllowed, false, '补打次数用完不可补打');
  eq(st.freshTarget, 20, '补打次数用完后按 20 道打卡');
  res = doCheckin(all, p);
  if (!res.ok) fail('打卡测试 补打次数用完仍可打卡（重算）');
  else { eq(res.isMakeup, false, '不是补打'); eq(res.streak, 1, '连续天数重算为 1'); }
  // 漏 2 天没补 → 断签重算
  p = mkProgress({ lastDate: tstr(-3), streak: 10, totalPoints: 0, badges: [], dayStats: { date: today, first: mkFirst(20, 20) } });
  res = doCheckin(all, p);
  if (!res.ok) fail('打卡测试 漏 2 天仍可打卡（重算）');
  else eq(res.streak, 1, '漏 2 天断签重算为 1');
  // 今天已打过 → 不能再打；有错题没清 → 不能打
  p = mkProgress({ lastDate: today, streak: 3, totalPoints: 0, badges: [], dayStats: { date: today, first: mkFirst(20, 20) } });
  eq(checkinStatus(all, p).canCheckin, false, '今天已打过不能再打');
  p = mkProgress({ lastDate: tstr(-1), streak: 3, totalPoints: 0, badges: [], dayStats: { date: today, first: mkFirst(20, 20) } });
  p.banks = { [q2.id]: { wrongCount: 1, srs: { stage: 0, due: today }, done: true, correct: false, wrong: true } };
  eq(checkinStatus(all, p).canCheckin, false, '有错题没清不能打卡');
  eq(clearWrongList(all, p).length, 1, '待清错题 1 道');
  // 每周全勤：本周一到周六已打 6 天，今天周日打卡满 7 天 → +30（只在周日测；平时跳过）
  const monday = wkOf(today);
  const sixDays = [0, 1, 2, 3, 4, 5].map(i => addD(monday, i));
  if (sixDays[5] < today) {
    p = mkProgress({ lastDate: sixDays[5], streak: 6, totalPoints: 0, badges: [], weekKey: monday, weekDays: sixDays, weekFull: false, dayStats: { date: today, first: mkFirst(20, 20) } });
    res = doCheckin(all, p);
    if (!res.ok) fail('打卡测试 周日全勤打卡应成功');
    else { eq(res.breakdown.weekBonus, 30, '每周全勤 +30'); eq(p.checkin.weekFull, true, '全勤达成'); }
  }
  // 跨周：上周的全勤记录不带到本周
  p = mkProgress({ lastDate: tstr(-1), streak: 2, totalPoints: 0, badges: [], weekKey: '2000-01-03', weekDays: ['2000-01-03', '2000-01-04', '2000-01-05', '2000-01-06', '2000-01-07', '2000-01-08'], weekFull: true, dayStats: { date: today, first: mkFirst(20, 20) } });
  res = doCheckin(all, p);
  if (!res.ok) fail('打卡测试 跨周打卡应成功');
  else { eq(res.breakdown.weekBonus, 0, '跨周不算全勤'); eq(p.checkin.weekFull, false, '跨周全勤重置'); eq(p.checkin.weekDays, [today], '跨周 weekDays 重置'); }
  // 周日小测：本周错题排在前面，凑满 20 道
  {
    const { sundayMock } = sandbox;
    const wq = banks.daode.questions.slice(0, 2);
    const pp = { banks: {}, checkin: {} };
    for (const q of wq) pp.banks[q.id] = { done: true, correct: false, wrong: true, wrongCount: 1, lastAt: Date.now(), srs: { stage: 0, due: today } };
    const mock = sundayMock(all, pp);
    if (mock.length !== 20) fail(`打卡测试 周日小测应为 20 道，实际 ${mock.length}`);
    if (!wq.every(q => mock.slice(0, 5).some(m => m.id === q.id))) fail('打卡测试 周日小测应把本周错题排在前面');
  }
  console.log('打卡 / 积分 / 补打规则检查通过');
}

// 复用现有本机数据时，预览、重复练习和薄弱章不能混入新题计划。
{
  const { recordAnswer, recordReveal, loadProgress, saveProgress, checkinStatus, allQuestions, todayStr } = sandbox;
  const stage = '7-up';
  const [first, second] = buildQueue(stage, banks, { banks: {} });
  const progress = { banks: { [first.id]: { done: true, correct: true, attempts: 1, revealed: true } } };
  if (applyMode([first, second], 'random20', progress).some(q => q.id === first.id)) fail('20 道新题抽到了之前已答过的题');
  saveProgress(progress);
  recordAnswer(first, first.answer, true, { mode: 'all' });
  if (checkinStatus(allQuestions(banks, subjects), loadProgress()).freshDone !== 0) fail('重复回答了旧题，今日新题数不应增加');
  if (loadProgress().banks[first.id].revealed) fail('提交答案后仍被计作仅预览');
  if (typeof recordReveal !== 'function') fail('缺少保留已作答结果的查看答案逻辑');
  else {
    recordReveal(first.id);
    recordReveal(second.id);
    const saved = loadProgress();
    if (!saved.banks[first.id].correct || saved.banks[first.id].revealed) fail('再次查看答案覆盖了真实作答结果');
    if (!applyMode([second], 'unfinished', saved).length) fail('仅查看答案的新题应仍可继续练习');
    recordAnswer(second, second.answer, true, { mode: 'random20' });
    if (loadProgress().checkin.dayStats.first[second.id] !== 1) fail('预览后第一次正式作答应计入新题');
  }
  const weak = { banks: Object.fromEntries(banks.dili.questions.slice(0, 3).map(q => [q.id, { done: true, correct: false }])) };
  if (buildQueue('9-up', banks, weak).some(q => q.subject === 'dili')) fail('薄弱章节不应把地理插入初三队列');

  // 老版本的学习日期与题目进度来自两个键。导入时只写入一个完整快照。
  const { createProgressBackup, readProgressBackup } = sandbox;
  if (!createProgressBackup || !readProgressBackup) fail('缺少可迁移的进度备份');
  else {
    const legacy = { banks: { [first.id]: { done: true, correct: true, favorite: true, attempts: 1 } }, stage: '8-down', resumeByStage: { '8-down': first.id }, checkin: { totalPoints: 38, streak: 2 } };
    saveProgress(legacy);
    store['xiaosimen-growth-v1'] = JSON.stringify({ studyDays: [todayStr()] });
    const backup = createProgressBackup();
    const restored = readProgressBackup(JSON.stringify(backup));
    if (JSON.stringify(restored) !== JSON.stringify({ ...legacy, studyDays: [todayStr()] })) fail('备份恢复丢失旧版学习日期、做题位置或打卡进度');
    try {
      readProgressBackup(JSON.stringify({ ...backup, progress: { ...legacy, checkin: { streak: '<img>' }, studyDays: [] } }));
      fail('导入接受了无效的打卡字段');
    } catch { /* 应拒绝格式损坏的备份 */ }
  }
}

// ---- 主观题 / 填空题：data/subjective-<科目>.js 展开后逐题校验 ----
{
  const { expandSubjective, blankMatches, essayHits } = sandbox;
  if (typeof expandSubjective !== 'function') fail('app.js 里没有 expandSubjective 函数');
  else {
    const subjIds = new Set();
    let essayN = 0, blankN = 0, realN = 0;
    for (const s of subjects) {
      const w = loadDataFile(`data/subjective-${s}.js`);
      const raw = w.XIAOSIMEN_SUBJECTIVE && w.XIAOSIMEN_SUBJECTIVE[s];
      if (!Array.isArray(raw) || !raw.length) { fail(`${s}: 主观题文件为空`); continue; }
      const list = expandSubjective(s, raw, banks[s].chapters);
      for (const q of list) {
        if (subjIds.has(q.id) || allIds.has(q.id)) fail(`主观题 id 重复: ${q.id}`);
        subjIds.add(q.id);
        if (!q.chapter) fail(`${q.id}: 章节 ${q.chapterId} 不存在`);
        if (STAGE_GRADE[q.stage] !== q.grade) fail(`${q.id}: grade/stage 不匹配`);
        if (!q.explanation) fail(`${q.id}: 缺 exp 解析`);
        if (!q.stem || !q.stem.trim()) fail(`${q.id}: 题干为空`);
        if (q.type === 'blank') {
          blankN++;
          const slots = q.stem.split('____').length - 1;
          if (!slots || slots !== q.blanks.length) fail(`${q.id}: 空格数 ${slots} 与答案数 ${q.blanks.length} 不一致`);
          q.blanks.forEach((alts, i) => {
            if (!alts.every(a => a.trim())) fail(`${q.id}: 第 ${i + 1} 空有空答案`);
            if (!blankMatches(alts[0], alts)) fail(`${q.id}: 标准答案自己判不对`);
          });
          if (/_{5,}/.test(q.stem) || /_{1,3}(?!_)/.test(q.stem.replace(/____/g, ''))) fail(`${q.id}: 题干里有不是 4 个下划线的空`);
        } else if (q.type === 'essay') {
          essayN++;
          if (/中考/.test(q.source)) realN++;
          if (!q.source) fail(`${q.id}: 缺 src 出处`);
          if (!q.points.length) fail(`${q.id}: 没有得分点`);
          for (const p of q.points) if (!(p.score > 0) || !p.text) fail(`${q.id}: 得分点格式不对`);
          const m = q.stem.match(/（(\d+)分）/);
          if (m && Number(m[1]) !== q.score) fail(`${q.id}: 题干写 ${m[1]} 分，得分点合计 ${q.score} 分`);
          if (!m) fail(`${q.id}: 题干末尾缺“（N分）”`);
          // 把所有得分点原文当作答案，关键词应全部命中
          const hits = essayHits(q, q.points.map(p => p.text).join('；'));
          q.points.forEach((p, i) => { if (p.keys.length && !hits[i]) fail(`${q.id}: 第 ${i + 1} 个得分点的关键词在得分点原文里一个都没有`); });
        } else fail(`${q.id}: 未知主观题类型 ${q.type}`);
      }
      console.log(`主观题 ${s}: 论述/材料 ${list.filter(q => q.type === 'essay').length} 道，填空 ${list.filter(q => q.type === 'blank').length} 道`);
    }
    console.log(`主观题合计: ${essayN} 道（其中福建中考真题小问 ${realN} 道）+ 填空 ${blankN} 道`);
  }
}

console.log('\n--- 每门每学期题数 ---');
for (const s of subjects) {
  console.log(`${s}: ` + ['7-up', '7-down', '8-up', '8-down', '9-up', '9-down'].map(st => `${st}=${stats[s][st] || 0}`).join(' '));
}
const total = subjects.reduce((a, s) => a + (banks[s] ? banks[s].questions.length : 0), 0);
console.log(`合计: ${total} 道 + 每日一题 ${daily ? daily.questions.length : 0} 道`);

if (errors.length) {
  console.error(`\nFAIL: ${errors.length} 个错误`);
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
} else {
  console.log('\nPASS: 全部校验通过');
}
