# 任务提示词：为中考题库补“知识点补缺”内容（交给其他 AI 用）

你在仓库 `C:\Users\admin\Documents\ChatGPT\爱丽克丝的小站开发\xiaosimen`（线上 x4m.cc.cd）工作。全程用中文回复。

## 背景
题库首页主线是“按知识点补缺补漏”：每个知识点一张卡片 + 分层练习题。数学初一上学期已做完，作为样板：
- 源文件：`knowledge-src/math/7a-1.json` ～ `7a-6.json`（先完整读一遍 `7a-1.json` 和 `7a-5b.json`，照着写）
- 知识点清单：`docs/math-knowledge-tree.md`
- 构建：`node tools/build_knowledge.mjs`（生成 `data/knowledge-math-<学期>.js` 和 `data/knowledge-index.js`，页面会自动出现新学期，不用改 `knowledge.js`）

## 本次任务
做数学 **初一下学期**（学期键 `7b`），人教版新教材，章节：相交线与平行线、实数、平面直角坐标系、二元一次方程组、不等式与不等式组、数据的收集整理与描述。知识点参照 `docs/math-knowledge-tree.md` 第 43～76 条，可以拆得更细（例如应用题按题型拆）。一章写一个文件：`knowledge-src/math/7b-1.json` … `7b-6.json`，一章太长可拆成 `7b-4.json`、`7b-4b.json`（同一个 `chapter` 名会合并）。

## 文件格式（必须严格一致）
```json
{
  "chapter": "二元一次方程组",
  "unit": "七下·二元一次方程组",
  "points": [
    {
      "id": "p01", "name": "知识点名", "tag": "★",
      "kp": ["旧题里用的 kp 名，用来把旧题归到这个点，没有就写 []"],
      "card": {
        "concept": ["知识要点，2～4 条"],
        "formula": ["公式与方法，1～3 条"],
        "pitfall": ["易错点，1～3 条"],
        "example": {"q": "例题", "a": "完整解答"}
      },
      "qs": [
        {"lv": 1, "t": "c", "q": "题干（ ）", "o": ["选项1", "选项2", "选项3", "选项4"], "a": "B", "e": "解析"},
        {"lv": 1, "t": "b", "q": "题干______。", "a": "答案 / 等价写法", "e": "解析"}
      ]
    }
  ]
}
```
- `id`：本学期内 p01、p02… 连续编号，不能重复，已上线的 id 以后不能改。
- `unit` 必须用旧格式“七下·章名”（程序靠它找旧题），页面会自动显示成“初一下学期”。
- `tag`：★ 中考高频，◆ 易错，可组合“◆★”，没有就写 ""。
- `kp`：先运行下面命令看本学期旧题都有哪些 kp，再把对应的名字填进去：
  `node -e "const vm=require('vm'),fs=require('fs');const s=new Set();for(const f of fs.readdirSync('data/national')){const c={window:{}};vm.createContext(c);try{vm.runInContext(fs.readFileSync('data/national/'+f,'utf8'),c)}catch(e){continue}for(const qs of Object.values(c.window.NATIONAL_PAPERS||{}))for(const q of qs)if(q.subject==='math'&&String(q.unit||'').startsWith('七下'))s.add(q.unit+' | '+q.kp)}console.log([...s].sort().join('\n'))"`
- 每个知识点 8 道题：`lv` 1 基础 3 道、2 提高 3 道、3 拓展 2 道。`t` 为 `c`（单选，4 个不重复的选项，`a` 是字母）或 `b`（填空，题干里只能有 1 个 `______`，`a` 里多种写法用“ / ”隔开）。
- 第一道 `lv: 2` 的题会自动成为诊断题，前 3 题免费，所以前 3 题要有代表性。

## 质量要求（最重要）
1. **每道题先算出答案再写**，数字要能整除、能算通，答案唯一。写完逐题重算一遍。上一轮样板写的时候发现过 7 道算不通的题，务必自查。
2. 填空答案不能含“＞＜≥≤”等符号（判分会吞掉），比较大小、取值范围类一律写成选择题。
3. 不要超纲：初一下学期还没学一元二次方程、函数、负整数指数幂、勾股定理等。
4. 几何、函数图象、统计图类的题要配图（见下面“配图”一节），题干里仍要用文字写清关键条件，图只是帮助理解。
5. 解析要写清思路，易错题点明坑点（“坑点：……”）。
6. 用全角符号风格与样板一致（＋－＝×÷，(－3)² 这类写法）。
7. 题目全部原创，不照抄教辅；对外文字不提任何 AI。

## 配图
- 题目或卡片例题加一个字段 `"img": "文件名.svg"`，图片文件放在 `assets/knowledge/math/<学期键>/` 下（例如 `assets/knowledge/math/8a/p05-q3.svg`）。构建时会检查文件是否存在。样例：`knowledge-src/math/7b-1.json` 的 p06 第 6 题和例题，图是 `assets/knowledge/math/7b/p06-zhuti.svg`。
- 用手写 SVG 矢量图（手机和打印都清楚），统一用这个外框和画法：
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 210" width="320" height="210" font-family="Times New Roman, serif" font-size="18" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<rect width="320" height="210" fill="#fff" stroke="none"/>
<line x1="30" y1="40" x2="300" y2="40"/>
<circle cx="80" cy="40" r="3" fill="#111" stroke="none"/>
<text x="72" y="30" fill="#111" stroke="none">A</text>
</svg>
```
  直角标记用小折线（`<polyline points="40,162 58,162 58,180" stroke-width="1.5"/>`），虚线加 `stroke-dasharray="6 5"`，角度弧用 `<path d="M... A r r 0 0 1 ..."/>`，阴影用浅灰 `fill="#ddd"`。宽度不超过 360。
- **图必须和文字条件一致**：先按题目给的数量算出各点坐标再画（例如等腰三角形两腰真的相等、平行线真的平行、点 D 真的在 BC 上、坐标系里的点按刻度画）。字母标在点的外侧、不压线。
- 每画完一个学期，在本地预览里打开几道带图的题看一遍：图能显示、字母不重叠、和题干对得上。
- 离不开图的知识点（尺规作图、三视图、动点问题）要配图；能用文字唯一说清的题也建议配图，让题目不空洞。

## 检查与发布（顺序执行，全部通过才推送）
```
node tools/build_knowledge.mjs
node --check app.js && node --check knowledge.js
node tests/validate.mjs
node tests/smoke.mjs
```
构建会打印每学期的知识点数、新题数、单选答案分布、归位旧题数，有错误会直接报出哪道题。

- 本地预览：`node tools/stage_pages_release.mjs .deploy-preview`，用浏览器打开预览，进“按知识点补缺补漏”，切到初一下学期，点几个知识点看卡片和题目。
- `CHANGELOG.md` 最上面加一条记录（日期 · 改动 · 原因 · 验证），`app.js` 的 `UPDATE_LOG` 最上面加一条给家长看的更新说明。注意这两个文件是 CRLF 换行。
- 提交：`git -c user.name=Codex -c user.email=codex@users.noreply.github.com commit`，提交信息末尾加一行 `Co-Authored-By` 写明你的名字。
- 发布：`git fetch` → `git rebase origin/main` → `git push origin HEAD:main`（自动部署）。不要用 wrangler 手动部署，不要动线上数据库，不要强推，不要 `git reset --hard`。
- 只改本任务相关文件，不要顺手改页面样式、收费规则或别的功能。

## 交付
最后报告：每章知识点名单、新题数、归位旧题数、自查发现并改正了哪些题、检查命令输出、提交号。
