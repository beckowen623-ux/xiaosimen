// 数学、物理精编模拟卷的配图（矢量图，手机和打印都清楚）。
// 用法：node tools/figures_claude_2026.mjs  → assets/national/claude-2026-math-1/*.svg、claude-2026-physics-1/*.svg
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const wrap = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Times New Roman, serif" font-size="18" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<rect width="${w}" height="${h}" fill="#fff" stroke="none"/>
${body}
</svg>
`;
const t = (x, y, s, extra = "") => `<text x="${x}" y="${y}" fill="#111" stroke="none" ${extra}>${s}</text>`;
const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="3" fill="#111" stroke="none"/>`;

const math = {
  // 第 4 题：a∥b，直线 c 与 a、b 相交。∠1 在 a 下方、c 右侧；∠2 在 b 上方、c 右侧（同旁内角）。
  q04: wrap(320, 200, `
<line x1="20" y1="60" x2="300" y2="60"/><line x1="20" y1="150" x2="300" y2="150"/>
<line x1="110" y1="15" x2="210" y2="195"/>
${t(285, 52, "a")}${t(285, 142, "b")}${t(214, 186, "c")}
<path d="M159 60 A 24 24 0 0 1 146.6 81"/>${t(158, 90, "1", 'font-size="15"')}
<path d="M173.3 129 A 24 24 0 0 1 209 150"/>${t(196, 140, "2", 'font-size="15"')}`),
  // 第 8 题：△ABC 中 DE∥BC，D 在 AB 上，E 在 AC 上。
  q08: wrap(300, 220, `
<polygon points="150,20 30,200 270,200"/>
<line x1="102" y1="92" x2="198" y2="92"/>
${t(143, 15, "A")}${t(12, 212, "B")}${t(272, 212, "C")}${t(82, 96, "D")}${t(204, 96, "E")}`),
  // 第 10 题：AB 是⊙O 的直径，C 在圆上。
  q10: wrap(260, 240, `
<circle cx="130" cy="120" r="95"/>
<line x1="35" y1="120" x2="225" y2="120"/>
${dot(130, 120)}${t(126, 140, "O")}
<line x1="35" y1="120" x2="165" y2="32"/><line x1="225" y1="120" x2="165" y2="32"/>
${t(10, 126, "A")}${t(231, 126, "B")}${t(160, 22, "C")}`),
  // 第 15 题：Rt△ABC，∠C＝90°。
  q15: wrap(280, 210, `
<polygon points="40,180 40,40 240,180"/>
<polyline points="40,162 58,162 58,180" stroke-width="1.5"/>
${t(20, 195, "C")}${t(30, 32, "A")}${t(244, 195, "B")}`),
  // 第 20 题：每天运动时间条形统计图。
  q20: wrap(360, 260, `
<line x1="50" y1="220" x2="340" y2="220"/><line x1="50" y1="220" x2="50" y2="20"/>
<polyline points="45,26 50,16 55,26"/><polyline points="334,215 344,220 334,225"/>
${[5, 10, 15, 20, 25].map(v => `<line x1="46" y1="${220 - v * 7.5}" x2="50" y2="${220 - v * 7.5}"/>${t(18, 226 - v * 7.5, v, 'font-size="14"')}`).join("")}
${[["A", 10], ["B", 20], ["C", 15], ["D", 5]].map(([k, v], i) => `<rect x="${78 + i * 65}" y="${220 - v * 7.5}" width="36" height="${v * 7.5}" fill="#cfe3dc"/>${t(90 + i * 65, 242, k)}${t(86 + i * 65, 214 - v * 7.5, v, 'font-size="14"')}`).join("")}
${t(10, 16, "人数", 'font-size="14"')}${t(318, 246, "组别", 'font-size="14"')}`),
  // 第 21 题：平行四边形 ABCD，E 在 AD 上，F 在 BC 上，AE＝CF。
  q21: wrap(340, 190, `
<polygon points="90,30 310,30 250,160 30,160"/>
<line x1="30" y1="160" x2="150" y2="30"/><line x1="310" y1="30" x2="190" y2="160"/>
${t(80, 22, "A")}${t(312, 22, "D")}${t(252, 178, "C")}${t(16, 178, "B")}${t(143, 22, "E")}${t(184, 180, "F")}`),
  // 第 22 题：抛物线 y＝x²－2x－3 的示意图。
  q22: wrap(320, 300, `
<line x1="20" y1="110" x2="300" y2="110"/><line x1="140" y1="290" x2="140" y2="10"/>
<polyline points="294,105 304,110 294,115"/><polyline points="135,16 140,6 145,16"/>
${t(290, 130, "x")}${t(148, 18, "y")}${t(124, 128, "O", 'font-size="15"')}
<path d="${Array.from({ length: 61 }, (_, i) => { const x = -2 + i * 0.1; const y = x * x - 2 * x - 3; return `${i ? "L" : "M"}${(140 + x * 40).toFixed(1)} ${(110 - y * 30 / 1.5 * 0.75).toFixed(1)}`; }).join(" ")}"/>`),
};

const physics = {
  // 第 5 题：L1、L2 并联，开关 S 在干路上。
  q05: wrap(340, 210, `
<rect x="40" y="30" width="240" height="150"/>
<line x1="150" y1="22" x2="150" y2="38" stroke-width="3"/><line x1="162" y1="26" x2="162" y2="34" stroke-width="5"/>
<rect x="145" y="24" width="22" height="12" fill="#fff" stroke="none"/>
<line x1="150" y1="20" x2="150" y2="40" stroke-width="2"/><line x1="160" y1="25" x2="160" y2="35" stroke-width="5"/>
${t(146, 58, "电源", 'font-size="14"')}
<line x1="100" y1="180" x2="100" y2="180"/>
<rect x="70" y="173" width="40" height="14" fill="#fff" stroke="none"/>${dot(70, 180)}<line x1="70" y1="180" x2="104" y2="166"/>${dot(110, 180)}${t(82, 205, "S", 'font-size="15"')}
<line x1="200" y1="30" x2="200" y2="180"/>${dot(200, 30)}${dot(200, 180)}
<circle cx="200" cy="105" r="13" fill="#fff"/><line x1="191" y1="96" x2="209" y2="114"/><line x1="209" y1="96" x2="191" y2="114"/>${t(170, 110, "L₁", 'font-size="15"')}
<circle cx="280" cy="105" r="13" fill="#fff"/><line x1="271" y1="96" x2="289" y2="114"/><line x1="289" y1="96" x2="271" y2="114"/>${t(292, 110, "L₂", 'font-size="15"')}`),
  // 第 9 题：用动滑轮竖直匀速提升重物。
  q09: wrap(220, 260, `
<line x1="20" y1="20" x2="200" y2="20" stroke-width="3"/>
${[30, 50, 70, 90, 110, 130, 150, 170, 190].map(x => `<line x1="${x}" y1="20" x2="${x - 10}" y2="10" stroke-width="1"/>`).join("")}
<line x1="80" y1="20" x2="80" y2="130"/><line x1="140" y1="130" x2="140" y2="40"/>
<circle cx="110" cy="130" r="30" fill="#fff"/>${dot(110, 130)}
<line x1="110" y1="130" x2="110" y2="190"/>
<rect x="85" y="190" width="50" height="45" fill="#e6e6e6"/>${t(102, 219, "G")}
<polyline points="134,52 140,40 146,52"/>${t(148, 60, "F")}`),
  // 第 14 题：用刻度尺测木块长度（左端对准 1.00 cm，右端在 3.50 cm）。
  q14: wrap(360, 150, `
<rect x="20" y="70" width="320" height="50" fill="#f6f1e1"/>
${Array.from({ length: 51 }, (_, i) => { const x = 30 + i * 6; const h = i % 10 === 0 ? 18 : i % 5 === 0 ? 13 : 8; return `<line x1="${x}" y1="70" x2="${x}" y2="${70 + h}" stroke-width="1.2"/>`; }).join("")}
${[0, 1, 2, 3, 4, 5].map(c => t(25 + c * 60, 112, c, 'font-size="15"')).join("")}${t(318, 92, "cm", 'font-size="14"')}
<rect x="90" y="35" width="150" height="35" fill="#cfa86b"/>`),
  // 第 19 题：R1、R2 串联接在电源两端。
  q19: wrap(320, 190, `
<rect x="40" y="30" width="240" height="130"/>
<rect x="150" y="22" width="22" height="16" fill="#fff" stroke="none"/>
<line x1="152" y1="18" x2="152" y2="42" stroke-width="2"/><line x1="164" y1="24" x2="164" y2="36" stroke-width="5"/>${t(140, 62, "电源", 'font-size="14"')}
<rect x="80" y="150" width="60" height="20" fill="#fff"/>${t(96, 192 - 6, "R₁", 'font-size="15"')}
<rect x="180" y="150" width="60" height="20" fill="#fff"/>${t(196, 192 - 6, "R₂", 'font-size="15"')}`),
};

for (const [paper, figures] of [["claude-2026-math-1", math], ["claude-2026-physics-1", physics]]) {
  const dir = join(root, "assets", "national", paper);
  mkdirSync(dir, { recursive: true });
  for (const [name, svg] of Object.entries(figures)) writeFileSync(join(dir, `${name}.svg`), svg);
  console.log(paper, Object.keys(figures).join(" "));
}
