// 把 knowledge-src/<科目>/<学期>-*.json（知识点卡片 + 分层练习题）构建成页面用的数据：
//   data/knowledge-<科目>-<学期>.js   某学期全部知识点、卡片、新题，以及按知识点归位的旧题（同一题 id，做题记录共用）
//   data/knowledge-index.js            各科各学期的章节、知识点数量（首页和“知识点补缺”页先加载这个小文件）
// 用法：node tools/build_knowledge.mjs
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = fileURLToPath(new URL("../", import.meta.url));
const SEMESTERS = [
  { key: "7a", stage: "7-up", label: "初一上学期", unitPrefix: "七上" },
  { key: "7b", stage: "7-down", label: "初一下学期", unitPrefix: "七下" },
  { key: "8a", stage: "8-up", label: "初二上学期", unitPrefix: "八上" },
  { key: "8b", stage: "8-down", label: "初二下学期", unitPrefix: "八下" },
  { key: "9a", stage: "9-up", label: "初三上学期", unitPrefix: "九上", altPrefixes: ["九年级", "第一单元", "第二单元", "第三单元", "第四单元", "第五单元", "第六单元", "第七单元"] },
  { key: "9b", stage: "9-down", label: "初三下学期", unitPrefix: "九下", altPrefixes: ["九年级", "第八单元", "第九单元", "第十单元", "第十一单元", "第十、十一单元", "第十二单元"] },
  { key: "sp", stage: "special", label: "专题与压轴", unitPrefix: "专题" },
];
const SUBJECTS = { math: "数学", physics: "物理", chemistry: "化学" };
const LETTERS = ["A", "B", "C", "D"];
const LEVEL = { 1: "基础", 2: "提高", 3: "拓展" };
// 配图：源文件里写 "img": "文件名.svg"，图片放在 assets/knowledge/<科目>/<学期>/ 下
function figure(subject, sem, name, where) {
  if (!name) return null;
  if (!/^[\w.-]+\.(svg|webp|png)$/.test(name)) throw new Error(`${where} 配图文件名不合法：${name}`);
  const rel = `assets/knowledge/${subject}/${sem}/${name}`;
  if (!existsSync(join(root, rel))) throw new Error(`${where} 配图不存在：${rel}`);
  return `./${rel}`;
}

// 旧题：全国真题、同步卷、早鸟卷、精编卷里已标 kp 的题，按 kp 归到知识点下
function loadOldQuestions() {
  const dir = join(root, "data", "national");
  const out = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith(".js"))) {
    const ctx = { window: {} };
    vm.createContext(ctx);
    try { vm.runInContext(readFileSync(join(dir, f), "utf8"), ctx); } catch { continue; }
    for (const qs of Object.values(ctx.window.NATIONAL_PAPERS || {})) out.push(...qs);
  }
  return out;
}

function hash(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// 作者写题时答案容易扎堆在某个字母：解析里不点名选项字母的题，按题目 id 固定地轮换答案位置
function balance(q, slot) {
  if (/(^|[^A-Za-z])[A-D]($|[^A-Za-z])/.test(q.e) || q.o.some(t => /^(图|电路)/.test(t))) return q;
  const correct = LETTERS.indexOf(q.a);
  const others = [0, 1, 2, 3].filter(i => i !== correct);
  const r = hash(q.q);
  if (r % 2) others.reverse();
  const target = slot % 4;
  const order = [];
  for (let pos = 0; pos < 4; pos++) order.push(pos === target ? correct : others.shift());
  return { ...q, o: order.map(i => q.o[i]), a: LETTERS[target] };
}
const SUP = { "²": "^2", "³": "^3", "⁴": "^4", "ⁿ": "^n" };
function blankAlts(text) {
  const alts = String(text).split(/\s\/\s|\|/).map(s => s.trim()).filter(Boolean);
  for (const a of [...alts]) if (/[²³⁴ⁿ]/.test(a)) alts.push(a.replace(/[²³⁴ⁿ]/g, ch => SUP[ch]));
  return [...new Set(alts)];
}

const index = { updated: new Date().toISOString().slice(0, 10), subjects: [] };
const oldQs = loadOldQuestions();
const capstonePath = join(root, "knowledge-src", "capstone-essays.json");
const capstoneEssays = existsSync(capstonePath) ? JSON.parse(readFileSync(capstonePath, "utf8")) : {};

for (const [subject, subjectLabel] of Object.entries(SUBJECTS)) {
  const srcDir = join(root, "knowledge-src", subject);
  const files = existsSync(srcDir) ? readdirSync(srcDir).filter(f => f.endsWith(".json")).sort() : [];
  const subjectIndex = { key: subject, label: subjectLabel, semesters: [] };
  for (const sem of SEMESTERS) {
    const mine = files.filter(f => f.startsWith(sem.key + "-"));
    if (!mine.length) { if ((subject === "physics" && (sem.key === "7a" || sem.key === "7b")) || (subject === "chemistry" && ["7a", "7b", "8a", "8b"].includes(sem.key))) continue; subjectIndex.semesters.push({ key: sem.key, stage: sem.stage, label: sem.label, ready: false }); continue; }
    const chapters = [];
    const questions = [];
    const ids = new Set();
    let slot = 0;
    for (const file of mine) {
      const src = JSON.parse(readFileSync(join(srcDir, file), "utf8"));
      let chapter = chapters.find(c => c.name === src.chapter);
      if (!chapter) { chapter = { id: `${subject}-${sem.key}-c${chapters.length + 1}`, name: src.chapter, unit: src.unit, points: [] }; chapters.push(chapter); }
      for (const p of src.points) {
        const pointId = `${subject}-${sem.key}-${p.id}`;
        if (ids.has(pointId)) throw new Error(`知识点 id 重复：${pointId}`);
        ids.add(pointId);
        for (const key of ["concept", "formula", "pitfall"]) if (!p.card?.[key]?.length) throw new Error(`${pointId} 卡片缺 ${key}`);
        if (!p.card.example?.q || !p.card.example?.a) throw new Error(`${pointId} 卡片缺例题`);
        const exampleImg = figure(subject, sem.key, p.card.example.img, `${pointId} 例题`);
        if (exampleImg) p.card = { ...p.card, example: { ...p.card.example, img: exampleImg } };
        if ((p.qs || []).length < 6) throw new Error(`${pointId} 新题少于 6 道`);
        const extraEssay = capstoneEssays[pointId];
        const allRawQs = extraEssay ? [...p.qs, extraEssay] : p.qs;
        const qids = [];
        allRawQs.forEach((raw, i) => {
          const n = String(i + 1).padStart(2, "0");
          const id = `kp-${pointId}-${n}`;
          if (!raw.q || !raw.e || (!raw.a && !raw.sample)) throw new Error(`${id} 缺题干、答案或解析`);
          const diag = i === p.qs.findIndex(q => q.lv === 2);
          const base = {
            id, subject, subjectLabel, knowledge: true, kpId: pointId, kp: p.name, unit: chapter.unit,
            chapter: `${sem.label} · ${chapter.name}`, source: `知识点精练 · ${sem.label} · ${p.name}（${raw.t === "e" ? "压轴解答" : (LEVEL[raw.lv] || "基础")}）`,
            level: raw.lv || 1, kpFree: raw.t === "e" ? false : (i < 3 || diag), ...(diag ? { kpDiag: true } : {}),
            ...(raw.img ? { image: figure(subject, sem.key, raw.img, id) } : {}),
          };
          if (raw.t === "c") {
            if (!Array.isArray(raw.o) || raw.o.length !== 4 || raw.o.some(t => !String(t).trim())) throw new Error(`${id} 选项应为 4 个且不为空`);
            if (new Set(raw.o).size !== 4) throw new Error(`${id} 选项有重复`);
            if (!LETTERS.includes(raw.a)) throw new Error(`${id} 答案字母不对`);
            const q = balance(raw, slot++);
            questions.push({ ...base, type: "single", stem: q.q, options: q.o.map((text, k) => ({ key: LETTERS[k], text })), answer: [q.a], explanation: q.e });
          } else if (raw.t === "b") {
            const slots = String(raw.q).split(/_{4,}/).length - 1;
            if (slots !== 1) throw new Error(`${id} 填空题应只有 1 个空（现在 ${slots} 个）`);
            if (/[<>＜＞]/.test(raw.a)) throw new Error(`${id} 填空答案含 < > 符号，判分会被吞掉，请改成选择题`);
            const alts = blankAlts(raw.a);
            questions.push({ ...base, type: "blank", stem: raw.q, blanks: [alts], answer: [alts[0]], explanation: raw.e });
          } else if (raw.t === "e") {
            if (!Array.isArray(raw.points) || !raw.points.length) throw new Error(`${id} 解答题缺 points 得分点`);
            const pts = raw.points.map(pt => ({ text: pt.text, score: pt.score, keys: pt.keys || [] }));
            const score = raw.score || pts.reduce((s, x) => s + x.score, 0);
            if (pts.reduce((s, x) => s + x.score, 0) !== score) throw new Error(`${id} 得分点分值之和不等于满分`);
            questions.push({
              ...base,
              type: "essay",
              meta: raw.meta || "解答压轴题",
              stem: raw.q,
              score,
              points: pts,
              method: raw.method || "",
              sample: raw.sample || raw.a,
              explanation: raw.e,
            });
          } else throw new Error(`${id} 未知题型 ${raw.t}`);
          qids.push(id);
        });
        const kpSet = new Set(p.kp || []);
        const prefixes = [sem.unitPrefix, ...(sem.altPrefixes || [])];
        const refs = oldQs.filter(q => q.subject === subject && ((!q.unit && subject === "chemistry") || prefixes.some(pr => String(q.unit || "").startsWith(pr))) && kpSet.has(q.kp))
          .sort((a, b) => String(a.paperId).localeCompare(String(b.paperId)) || a.number - b.number);
        chapter.points.push({ id: pointId, name: p.name, tag: p.tag || "", ...(extraEssay ? { hasEssay: true } : {}), card: p.card, qids, refs: refs.map(q => q.id) });
        for (const q of refs) if (!questions.some(x => x.id === q.id)) questions.push({ ...q, kpId: pointId, kpRef: true });
      }
    }
    // 数学“专题与压轴”优先展示几何/函数压轴模型，把“中考计算保底与防错”放至最后（所有章/点/题 ID 保持不变）
    if (subject === "math" && sem.key === "sp" && chapters.length > 1 && chapters[0].id === "math-sp-c1") {
      chapters.push(chapters.shift());
    }
    const fresh = questions.filter(q => q.knowledge);
    const dist = {};
    for (const q of fresh.filter(q => q.type === "single")) dist[q.answer[0]] = (dist[q.answer[0]] || 0) + 1;
    const data = { subject, semester: sem.key, stage: sem.stage, label: sem.label, chapters, questions };
    writeFileSync(join(root, "data", `knowledge-${subject}-${sem.key}.js`),
      `// 由 tools/build_knowledge.mjs 生成，源文件 knowledge-src/${subject}/${sem.key}-*.json，请勿手改。\nwindow.KNOWLEDGE_DATA = window.KNOWLEDGE_DATA || {};\nwindow.KNOWLEDGE_DATA[${JSON.stringify(`${subject}-${sem.key}`)}] = ${JSON.stringify(data)};\n`);
    const pointCount = chapters.reduce((s, c) => s + c.points.length, 0);
    subjectIndex.semesters.push({ key: sem.key, stage: sem.stage, label: sem.label, ready: true,
      chapters: chapters.map(c => ({ name: c.name, points: c.points.map(p => ({ id: p.id, name: p.name, tag: p.tag, ...(p.hasEssay ? { hasEssay: true } : {}), ids: [...p.qids, ...p.refs] })) })),
      pointCount, questionCount: questions.length });
    console.log(`${subject}-${sem.key}: ${chapters.length} 章 ${pointCount} 个知识点，新题 ${fresh.length} 道（单选答案分布 ${JSON.stringify(dist)}），归位旧题 ${questions.length - fresh.length} 道`);
  }
  index.subjects.push(subjectIndex);
}
writeFileSync(join(root, "data", "knowledge-index.js"),
  `// 由 tools/build_knowledge.mjs 生成，请勿手改。\nwindow.KNOWLEDGE_INDEX = ${JSON.stringify(index)};\n`);
