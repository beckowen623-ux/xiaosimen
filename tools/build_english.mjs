// 把 english-src/papers/*.json（Claude 逐题录入、核对答案并写好解析的英语真题）
// 转成全国真题栏目用的题目文件 data/national/<id>.js，并合并进 data/national-catalog.js。
// 用法：node tools/build_english.mjs
// 注意：tools/import_national_exams.py 会重写目录，重跑它之后要再跑一次本脚本。
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = fileURLToPath(new URL("../", import.meta.url));
const srcDir = join(root, "english-src", "papers");
const LETTERS = ["A", "B", "C", "D", "E", "F", "G"];
// 被更完整的版本取代的旧条目（拼写有误、选项是占位文字），从目录里撤下。
const RETIRED = new Set(["hn-changsha-2024-english"]);

const esc = text => String(text ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
function passageHtml(passage, title) {
  const body = String(passage).split("\n").map(line => line.trim()).filter(Boolean)
    .map(line => `<p>${esc(line).replace(/\((\d{1,3})\)/g, '<b class="gap">$1</b>')}</p>`).join("");
  return (title ? `<p class="reading-title">${esc(title)}</p>` : "") + body;
}

function build(paper) {
  const out = [];
  const base = (n, section, extra = {}) => ({
    id: `national-${paper.id}-q${String(n).padStart(2, "0")}`,
    national: true, subject: paper.subject || "english", subjectLabel: paper.subjectLabel || "英语", paperId: paper.id, number: n,
    ...(paper.claude ? { claude: true, meta: "Claude 模拟卷" } : {}),
    section, chapter: paper.title, grade: "九下", stage: "9-down",
    source: paper.numbering?.[n] ? `${paper.title} ${paper.numbering[n]}` : `${paper.title} 第 ${n} 题`, ...extra,
  });
  const choice = (item, section, extra) => ({
    ...base(item.n, section, extra), type: "single",
    options: item.options.map((text, i) => ({ key: LETTERS[i], text })),
    answer: [item.answer], explanation: item.exp, kp: item.kp || "",
    ...(item.image ? { image: item.image } : {}),
  });
  for (const section of paper.sections) {
    const t = section.type;
    if (t === "单项选择") {
      for (const item of section.items) out.push({ ...choice(item, t), stem: item.stem });
    } else if (section.passage && (section.choices || section.items.every(item => item.options))) {
      // 完形填空、语法选择（每空自带选项）；七选五、补全对话、配对阅读（共用一组选项）。
      const groupId = `${paper.id}-${section.choices ? "pick" : "cloze"}-${section.items[0].n}`;
      const materialHtml = passageHtml(section.passage, section.title);
      const prompt = { "七选五": "选出最合适的一句", "补全对话": "选出最合适的一句", "配对阅读": "选出对应的例子" }[t];
      for (const item of section.items) {
        const options = section.choices || item.options;
        out.push({ ...choice({ ...item, options }, t, { groupId, materialHtml }),
          stem: prompt ? `第 ${item.n} 空：${prompt}` : `第 ${item.n} 空填哪个？` });
      }
    } else if (t === "回答问题") {
      const groupId = `${paper.id}-answer-${section.items[0].n}`;
      const materialHtml = passageHtml(section.passage, section.title);
      for (const item of section.items) {
        out.push({ ...base(item.n, t, { groupId, materialHtml }), type: "essay", meta: "回答问题", material: "", stem: item.stem,
          points: [{ text: `参考：${item.answer}`, score: 2, keys: [] }], score: 2, sample: item.answer,
          method: "先在原文里找到对应的句子，再用完整、语法正确的句子作答，首字母大写、句末加标点。", answer: [], explanation: item.exp });
      }
    } else if (t === "阅读理解") {
      for (const group of section.groups) {
        const groupId = `${paper.id}-reading-${group.label}`;
        const materialHtml = passageHtml(group.passage, `${group.label} · ${group.title || ""}`);
        for (const item of group.items) out.push({ ...choice(item, t, { groupId, materialHtml }), stem: item.stem });
      }
    } else if (t === "短文填空") {
      const groupId = section.groupId || `${paper.id}-fill`;
      const materialHtml = passageHtml(section.passage, section.title);
      for (const item of section.items) {
        const alts = String(item.answer).split("/").map(s => s.trim()).filter(Boolean);
        out.push({ ...base(item.n, t, { groupId, materialHtml }), type: "blank",
          stem: `第 ${item.n} 空：____${item.hint ? `（${item.hint}）` : ""}`,
          blanks: [alts], answer: [alts[0]], explanation: item.exp, kp: item.kp || "" });
      }
    } else if (t === "解答题") {
      for (const item of section.items) {
        out.push({ ...base(item.n, t), type: "essay", meta: "解答题", material: "", stem: item.stem,
          points: item.points.map(([text, score]) => ({ text, score, keys: [] })), score: item.points.reduce((s, [, v]) => s + v, 0),
          sample: item.answer, method: item.method || "先写已知和所求，再列式计算，每一步写清依据，最后写结论。", answer: [], explanation: item.exp,
          kp: item.kp || "", ...(item.image ? { image: item.image } : {}) });
      }
    } else if (t === "古诗文默写" || t === "填空题") {
      for (const item of section.items) {
        const alts = String(item.answer).split(/\s\/\s/).map(s => s.trim()).filter(Boolean); // 用“ / ”分隔多个答案，3/5 这样的分数不拆
        out.push({ ...base(item.n, t), type: "blank", stem: `第 ${item.n} 题：${item.stem}`,
          blanks: [alts], answer: [alts[0]], explanation: item.exp, kp: item.kp || "", ...(item.image ? { image: item.image } : {}) });
      }
    } else if (t === "情景交际" || t === "句子运用") {
      for (const item of section.items) {
        out.push({ ...base(item.n, t), type: "essay", meta: t, material: "", stem: item.stem,
          points: [{ text: `参考：${item.answer}`, score: 2, keys: [] }], score: 2,
          sample: item.answer, method: t === "句子运用" ? "先判断句子结构、时态和固定搭配，按题目限定的词数作答。" : "先看答语再补问句：答语给了什么信息（时间、距离、地点……），就用对应的疑问词提问。",
          answer: [], explanation: item.exp });
      }
    } else if (t === "书面表达") {
      out.push({ ...base(section.n, t), type: "essay", meta: "书面表达", material: "", stem: section.prompt,
        points: section.points.map(([text, score]) => ({ text, score, keys: [] })), score: section.score,
        sample: section.sample, method: "先列提纲：要点逐条写全 → 用 First / Then / After that / Finally 串起来 → 结尾写感受。注意时态和人称。",
        answer: [], explanation: section.exp || "" });
    } else {
      throw new Error(`${paper.id}: 未知题型 ${t}`);
    }
  }
  const ids = new Set();
  for (const q of out) {
    if (ids.has(q.id)) throw new Error(`${paper.id}: 题号重复 ${q.number}`);
    ids.add(q.id);
    if (q.type === "single" && !q.options.some(o => o.key === q.answer[0])) throw new Error(`${paper.id} 第 ${q.number} 题答案不在选项里`);
    if (q.type === "single" && q.options.some(o => !o.text)) throw new Error(`${paper.id} 第 ${q.number} 题有空选项`);
  }
  return out;
}

const sandbox = { window: {} };
vm.createContext(sandbox);
const catalogPath = join(root, "data", "national-catalog.js");
vm.runInContext(readFileSync(catalogPath, "utf8"), sandbox);
const catalog = sandbox.window.NATIONAL_CATALOG;
catalog.papers = catalog.papers.filter(p => !RETIRED.has(p.id));

const built = [];
for (const file of readdirSync(srcDir).filter(f => f.endsWith(".json")).sort()) {
  const paper = JSON.parse(readFileSync(join(srcDir, file), "utf8"));
  const questions = build(paper);
  writeFileSync(join(root, "data", "national", `${paper.id}.js`),
    `// 由 tools/build_english.mjs 生成，源文件 english-src/papers/${file}，请勿手改。\nwindow.NATIONAL_PAPERS = window.NATIONAL_PAPERS || {};\nwindow.NATIONAL_PAPERS[${JSON.stringify(paper.id)}] = ${JSON.stringify(questions, null, 1)};\n`);
  const counts = {};
  for (const q of questions) counts[q.section] = (counts[q.section] || 0) + 1;
  const old = catalog.papers.find(p => p.id === paper.id) || {};
  const entry = { ...old, id: paper.id, subject: paper.subject || "english", subjectLabel: paper.subjectLabel || "英语", region: paper.region, year: paper.year,
    ...(paper.claude ? { claude: true } : {}),
    title: paper.title, source: paper.source, description: `整卷 ${questions.length} 题${paper.note ? "（" + paper.note.replace(/。$/, "") + "）" : ""}`,
    questionCount: questions.length, data: `./data/national/${paper.id}.js`, sections: counts };
  catalog.papers = [...catalog.papers.filter(p => p.id !== paper.id), entry];
  built.push(`${paper.id}: ${questions.length} 题 ${JSON.stringify(counts)}`);
}
// 英语排在前面，同科按年份新到旧、福建优先。
const order = s => (s === "english" ? 0 : 1);
catalog.papers.sort((a, b) => order(a.subject) - order(b.subject) || b.year - a.year || (a.region === "福建" ? -1 : b.region === "福建" ? 1 : 0));
writeFileSync(catalogPath, "window.NATIONAL_CATALOG = " + JSON.stringify(catalog, null, 2) + ";\n");
console.log(built.join("\n"));
