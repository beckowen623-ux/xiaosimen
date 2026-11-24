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
4. 几何题没有配图，条件用文字说清楚，不能写“如图”。
5. 解析要写清思路，易错题点明坑点（“坑点：……”）。
6. 用全角符号风格与样板一致（＋－＝×÷，(－3)² 这类写法）。
7. 题目全部原创，不照抄教辅；对外文字不提任何 AI。

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
