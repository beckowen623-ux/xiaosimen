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
function extractSearchKw(p, deepGuide) {
  const parts = [];
  if (Array.isArray(p.keywords)) parts.push(...p.keywords);
  if (Array.isArray(p.kp)) parts.push(...p.kp);
  const pool = [
    ...(p.card?.concept || []),
    ...(p.card?.formula || []),
    ...(p.card?.pitfall || []),
    ...(deepGuide?.triggers || []),
    ...(deepGuide?.variants || []),
  ].join(" ");
  // 抽取括号/引号内模型术语与常见专业词块，控制索引紧凑体积
  const re = /([「“（(][^」”）)]{2,18}[」”）)]|[A-Za-z0-9]{2,8}(?:图像|曲线|模型|公式|定律)?)/g;
  let m;
  while ((m = re.exec(pool)) !== null) parts.push(m[1].replace(/[「」“”（）()]/g, ""));
  // 再补入概念首句与触发词精简版，确保正文高频模型词 100% 可搜
  const summary = [...(p.card?.concept || []).slice(0, 1), ...(deepGuide?.triggers || []).slice(0, 2)].join(" ").slice(0, 96);
  if (summary) parts.push(summary);
  const uniq = [...new Set(parts.map(s => String(s || "").trim()).filter(s => s.length >= 2))];
  return uniq.join(" ").slice(0, 180);
}

const index = { updated: new Date().toISOString().slice(0, 10), subjects: [] };
const spModels = [];
const FREE_PRINT_MODELS = new Set([
  "math-sp-p25", "math-sp-p26", "math-sp-p27", "math-sp-p16", "math-sp-p13",
  "math-sp-p07", "math-sp-p08", "physics-sp-p13", "physics-sp-p11", "chemistry-sp-p14",
]);
const oldQs = loadOldQuestions();
const capstonePath = join(root, "knowledge-src", "capstone-essays.json");
const capstoneEssays = existsSync(capstonePath) ? JSON.parse(readFileSync(capstonePath, "utf8")) : {};
const deepPath = join(root, "knowledge-src", "deep-guides.json");
const deepGuides = existsSync(deepPath) ? JSON.parse(readFileSync(deepPath, "utf8")) : {};
for (const [pid, g] of Object.entries(deepGuides)) {
  if (!Array.isArray(g?.triggers) || !g.triggers.length) throw new Error(`deep-guides ${pid} 缺 triggers`);
  if (!Array.isArray(g?.steps) || !g.steps.length) throw new Error(`deep-guides ${pid} 缺 steps`);
  if (!Array.isArray(g?.variants) || !g.variants.length) throw new Error(`deep-guides ${pid} 缺 variants`);
  if (!g?.parentGuide?.ask || !g?.parentGuide?.key) throw new Error(`deep-guides ${pid} 缺 parentGuide`);
  if (g.examples && !Array.isArray(g.examples)) throw new Error(`deep-guides ${pid} examples 应为数组`);
}

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
        const deepGuide = deepGuides[pointId];
        const kw = extractSearchKw(p, deepGuide);
        chapter.points.push({ id: pointId, name: p.name, tag: p.tag || "", kw, ...(extraEssay ? { hasEssay: true } : {}), ...(deepGuide ? { hasDeep: true, deep: deepGuide } : {}), card: p.card, qids, refs: refs.map(q => q.id) });
        if (sem.key === "sp") {
          const toLine = (v, max = 2) => Array.isArray(v) ? v.slice(0, max).join("；") : String(v || "");
          spModels.push({
            id: pointId,
            subject,
            subjectLabel,
            chapter: chapter.name,
            name: p.name,
            formula: toLine(p.card.formula, 2),
            concept: toLine(p.card.concept, 1),
            img: p.card.example?.img || "",
            kw,
            qCount: qids.length + refs.length,
            hasEssay: !!extraEssay,
            hasDeep: !!deepGuide,
            freePrint: FREE_PRINT_MODELS.has(pointId),
          });
        }
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
      chapters: chapters.map(c => ({ name: c.name, points: c.points.map(p => ({ id: p.id, name: p.name, tag: p.tag, ...(p.kw ? { kw: p.kw } : {}), ...(p.hasEssay ? { hasEssay: true } : {}), ...(p.hasDeep ? { hasDeep: true } : {}), ids: [...p.qids, ...p.refs] })) })),
      pointCount, questionCount: questions.length });
    console.log(`${subject}-${sem.key}: ${chapters.length} 章 ${pointCount} 个知识点，新题 ${fresh.length} 道（单选答案分布 ${JSON.stringify(dist)}），归位旧题 ${questions.length - fresh.length} 道`);
  }
  index.subjects.push(subjectIndex);
}
writeFileSync(join(root, "data", "knowledge-index.js"),
  `// 由 tools/build_knowledge.mjs 生成，请勿手改。\nwindow.KNOWLEDGE_INDEX = ${JSON.stringify(index)};\n`);

// 自动生成静态 SEO 友好《初中数理化压轴模型速查图鉴》(models.html)
const escHtml = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const mathCnt = spModels.filter(m => m.subject === "math").length;
const physCnt = spModels.filter(m => m.subject === "physics").length;
const chemCnt = spModels.filter(m => m.subject === "chemistry").length;
const freeCnt = spModels.filter(m => m.freePrint).length;
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: `初中数理化 ${spModels.length} 大名师压轴模型速查图鉴`,
  description: "涵盖婆罗摩笈多、阿氏圆、费马点、胡不归、瓜豆、手拉手、一线三等角、十字架、赵爽弦图、鸡爪、12345、逆等线、安阻法、伏阻法、杠杆最小力、万能瓶、滤液滤渣等全国中考高频压轴模型。",
  url: "https://x4m.cc.cd/models.html",
  numberOfItems: spModels.length,
  itemListElement: spModels.map((m, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: m.name,
    url: `https://x4m.cc.cd/?pt=${encodeURIComponent(m.id)}&from=models`,
  })),
};
const cardsHtml = spModels.map(m => {
  const hay = `${m.subjectLabel} ${m.chapter} ${m.name} ${m.kw} ${m.formula}`.replace(/"/g, "");
  const imgHtml = m.img ? `<div class="m-thumb"><img src="./${escHtml(m.img)}" alt="${escHtml(m.name)}教学示意图" loading="lazy"></div>` : "";
  return `<article class="m-card" data-subj="${escHtml(m.subject)}" data-id="${escHtml(m.id)}" data-free-print="${m.freePrint ? "1" : "0"}" data-hay="${escHtml(hay)}">
    <div class="m-card-head">
      <span class="m-subj ${escHtml(m.subject)}">${escHtml(m.subjectLabel)}</span>
      <div class="m-tags">
        ${m.freePrint ? '<span class="m-tag is-free">免费 A4 预览</span>' : ""}
        ${m.hasDeep ? '<span class="m-tag">名师详讲</span>' : ""}
        ${m.hasEssay ? '<span class="m-tag">含解答大题</span>' : ""}
      </div>
    </div>
    <h2>${escHtml(m.name)}</h2>
    <p class="m-chapter">${escHtml(m.chapter)}</p>
    ${imgHtml}
    <p class="m-formula"><b>核心通法/口诀：</b><span class="m-formula-text">${escHtml(m.formula)}</span></p>
    <p class="m-concept">${escHtml(m.concept)}</p>
    <div class="m-card-foot">
      <span class="m-qcount">${m.qCount} 道配套分层题与大题</span>
      <a class="m-btn primary" href="./?pt=${encodeURIComponent(m.id)}&amp;from=models">直达 4 步微课 →</a>
    </div>
  </article>`;
}).join("\n");

const modelsHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f4f2e8">
  <title>初中数理化 ${spModels.length} 大名师压轴模型速查图鉴 · 爱丽克丝中考题库</title>
  <meta name="description" content="初中数理化 ${spModels.length} 大名师压轴模型免费在线速查图鉴（数学 ${mathCnt} / 物理 ${physCnt} / 化学 ${chemCnt}）：婆罗摩笈多、阿氏圆、费马点、胡不归、瓜豆、手拉手、一线三等角、十字架、鸡爪、12345、逆等线、安阻法、杠杆最小力、万能瓶、滤液滤渣，点开直达 4 步微课与变式题，支持一键打印 A4 压轴口诀速查手册。">
  <link rel="canonical" href="https://x4m.cc.cd/models.html">
  <meta property="og:type" content="website">
  <meta property="og:title" content="初中数理化 ${spModels.length} 大名师压轴模型速查图鉴">
  <meta property="og:description" content="婆罗摩笈多、阿氏圆、费马点、胡不归、安阻法、万能瓶等 ${spModels.length} 个中考压轴模型一页速查，带图带口诀，点开直达 4 步微课，支持 A4 打印。">
  <meta property="og:image" content="https://x4m.cc.cd/assets/video/zhongkao-demo-poster.jpg">
  <meta property="og:url" content="https://x4m.cc.cd/models.html">
  <link rel="icon" type="image/svg+xml" href="./assets/icons/elx-badge.svg">
  <link rel="stylesheet" href="./models.css?v=1">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
  <header class="m-topbar">
    <div class="m-topbar-inner">
      <a class="m-back" href="./">← 返回爱丽克丝中考题库</a>
      <div class="m-top-actions">
        <a class="m-btn" href="./key-points.html">语英+小四门默写纸</a>
        <a class="m-btn primary" href="./?go=quick-diag&amp;from=models">3 分钟免费测弱项</a>
      </div>
    </div>
  </header>
  <main class="m-wrap">
    <div class="m-print-banner">
      <h1>初中数理化 ${spModels.length} 大名师压轴模型口诀速查手册</h1>
      <p id="mPrintMeta">爱丽克丝中考题库（x4m.cc.cd）</p>
    </div>
    <section class="m-hero">
      <span class="m-badge">🏆 全国通用 · 全量免费在线速查</span>
      <h1>初中数理化 ${spModels.length} 大名师压轴模型速查图鉴</h1>
      <p>数学几何/函数压轴 ${mathCnt} 个 ＋ 物理实验/力电综合 ${physCnt} 个 ＋ 化学工艺/探究 ${chemCnt} 个。每个模型均可 1 秒直达「名师 4 步通关微课＋分层变式＋规范解答大题」，支持开启零透字背诵遮罩与一键打印 A4 贴桌速查手册。</p>
      <div class="m-hero-btns">
        <button type="button" class="m-btn gold" id="mPrintBtn">🖨️ 一键打印 A4 压轴口诀手册（前 ${freeCnt} 个免费预览）</button>
        <a class="m-btn ghost" href="./#knowledge">去搜全部 395 个知识点 →</a>
      </div>
    </section>
    <section class="m-controls" aria-label="筛选压轴模型">
      <div class="m-tabs" role="tablist">
        <button type="button" class="m-tab is-active" role="tab" aria-selected="true" data-m-subj="all">全部模型（${spModels.length}）</button>
        <button type="button" class="m-tab" role="tab" aria-selected="false" data-m-subj="math">数学压轴（${mathCnt}）</button>
        <button type="button" class="m-tab" role="tab" aria-selected="false" data-m-subj="physics">物理压轴（${physCnt}）</button>
        <button type="button" class="m-tab" role="tab" aria-selected="false" data-m-subj="chemistry">化学压轴（${chemCnt}）</button>
      </div>
      <div class="m-search-row">
        <input type="search" id="mSearch" class="m-search" placeholder="🔍 筛选模型名或别名：如 婆罗摩笈多、阿氏圆、费马点、安阻法、万能瓶…" autocomplete="off" aria-label="筛选压轴模型">
        <div class="m-mask-tools">
          <button type="button" class="m-btn" id="mMaskToggle">🙈 开启背诵遮罩</button>
          <button type="button" class="m-btn" id="mRevealAll" hidden>全部揭晓</button>
          <button type="button" class="m-btn" id="mHideAll" hidden>全部重遮</button>
        </div>
      </div>
      <p class="m-status" id="mStatus">当前展示 ${spModels.length} / ${spModels.length} 个初中数理化名师压轴模型 · 全量免费在线速查</p>
    </section>
    <section class="m-grid" aria-label="压轴模型列表">
      ${cardsHtml}
    </section>
    <div class="m-print-lock-note" id="mPrintLockNote">
      以上为免费预览精选的 ${freeCnt} 大镇站模型（婆罗摩笈多、阿氏圆、费马点、胡不归、瓜豆、手拉手、一线三等角、杠杆最小力、安阻法、万能瓶）。访问 <b>x4m.cc.cd</b> 解锁完整版（¥19.9 一次买断），即可无水印无限打印全套 ${spModels.length} 大压轴模型手册 ＋ 395 个知识点 A4 补缺卷与语英小四门 213 条默写纸。
    </div>
    <section class="m-foot-cta">
      <div>
        <b>自家孩子也在用的中考提分工具 · 这次期中考从年级中上游冲进名列前茅</b>
        <p>不只是看模型结论：点开任意模型即可刷分层题、做规范解答大题、错题换一道变式题防背答案，还能一键印出专属 A4 补缺卷。</p>
      </div>
      <a class="m-btn primary" href="./?go=quick-diag&amp;from=models">立即 3 分钟免费测弱项 →</a>
    </section>
  </main>
  <script src="./models.js?v=1" defer></script>
</body>
</html>
`;
writeFileSync(join(root, "models.html"), modelsHtml);
console.log(`models.html: 已生成 ${spModels.length} 个名师压轴模型（数学 ${mathCnt} / 物理 ${physCnt} / 化学 ${chemCnt}，免费 A4 预览 ${freeCnt} 个）`);
