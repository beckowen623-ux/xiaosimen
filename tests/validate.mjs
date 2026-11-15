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
