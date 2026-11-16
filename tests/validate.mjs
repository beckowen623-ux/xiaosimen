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

// ---- 配图校验：data/figures.js + data/figures-2.js（base64 data URI，按题 id 映射） ----
// figures.js 已接近单次推送上限（约 5 MB），新增图放 figures-2.js；两文件在同一个沙箱里合并进 window.XIAOSIMEN_FIGURES。
function loadFigures() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  for (const rel of ['data/figures.js', 'data/figures-2.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
  }
  return sandbox.window;
}
const figW = loadFigures();
const figures = figW.XIAOSIMEN_FIGURES;
if (!figures || typeof figures !== 'object') fail('data/figures.js 缺 window.XIAOSIMEN_FIGURES');
else {
  const figRe = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
  let figCount = 0;
  for (const s of subjects) {
    for (const q of banks[s].questions) {
      if (q.image === true) {
        figCount++;
        const src = figures[q.id];
        if (!src) fail(`${q.id}: 有 image 字段但 figures 里没有对应图`);
        else if (typeof src !== 'string' || !figRe.test(src)) fail(`${q.id}: figures 里 data URI 格式不对`);
      } else if (q.image !== undefined) fail(`${q.id}: image 字段应为 true`);
    }
  }
  for (const fid of Object.keys(figures)) {
    if (!allIds.has(fid)) fail(`figures 里有多余的图 ${fid}（题库中无此题）`);
  }
  const figBytes = fs.statSync(path.join(root, 'data/figures.js')).size + fs.statSync(path.join(root, 'data/figures-2.js')).size;
  const dataBytes = subjects.reduce((a, s) => a + fs.statSync(path.join(root, `data/${s}.js`)).size, 0);
  const totalBytes = figBytes + dataBytes;
  console.log(`figures: ${Object.keys(figures).length} 张图（${figCount} 道题带图），figures.js + figures-2.js ${(figBytes / 1024).toFixed(0)} KB；四科 data + figures 合计 ${(totalBytes / 1048576).toFixed(2)} MB（上限 12 MB）`);
  if (totalBytes > 12 * 1048576) fail(`四科 data + figures 合计超 12 MB：${(totalBytes / 1048576).toFixed(2)} MB`);
}

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
  eq(r.rec.srs.stage, 1, '订正答对进第 2 级');
  // SRS 四级走完才掌握：错 1 次后连续答对 4 次
  recordAnswer(q3, [q3.options.find(o => !q3.answer.includes(o.key)).key], false, { mode: 'all' });
  for (let i = 0; i < 4; i++) {
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
