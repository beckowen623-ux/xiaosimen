// 数学卷二、物理卷二（中考难度整卷）的配图。用法：node tools/figures_2026_set2.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const wrap = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Times New Roman, serif" font-size="18" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<rect width="${w}" height="${h}" fill="#fff" stroke="none"/>
${body}
</svg>
`;
const t = (x, y, s, size = 18) => `<text x="${x}" y="${y}" fill="#111" stroke="none" font-size="${size}">${s}</text>`;
const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="3" fill="#111" stroke="none"/>`;
const dash = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-dasharray="6 5" stroke-width="1.5"/>`;
const line = (x1, y1, x2, y2, w = 2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${w}"/>`;
const curve = (f, x0, x1, ox, oy, sx, sy) => `<path d="${Array.from({ length: 81 }, (_, i) => {
  const x = x0 + (x1 - x0) * i / 80; return `${i ? "L" : "M"}${(ox + x * sx).toFixed(1)} ${(oy - f(x) * sy).toFixed(1)}`;
}).join(" ")}"/>`;
const axes = (w, h, ox, oy) => `${line(15, oy, w - 15, oy, 1.5)}${line(ox, h - 10, ox, 12, 1.5)}
<polyline points="${w - 21},${oy - 5} ${w - 11},${oy} ${w - 21},${oy + 5}" stroke-width="1.5"/><polyline points="${ox - 5},18 ${ox},8 ${ox + 5},18" stroke-width="1.5"/>
${t(w - 22, oy + 22, "x", 16)}${t(ox + 8, 20, "y", 16)}${t(ox - 18, oy + 18, "O", 15)}`;
// 电学元件
const battery = (x, y) => `<rect x="${x - 12}" y="${y - 10}" width="24" height="20" fill="#fff" stroke="none"/>${line(x - 5, y - 11, x - 5, y + 11)}${line(x + 5, y - 6, x + 5, y + 6, 5)}`;
const resistorH = (x, y, label) => `<rect x="${x - 26}" y="${y - 9}" width="52" height="18" fill="#fff"/>${t(x - 10, y + 30, label, 15)}`;
const meterBox = (x, y, label) => `<circle cx="${x}" cy="${y}" r="13" fill="#fff"/>${t(x - 6, y + 6, label, 16)}`;
const switchH = (x, y, label) => `<rect x="${x - 20}" y="${y - 8}" width="40" height="16" fill="#fff" stroke="none"/>${dot(x - 16, y)}${line(x - 16, y, x + 12, y - 14)}${dot(x + 16, y)}${t(x - 6, y + 26, label, 15)}`;

const math2 = {
  // 第 8 题：菱形 ABCD，对角线交于 O，E 为 AB 中点
  q08: wrap(320, 240, `
<polygon points="88,120 160,216 232,120 160,24"/>
${line(88, 120, 232, 120, 1.5)}${line(160, 24, 160, 216, 1.5)}${line(160, 120, 124, 168, 1.5)}
${t(66, 126, "A")}${t(154, 236, "B")}${t(238, 126, "C")}${t(154, 18, "D")}${t(166, 112, "O", 16)}${t(106, 182, "E", 16)}`),
  // 第 9 题：开口向下的抛物线，对称轴 x＝1，过点 (－1，0)
  q09: wrap(320, 230, `
${axes(320, 230, 120, 170)}
${curve(x => -0.5 * (x + 1) * (x - 3), -1.6, 3.6, 120, 170, 40, 30)}
${dash(160, 200, 160, 40)}${t(166, 52, "x＝1", 15)}${t(66, 190, "－1", 15)}`),
  // 第 14 题：AB 是直径，弦 CD⊥AB 于 E
  q14: wrap(300, 260, `
<circle cx="150" cy="130" r="100"/>
${line(50, 130, 250, 130)}${line(210, 50, 210, 210)}${dot(150, 130)}
<polyline points="210,118 198,118 198,130" stroke-width="1.5"/>
${t(28, 136, "A")}${t(256, 136, "B")}${t(212, 44, "C")}${t(212, 230, "D")}${t(144, 150, "O", 16)}${t(214, 150, "E", 16)}`),
  // 第 16 题：Rt△ABC，P 在 AB 上，PD⊥AC，PE⊥BC
  q16: wrap(260, 220, `
<polygon points="40,55 40,190 220,190"/>
${line(121, 116, 40, 116, 1.5)}${line(121, 116, 121, 190, 1.5)}${dash(40, 116, 121, 190)}
<polyline points="40,178 52,178 52,190" stroke-width="1.5"/>
${t(30, 48, "A")}${t(24, 206, "C")}${t(224, 206, "B")}${t(124, 110, "P", 16)}${t(22, 122, "D", 16)}${t(116, 210, "E", 16)}`),
  // 第 20 题：B、E、C、F 在同一直线上
  q20: wrap(290, 200, `
${line(15, 170, 275, 170, 1.5)}
<polygon points="80,50 30,170 190,170"/><polygon points="140,50 90,170 250,170"/>
${t(74, 42, "A")}${t(134, 42, "D")}${t(22, 192, "B")}${t(84, 192, "E")}${t(184, 192, "C")}${t(246, 192, "F")}`),
  // 第 23 题：在 A、B 两处测楼顶 C 的仰角
  q23: wrap(340, 220, `
${line(15, 190, 325, 190, 1.5)}${line(300, 190, 300, 34, 3)}
${line(30, 190, 300, 34, 1.5)}${line(210, 190, 300, 34, 1.5)}
<path d="M70 190 A 40 40 0 0 0 64.6 170" stroke-width="1.5"/>${t(76, 182, "30°", 14)}
<path d="M240 190 A 30 30 0 0 0 225 164" stroke-width="1.5"/>${t(244, 182, "60°", 14)}
${t(24, 210, "A")}${t(204, 210, "B")}${t(304, 210, "D")}${t(306, 34, "C")}`),
  // 第 24 题：AB 为直径，过 C 的切线交 AB 延长线于 D
  q24: wrap(300, 220, `
<circle cx="130" cy="130" r="70"/>
${line(60, 130, 270, 130)}${line(165, 69.4, 270, 130)}${line(60, 130, 165, 69.4, 1.5)}${line(130, 130, 165, 69.4, 1.5)}${dot(130, 130)}
${t(38, 136, "A")}${t(196, 150, "B")}${t(272, 150, "D")}${t(162, 60, "C")}${t(122, 150, "O", 16)}`),
  // 第 25 题：抛物线 y＝－x²＋2x＋3 与 △BCP
  q25: wrap(320, 270, `
${axes(320, 270, 100, 220)}
${curve(x => -x * x + 2 * x + 3, -1.2, 3.2, 100, 220, 40, 30)}
<polygon points="100,130 220,220 160,107.5" stroke-dasharray="6 5" stroke-width="1.5"/>
${t(50, 240, "A", 16)}${t(222, 240, "B", 16)}${t(80, 128, "C", 16)}${t(164, 100, "P", 16)}`),
};

const physics2 = {
  // 第 11 题：R₁ 与滑动变阻器 R₂ 串联，电压表测 R₁ 两端电压
  q11: wrap(340, 230, `
<rect x="40" y="40" width="260" height="140"/>
${battery(170, 40)}${t(156, 72, "电源", 13)}
${resistorH(110, 180, "R₁")}
<rect x="194" y="171" width="52" height="18" fill="#fff"/>${line(232, 150, 232, 168)}<polyline points="226,160 232,170 238,160"/>${line(232, 150, 262, 150, 1.5)}${t(214, 214, "R₂", 15)}${t(246, 142, "P", 14)}
${meterBox(40, 110, "A")}
${line(80, 180, 80, 120, 1.5)}${line(140, 180, 140, 120, 1.5)}${line(80, 120, 96, 120, 1.5)}${line(124, 120, 140, 120, 1.5)}${meterBox(110, 120, "V")}`),
  // 第 27 题：R₁、R₂ 并联，S₂ 在 R₂ 支路，S₁ 和电流表在干路
  q27: wrap(360, 250, `
${line(40, 40, 320, 40)}${line(40, 40, 40, 210)}${line(40, 210, 320, 210)}${line(320, 40, 320, 210)}
${battery(110, 210)}${t(96, 240, "电源", 13)}
${switchH(110, 40, "S₁")}${meterBox(40, 125, "A")}
${line(180, 40, 180, 210)}${dot(180, 40)}${dot(180, 210)}
<rect x="171" y="98" width="18" height="52" fill="#fff"/>${t(150, 130, "R₁", 15)}
<rect x="311" y="70" width="18" height="52" fill="#fff"/>${t(332, 100, "R₂", 15)}
<rect x="306" y="140" width="28" height="44" fill="#fff" stroke="none"/>${dot(320, 144)}${line(320, 144, 334, 172)}${dot(320, 180)}${t(338, 168, "S₂", 15)}`),
};

for (const [paper, figures] of [["claude-2026-math-2", math2], ["claude-2026-physics-2", physics2]]) {
  const dir = join(root, "assets", "national", paper);
  mkdirSync(dir, { recursive: true });
  for (const [name, svg] of Object.entries(figures)) writeFileSync(join(dir, `${name}.svg`), svg);
  console.log(paper, Object.keys(figures).join(" "));
}
