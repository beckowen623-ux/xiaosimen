// 生成邀请奖励“冲刺卷”：每科每册一套 = 15 道题库真题选择题 + 5 道考点冲刺题 + 主观题。
// 输出 functions/_sprint.js（只经 /api/access/sprint 发给邀请达标的买家，不作为静态文件公开）。
// 用法：node tools/build_sprint.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = fileURLToPath(new URL("../", import.meta.url));
const SUBJECTS = [["daode", "道德与法治"], ["lishi", "历史"], ["dili", "地理"], ["shengwu", "生物"]];
const TERMS = ["七年级上册", "七年级下册", "八年级上册", "八年级下册", "九年级上册", "九年级下册"];
const BANK_COUNT = 15;
// 九年级地理、生物是总复习：复用七、八年级的考点冲刺题。
const REVIEW_SOURCES = { 5: [[1, 3], [2, 2]], 6: [[3, 3], [4, 2]] };

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const [key] of SUBJECTS) {
  for (const file of [`${key}.js`, `subjective-${key}.js`]) {
    vm.runInContext(readFileSync(join(root, "data", file), "utf8"), sandbox, { filename: file });
  }
}
const banks = sandbox.window.XIAOSIMEN_BANKS;
const subjective = sandbox.window.XIAOSIMEN_SUBJECTIVE;
const authored = JSON.parse(readFileSync(join(root, "sprint", "new-questions.json"), "utf8"));
const figures = new Set();
try {
  for (const file of ["figures.js", "figures-2.js"]) vm.runInContext(readFileSync(join(root, "data", file), "utf8"), sandbox);
  Object.keys(sandbox.window.XIAOSIMEN_FIGURES || {}).forEach(id => figures.add(id));
} catch {
  // 没有配图数据时，仍按题干文字过滤看图题。
}

const LETTERS = ["A", "B", "C", "D"];
const PROVINCES = /北京|天津|上海|重庆|福建|江苏|浙江|安徽|江西|山东|河南|湖北|湖南|广东|广西|海南|四川|贵州|云南|西藏|陕西|甘肃|青海|宁夏|新疆|内蒙古|黑龙江|吉林|辽宁|河北|山西/;
const FUJIAN_PLACES = /福州|厦门|宁化|泉州|漳州|莆田|三明|南平|龙岩|宁德/;
// 题目标签直接写出处：2025 福建中考、改编自 2025 四川中考、2025 江苏模考……
function sourceTag(source) {
  const text = String(source || "");
  const year = text.match(/(20\d\d)/)?.[1];
  if (!year) return "Claude 精选";
  const place = text.match(PROVINCES)?.[0] || (FUJIAN_PLACES.test(text) ? "福建" : "");
  const kind = /模|期中|期末|适应性|最后一卷|联考|预测/.test(text) ? "模考" : /中考|学业水平/.test(text) ? "中考" : "考题";
  return `${/改编/.test(text) ? "改编自 " : ""}${year} ${place}${kind}`;
}
const yearOf = q => Number((q.source || "").match(/(20\d\d)/)?.[1] || 0);
const needsPicture = q => figures.has(q.id) || /如图|下图|图中|读图|示意图|图示|据图|观察图|右图|左图|上图/.test(q.stem || "");

function pickBank(subject, chapterId) {
  const pool = banks[subject].questions.filter(q => q.chapterId === chapterId && q.type === "single" &&
    Array.isArray(q.options) && q.options.length === 4 && q.answer?.length === 1 && !needsPicture(q));
  // 近年的真题优先，再在整册里均匀取，尽量覆盖不同单元。
  const sorted = [...pool].sort((a, b) => yearOf(b) - yearOf(a) || a.number - b.number);
  const recent = sorted.slice(0, Math.max(BANK_COUNT * 3, 45)).sort((a, b) => a.number - b.number);
  const step = recent.length / BANK_COUNT;
  const chosen = [];
  for (let i = 0; i < BANK_COUNT && i * step < recent.length; i += 1) chosen.push(recent[Math.floor(i * step)]);
  return chosen.map(q => ({
    type: "choice", tag: sourceTag(q.source), source: q.source || "",
    stem: q.stem, options: q.options.map(o => ({ key: o.key, text: o.text })),
    answer: q.answer[0], explanation: q.explanation || "",
  }));
}

function authoredFor(subject, chapterId) {
  const table = authored[subject] || {};
  const sources = table[chapterId] ? [[chapterId, table[chapterId].length]] : REVIEW_SOURCES[chapterId] || [];
  return sources.flatMap(([from, count]) => (table[from] || []).slice(0, count));
}

let rotation = 0;
function toChoice([kp, stem, options, explanation]) {
  if (options.length !== 4) throw new Error(`${kp}: 需要 4 个选项`);
  // options[0] 是正确答案，轮换到 A–D 不同位置。
  const shift = rotation++ % 4;
  const ordered = options.map((text, i) => ({ text, correct: i === 0 }));
  const rotated = [...ordered.slice(4 - shift), ...ordered.slice(0, 4 - shift)];
  return {
    type: "choice", tag: "Claude 新题 · 易错点", kp,
    stem, options: rotated.map((o, i) => ({ key: LETTERS[i], text: o.text })),
    answer: LETTERS[rotated.findIndex(o => o.correct)], explanation,
  };
}

function subjectiveFor(subject, chapterId) {
  let list = (subjective[subject] || []).filter(item => item.c === chapterId);
  if (!list.length && REVIEW_SOURCES[chapterId]) {
    // 总复习册：从对应的七、八年级各借一道主观题、一道填空（取靠后的题，避免与该册冲刺卷重复）。
    list = REVIEW_SOURCES[chapterId].flatMap(([from]) => {
      const source = (subjective[subject] || []).filter(item => item.c === from);
      const essays = source.filter(item => Array.isArray(item.p));
      const blanks = source.filter(item => typeof item.b === "string");
      return [essays[2] || essays.at(-1), blanks[3] || blanks.at(-1)].filter(Boolean);
    });
  }
  const essays = list.filter(item => Array.isArray(item.p)).slice(0, 2).map(item => ({
    type: "essay", tag: /20\d\d/.test(item.src || "") ? sourceTag(item.src) : (item.m || "主观题"), source: item.src || "", kind: item.m || "简答题",
    material: item.mat || "", stem: item.q,
    points: item.p.map(([text, score]) => ({ text, score })),
    score: item.p.reduce((sum, [, score]) => sum + score, 0),
    sample: item.ex || "", explanation: item.exp || "",
  }));
  const blanks = list.filter(item => typeof item.b === "string").slice(0, essays.length ? 3 : 5).map(item => ({
    type: "blank", stem: item.b, answer: item.a.map(alt => alt.split("|")[0]), explanation: item.exp || "",
  }));
  return { essays, blanks };
}

const papers = [];
for (const [subject, label] of SUBJECTS) {
  for (let chapterId = 1; chapterId <= 6; chapterId += 1) {
    const bank = pickBank(subject, chapterId);
    const fresh = authoredFor(subject, chapterId).map(toChoice);
    const { essays, blanks } = subjectiveFor(subject, chapterId);
    const sections = [{ title: "一、选择题", note: "每题只有一个正确答案。", items: [...bank, ...fresh] }];
    if (blanks.length) sections.push({ title: "二、填空速记", items: blanks });
    if (essays.length) sections.push({ title: blanks.length ? "三、主观题" : "二、主观题", note: "先自己写，再对照得分点给自己打分。", items: essays });
    papers.push({
      id: `xiaosimen-${subject}-${chapterId}`, group: label, subject: label, term: TERMS[chapterId - 1],
      title: `${label} · ${TERMS[chapterId - 1]} 冲刺卷`,
      counts: { choice: bank.length + fresh.length, fresh: fresh.length, blank: blanks.length, essay: essays.length },
      sections,
    });
  }
}

const header = "// 由 tools/build_sprint.mjs 生成，请勿手改。冲刺卷只通过 /api/access/sprint 发给邀请达标的买家。\n";
writeFileSync(join(root, "functions", "_sprint.js"), header + "export const SPRINT_PAPERS = " + JSON.stringify(papers) + ";\n");
for (const p of papers) console.log(p.title.padEnd(22), JSON.stringify(p.counts));
console.log(`共 ${papers.length} 套，${(JSON.stringify(papers).length / 1024).toFixed(0)} KB`);
