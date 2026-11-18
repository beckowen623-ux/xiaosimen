import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const base = '52a3aec'; // 升级前的已发布版本，固定旧题、旧记录键的兼容基线。
function load(code) { const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(code, ctx); return ctx.window; }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function old(rel) { return execFileSync('git', ['show', `${base}:${rel}`], { cwd: root, encoding: 'utf8', maxBuffer: 12e6 }); }
for (const subject of ['daode', 'lishi', 'dili', 'shengwu']) {
  const file = `data/${subject}.js`;
  const before = load(old(file)).XIAOSIMEN_BANKS[subject].questions;
  const after = load(read(file)).XIAOSIMEN_BANKS[subject].questions;
  assert.ok(after.length >= before.length);
  for (let i = 0; i < before.length; i++) {
    // 章节名、年级、学期只是显示标签（地理生物会考复习章已从“九年级”改归八下），id 和题目内容必须不变。
    const { chapter: previousTitle, grade: g1, stage: s1, ...previous } = before[i];
    const { chapter: currentTitle, grade: g2, stage: s2, ...current } = after[i];
    assert.equal(JSON.stringify(current), JSON.stringify(previous), `${subject} 旧题被改动：${before[i].id}`);
  }
  assert.ok(read(`data/subjective-${subject}.js`).replace(/\r\n/g, '\n') === old(`data/subjective-${subject}.js`), `${subject} 原有主观题不变`);
}
for (const id of ['fj-2025-english', 'fj-2026-english', 'gd-2025-english']) {
  const file = `data/national/${id}.js`;
  assert.ok(read(file).replace(/\r\n/g, '\n') === old(file), `${id} 已发布题目不可变化`);
}
const ctx = { window: { addEventListener() {} }, console };
vm.createContext(ctx);
ctx.document = {
  createElement() { return {}; },
  head: { appendChild(script) {
    const relative = script.src.split('?')[0].replace(/^\.\//, '');
    vm.runInContext(read(relative), ctx);
    script.onload();
  } },
};
let code = read('national-exams.js').replace('window.NationalExams =',
  'window.__upgradeTest = { getCatalog, getQuestions, ENGLISH_TYPES }; window.NationalExams =');
vm.runInContext(code, ctx);
const api = ctx.window.__upgradeTest;
const catalog = await api.getCatalog();
const english = catalog.filter(p => p.subject === 'english' && p.data && !p.claude);
assert.equal(english.length, 15);
let total = 0;
const previewGroups = new Map();
for (const paper of english) {
  const list = await api.getQuestions(paper);
  assert.equal(list.length, paper.questionCount);
  total += list.length;
  const counts = {};
  for (const q of list) {
    assert.ok(q.stem && q.explanation, q.id);
    counts[q.section] = (counts[q.section] || 0) + 1;
    if (q.type === 'single') {
      assert.ok(q.options.length >= 2 && q.options.length <= 7, q.id);
      assert.ok(q.options.some(o => o.key === q.answer[0]), q.id);
    }
    if (['完形填空', '语法选择', '短文填空'].includes(q.section)) {
      assert.ok(q.materialHtml.includes(`class="gap">${q.number}</b>`), `${q.id} 当前空未标记`);
    }
    if (q.preview) {
      assert.notEqual(q.section, '书面表达');
      if (!previewGroups.has(q.section)) previewGroups.set(q.section, new Set());
      previewGroups.get(q.section).add(q.groupId || q.paperId);
    }
  }
  assert.equal(JSON.stringify(counts), JSON.stringify(paper.sections));
}
assert.equal(total, 847);
for (const [type] of api.ENGLISH_TYPES) {
  if (type === '书面表达') continue;
  assert.equal(previewGroups.get(type)?.size, 1, `${type} 只能免费试一组`);
}
// 精编模拟卷（英语、语文）：整卷可加载、每题有解析，免费只开放前 5 题。
const claudePapers = catalog.filter(p => p.claude);
assert.ok(claudePapers.length >= 4, '精编模拟卷应至少 4 套');
for (const paper of claudePapers) {
  const list = await api.getQuestions(paper);
  assert.equal(list.length, paper.questionCount);
  assert.ok(list.every(q => q.stem && (q.explanation || q.type === 'essay') && q.claude), paper.id);
  assert.equal(list.filter(q => q.preview).length, 5, `${paper.id} 免费题应为 5 道`);
}
assert.equal(read('referrals.js'), fs.readFileSync(path.join(root, '../quiz-bank-app/referrals.js'), 'utf8'));
console.log('PASS: 2400 道旧题、原有主观题、185 道已发布英语题不变；847 道英语及目录匹配；每题型一组试用、作文付费。');
