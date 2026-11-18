// 追加经原卷、参考答案人工核对的真题。重复执行不会插入重复题。
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const input = ['hn-2025-objective.json', 'gs-2026-objective.json'].flatMap(file => JSON.parse(fs.readFileSync(path.join(root, 'supplement-src', file), 'utf8')));
const normalize = s => String(s).normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '');
const records = [];
for (const subject of ['daode', 'lishi', 'dili', 'shengwu']) {
  const file = path.join(root, 'data', `${subject}.js`);
  let code = fs.readFileSync(file, 'utf8');
  const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(code, ctx);
  const bank = ctx.window.XIAOSIMEN_BANKS[subject];
  const added = [];
  for (const row of input.filter(r => r.subject === subject)) {
    const old = bank.questions.find(q => normalize(q.stem).slice(0, 20) === normalize(row.stem).slice(0, 20) ||
      normalize(q.source) === normalize(row.source) ||
      (q.source.includes(row.source.match(/20\d{2}/)?.[0]) && q.source.includes(row.source.includes('湖南') ? '湖南' : '武威') && Number(q.source.match(/第\s*(\d+)\s*题/)?.[1]) === row.n));
    if (old) { records.push({ source: row.source, id: old.id, status: 'existing' }); continue; }
    if (['dili', 'shengwu'].includes(subject) && row.c > 4) throw new Error('新会考题不能放九年级');
    if (row.options.length !== 4 || !'ABCD'.includes(row.answer) || !row.explanation) throw new Error(row.source);
    const chapter = bank.chapters.find(ch => ch.id === row.c);
    const pool = bank.questions.filter(q => q.chapterId === row.c);
    const idNumber = Math.max(0, ...pool.map(q => Number(q.id.match(/-q(\d+)$/)?.[1] || 0))) + 1;
    const number = Math.max(0, ...pool.map(q => q.number)) + 1;
    const grade = ['七上', '七下', '八上', '八下', '九上', '九下'][row.c - 1];
    const stage = ['7-up', '7-down', '8-up', '8-down', '9-up', '9-down'][row.c - 1];
    const q = { id: `${subject}-h${String(row.c).padStart(2, '0')}-q${String(idNumber).padStart(3, '0')}`,
      chapterId: row.c, chapter: chapter.title, number, type: 'single', meta: '真题选择题', grade, stage,
      source: row.source, stem: row.stem, options: row.options.map((text, i) => ({ key: 'ABCD'[i], text })),
      answer: [row.answer], explanation: row.explanation };
    bank.questions.push(q); added.push(q); chapter.count++; bank.total++;
    records.push({ source: row.source, id: q.id, status: 'added' });
  }
  if (added.length) {
    const tail = /\r?\n  \]\r?\n};\s*$/;
    if (!tail.test(code)) throw new Error(`${subject}: 未识别文件尾部`);
    code = code.replace(tail, ',\n' + added.map(q => JSON.stringify(q, null, 2).split('\n').map(l => '    ' + l).join('\n')).join(',\n') + '\n  ]\n};\n');
    code = code.replace(/total: \d+/, `total: ${bank.total}`);
    for (const ch of bank.chapters) code = code.replace(new RegExp(`(\\{ id: ${ch.id}, title: [^\\n]+?, count: )\\d+`), `$1${ch.count}`);
    fs.writeFileSync(file, code);
  }
  console.log(`${subject}: 新增 ${added.length}，合计 ${bank.total}`);
}
const auditFile = path.join(root, 'supplement-src/hn-2025-import-audit.json');
// 保留首次入库的结论，重跑时只核对 id，不将 added 改成 existing。
if (fs.existsSync(auditFile)) {
  const previous = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
  for (const row of records) {
    const old = previous.find(r => r.source === row.source);
    if (old && old.id !== row.id) throw new Error(`不稳定的题目 id: ${row.source}`);
    if (old) row.status = old.status;
  }
}
fs.writeFileSync(auditFile, JSON.stringify(records, null, 2) + '\n');
