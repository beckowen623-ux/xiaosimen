// 由 tools/build_english.mjs 生成，源文件 english-src/papers/zj-2026-math.json，请勿手改。
window.NATIONAL_PAPERS = window.NATIONAL_PAPERS || {};
window.NATIONAL_PAPERS["zj-2026-math"] = [
 {
  "id": "national-zj-2026-math-q16",
  "national": true,
  "subject": "math",
  "subjectLabel": "数学",
  "paperId": "zj-2026-math",
  "number": 16,
  "section": "填空题",
  "chapter": "2026 年浙江中考数学（压轴题专练）",
  "grade": "九下",
  "stage": "9-down",
  "source": "2026 年浙江中考数学（压轴题专练） 第 16 题",
  "type": "blank",
  "stem": "第 16 题：如图，∠BAC = ∠ABC = 30°，AB = 4√6，D、E 分别是 AB、AC 的中点，Q、P 分别为 BC、DE 上任意点。当 BD 关于 QP 对称的线段 B'D' 垂直 DE 时，QP = ____。",
  "blanks": [
   [
    "2√2"
   ]
  ],
  "answer": [
   "2√2"
  ],
  "explanation": "【解析】在 △ABC 中，∠BAC = ∠ABC = 30°，AB = 4√6，过 C 作 CH⊥AB 于 H，解直角三角形得 AC = AB / √3 = 4√2。\n∵ D、E 分别是 AB、AC 的中点，∴ DE ∥ BC，CE = AC / 2 = 2√2。\n∵ 线段 B'D' ⊥ DE，由 DE ∥ BC 知 B'D' ⊥ BC，∴ ∠B'PC = 60°。\n由轴对称性质，∠BPQ = ∠B'PQ = (180° - 60°) / 2 = 60°。\n又 ∠C = 180° - 30° - 30° = 120°，由同旁内角互补或平行线性质可得 PQ ∥ CE。\n结合 DE ∥ BC，四边形 PCEQ 为平行四边形，故 QP = CE = 2√2。",
  "kp": "",
  "image": "assets/national/zj-2026-math/q16.png"
 },
 {
  "id": "national-zj-2026-math-q24",
  "national": true,
  "subject": "math",
  "subjectLabel": "数学",
  "paperId": "zj-2026-math",
  "number": 24,
  "section": "解答题",
  "chapter": "2026 年浙江中考数学（压轴题专练）",
  "grade": "九下",
  "stage": "9-down",
  "source": "2026 年浙江中考数学（压轴题专练） 第 24 题",
  "type": "essay",
  "meta": "解答题",
  "material": "",
  "stem": "如图，已知 AB 是 ⊙O 的直径，点 C 在 ⊙O 的上半圆上，弦 CE 交 AB 于点 D，且满足 AC = AD。点 F 在弦 BC 上，且 BF = DE。过点 F 作直线 FG ⊥ CE，交 AB 于点 G。\n（1）设 ∠CAB = α，求 ∠ABE 和 ∠FGB 的大小（用含 α 的代数式表示）；\n（2）若 CF = CD，求证：GF = GO；\n（3）若 ⊙O 的半径为 1，点 D 在半径 OB 上，且 OD = 2AG，求 AC 的长。",
  "points": [
   {
    "text": "（1）∠ABE = 90° - α/2，∠FGB = α/2",
    "score": 3,
    "keys": []
   },
   {
    "text": "（2）证明 △CDO ≌ △CFO，得 ∠GFO = ∠GOF = 72°，从而 GF = GO",
    "score": 4,
    "keys": []
   },
   {
    "text": "（3）设 AG = x，列方程求得 AC = 7 - 4√2",
    "score": 5,
    "keys": []
   }
  ],
  "score": 12,
  "sample": "（1）∠ABE = 90° - α/2，∠FGB = α/2；\n（2）证明详见解析（利用圆周角性质与三角形全等证明 ∠GFO = ∠GOF = 72°，得等腰三角形 GF = GO）；\n（3）AC = 7 - 4√2。",
  "method": "先写已知和所求，再列式计算，每一步写清依据，最后写结论。",
  "answer": [],
  "explanation": "【解析】\n（1）∵ AB 为直径，∴ ∠ACB = 90°。∵ AC = AD，∴ ∠ACD = ∠ADC = (180° - α) / 2 = 90° - α/2。\n由圆周角定理，∠ABE = ∠ACE = 90° - α/2。\n∵ FG ⊥ CE，∴ 在 Rt△DKG 中，∠KGD = 90° - ∠ADG = 90° - (90° - α/2) = α/2，即 ∠FGB = α/2。\n\n（2）连接 OF、OE。由同弧所对圆周角相等得 ∠ACD = ∠EBD，又 AC = AD 得 ∠ACD = ∠ADC = ∠EDB = ∠EBD，故 ED = EB = BF。\n又已知 CF = CD，故 CB = CF + FB = CD + DE = CE，△CBE 为等腰三角形。\n可得 α = 72°，进而证明 △CDO ≌ △CFO (SAS)，推导得 ∠GFO = ∠GOF = 72°，故 GF = GO。\n\n（3）连接 AE、作 EH⊥AB。设 AG = x，则 OD = 2x，OB = 1，AB = 2。\n由射影定理或构造相似三角形 △ADE ≌ △GFB，得到关于 x 的一元二次方程：\n(2 - x)² = (3/2 + x) × 2，整理得 x² - 6x + 1 = 0。\n解得 x = 3 - 2√2（x = 3 + 2√2 > 1 舍去）。\n从而 AC = AD = 1 + 2x = 1 + 2(3 - 2√2) = 7 - 4√2。",
  "kp": "",
  "image": "assets/national/zj-2026-math/q24.png"
 }
];
