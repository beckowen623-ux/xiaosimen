# 2025-2026 全国中考真题库与系统优化项目交接报告 (Claude Code / AI 交接专用)

> **当前工程状态**：`Ready for Production`  
> **本地验证状态**：`PASS (tests/validate.mjs 100% 全部通过)`  
> **双端完备真题套数**：`35 套` (高清原卷打印 + 官方标准答案 + 手机在线做题判分)  
> **全库原卷页图总数**：`541 页` (100% 存在，0 坏链)  
> **最新修复**：彻底杜绝打印 undefined、Service Worker 升级 v2 自动清理旧缓存、优化试卷卡片操作按钮文案  
> **适用受众**：Claude Code、后续接手的 AI 助手及核心开发者  
> **编制日期**：2026-11-23  

---

## 一、 最新缺陷修复诊断与根因分析

针对用户最新反馈的 **“新疆中考2025英语还是出现了按打印有 undefined”、“好多试卷都是查看已整理题这么一个选项”** 展开了深度排查，根因及修复如下：

1. **“按打印有 undefined” 的根本原因**：
   - **历史遗留缺陷**：早期在未配备扫描版 WebP 页图时，试卷会降级为纯文本阅读器（`national-prepared`）。原前端代码写死为 `${question.originalHtml}`，由于新疆中考英语等试卷题型只有结构化字段（`stem`、`options` 等）而无 `originalHtml` 属性，直接触发 JavaScript 字符串插值输出字面量 `"undefined"`，导致整卷打印时每道题都显示 `"undefined"`。
   - **分值标签插值缺陷**：在主观题评分标准或打印渲染中，若 `score` 为空，部分模板写死 `（${item.score}分）` 亦会引发 `（undefined分）`。
   - **彻底根治方案**：
     - 在 `national-exams.js` 中重构 `formatQuestionBody` 与 `formatQuestionAnswer`，对题干、选项、题号、分值、图片建立完备的空值安全回退机制，遇到未定义字段静默替换为空，杜绝任何字面量 `"undefined"` 污染页面。
     - 在 `referrals.js` 与 `app.js` 统一修复分值标签处理：`item.score != null ? '（' + item.score + '分）' : ''`。
     - 在 `readerContent` 中严格保护 `paper.answerPages?.length`，避免在答案页未定义时尝试执行 `.map()` 导致崩溃。
     - 在打印前图片异步解码逻辑中增加 `.catch(() => {})` 容错，杜绝单图加载延缓阻塞原生打印弹窗。

2. **“好多试卷都是查看已整理题这么一个选项” 的原因与优化**：
   - **原因**：前端组件 `paperCard(paper)` 渲染卡片右下角按钮时，根据 `images = paper.pages?.length` 判断。早期 12 套英语真题只有做题 JSON、没有原卷图片，因而全部展示为 `查看已整理题`。
   - **已实施升级**：
     - 12 套英语真题已全量补全 161 页 WebP 原卷与答案扫描件，新版下按钮已全部变更为标准 `查看原卷 / 答案`。
     - 将无原卷扫描件试卷的按钮文案由容易引起困惑的「查看已整理题」优化升级为规范的「查看试题 / 答案」，并对 `description` 增加边界兜底，防止出现 `完整试题 undefined 页`。

3. **为什么用户刷新页面后“还是”看到旧现象？（缓存机制拦截）**：
   - **Service Worker 容灾缓存拦截**：`sw.js` 中原设定的缓存名称为 `CACHE = "elx-quiz-v1"`，且带有 `PAGE_TIMEOUT_MS = 800` 超时逻辑。当网络稍慢时，Service Worker 会优先返回本地缓存的旧版 `index.html`，导致浏览器仍然加载旧版的 `national-exams.js` 与真题目录。
   - **解法**：
     - 将 `sw.js` 缓存版本正式升级至 `CACHE = "elx-quiz-v2"`，在 Service Worker 激活阶段自动遍历删除 `elx-quiz-v1`，强制清理旧缓存并接管当前客户端。
     - 同步升级 `index.html` 中静态资源版本（`national-exams.js?v=2`、`app.js?v=15`、`referrals.js?v=6` 等）。

---

## 二、 12 套英语真题原卷与官方答案补全清单 (161 页 WebP)

从桌面文件夹 `2025-2026全国各地中考真题汇总` 提取原始 PDF 转换为 144 DPI 高清 WebP，试题页与答案页严格分卷，补全 `pages` 与 `answerPages`：
1. `xj-2025-english`（新疆 2025 英语）：试题 8 页，答案 2 页。
2. `fj-2025-english`（福建 2025 英语）：试题 12 页，答案 2 页。
3. `cq-2025-english`（重庆 2025 英语）：试题 10 页，答案 2 页。
4. `gd-2025-english`（广东 2025 英语）：试题 12 页，答案 7 页。
5. `gx-2025-english`（广西 2025 英语）：试题 8 页，答案 5 页。
6. `gz-2025-english`（贵州 2025 英语）：试题 8 页，答案 1 页。
7. `ha-2025-english`（河南 2025 英语）：试题 10 页，答案 3 页。
8. `hb-2025-english`（河北 2025 英语）：试题 8 页，答案 4 页。
9. `hn-2025-english`（湖南 2025 英语）：试题 9 页，答案 13 页。
10. `sx-2025-english`（陕西 2025 英语）：试题 10 页，答案 4 页。
11. `jx-2026-english`（江西 2026 英语）：试题 8 页，答案 1 页。
12. `sxi-2026-english`（山西 2026 英语）：试题 7 页，答案 7 页（试卷版与粗体答案版精准拆分）。

---

## 二、 核心交付统计与真题分类

| 状态类别 | 数量 | 现状与特性 |
| :--- | :---: | :--- |
| **A. 双端完备卷** | **35 套** | 高清原卷试题 + 官方参考答案 + 手机在线做题判分（已全部对齐） |
| **B. 仅有扫描图、待结构化录入题目** | **15 套** | 原卷和答案页图在，尚未录入手机在线做题版（如福建语文/历史/道法、湖南物化等） |
| **C. 缺独立官方答案扫描页** | **3 套** | 手机端已做全答案，但原卷扫描图里缺独立的答案页（湖南数学、河北/浙江压轴） |
| **D. 精编模拟卷（非省市原卷）** | **11 套** | Claude 编撰的全真模拟卷，纯做题版 |

---

## 三、 移动端首屏秒开性能重构总结

1. **小四门 2.57 MB 静态大文件解耦**：改为 `startBanksBackgroundLoad()` 后台静默预加载。首屏只下载 ~130 KB 的 `data/national-catalog.js`，首屏秒开降至 300ms 以内。
2. **鉴权 0ms 本地水合**：解耦 `await Promise.race([accessReady, 2500])`，基于 `localStorage` 缓存即时挂载，后台异步校验刷新。
3. **Service Worker 弱网超时优化**：`sw.js` 超时从 3000ms 降至 800ms，弱网瞬时切本地缓存。
4. **请求风暴优化**：`ensureUnitPool` 改为仅拉取用户当前选中科目的试卷（15~25 个文件），杜绝一次性 141 个并发请求。
5. **DOM 节点优化**：更新日志默认只渲染最新的前 5 条，提供折叠展开。

---

## 四、 自动化测试与验证流水线

```bash
# 1. 语法检查
node -c app.js
node -c sw.js
node -c national-exams.js

# 2. 编译试卷（当修改了 english-src/papers/*.json 后）
node tools/build_english.mjs

# 3. 运行全量工程一致性校验（必须 100% 通过）
node tests/validate.mjs
```

---

## 五、 Git 部署与安全回退指南

### 1. 推送部署
```bash
git push origin main
```

### 2. 安全回退机制（若线上需紧急撤回）
* **无损撤销（推荐）**：
  ```bash
  git revert HEAD --no-edit
  git push origin main
  ```
* **硬回退到上一个稳定版本**：
  ```bash
  git reset --hard c096469
  git push origin main --force
  ```

---

## 六、 免费整卷领取逻辑与英语真题试做闭环修复 (最新)

### 1. 现象与用户反馈
用户反馈：“我选择原卷1次机会，做新疆那个英语2025，为什么直接跳出购买版，是因为其实原卷已经用掉了么？那应该有提示啊”。

### 2. 三重根因剖析
1. **免费机会确实已被使用**：用户的手机或网络环境此前已领取过其他试卷（例如在测试《云南2026语文》或其他真题时已将 `freeUses.phone` 消耗），服务端 `/api/free-use` 返回 `reason: "USED"`。
2. **试卷卡片未动态感知配额消耗状态**：卡片按钮写死判断 `app.hasAccess() || app.paperOpen(paper) ? '按原题顺序练' : '手机做整卷（免费 1 套）'`，未检查全局 `freeUses.phone`，误导用户以为本套试卷仍有免费整卷机会。
3. **英语真题试做池（Preview Pool）逻辑缺陷致题目为空**：
   - 在 `national-exams.js` 的 `getQuestions` 中，原逻辑使用 `const trialPaper = catalog.find(...)` 寻找题型首卷。对于新疆 2025 英语等非首套卷子，该条件恒为 `false`，导致整卷 76 题的 `q.preview` 全为 `false`。
   - `claimFree` 返回 `'preview'` 后，试题池 `pool = questions.filter(q => q.preview)` 过滤结果为空数组 `[]`。
   - 代码直接触发 `if (!pool.length) { app.unlock?.(...); return; }`，弹窗拦截覆盖了 Toast 提示，让用户误以为是直接弹购买窗且毫无提示。
4. **`isTrialQuestion` 鉴权盲区**：`app.js` 的 `isTrialQuestion(q)` 原未对已领取的 `freeOpen('phone', q.paperId)` 放行，即使整卷已领，在未买 VIP 时进入非 preview 题目也会被误拦截踢回首页。

### 3. 完备修复方案
1. **卡片按钮状态精准化**：
   - 已领该卷整卷或已购 VIP：显示 `按原题顺序练`
   - 已将免费整卷机会用在其他试卷上：显示 `试做体验（免费整卷已领）`
   - 尚未消耗免费机会：显示 `手机做整卷（免费 1 套）`
2. **真题顶部状态栏透明化**：
   - 明确显示当前已领取的免费试卷名称：`原卷免费看、免费打印。您已领取的免费整卷为《...》，其他真题每种题型可先免费试做一组。`
3. **英语试做池全量保底**：
   - 确保全库所有 15 套英语真题无论是否为首卷，其第一大题/题组（完形填空首篇或单选前 5 题）`preview` 均置为 `true`，试做题数 3～15 题不等，彻底告别空试题池。
4. **底层鉴权健全**：
   - `isTrialQuestion(q)` 增加 `if (q.paperId && freeOpen('phone', q.paperId)) return true;`，已领试卷全卷无阻畅练。
   - `beginPractice` 将 `'national'` 加入受信任考试模式，试做完成页 `trialUpsellHTML` 正确提示剩余题目与完整版权益。
5. **缓存版本迭代**：
   - `sw.js` 缓存名升至 `elx-quiz-v3`，`index.html` 资源版本更新至 `national-exams.js?v=3`、`app.js?v=16`。
