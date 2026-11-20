# 技术变更记录

新记录写在最上面。格式：日期 · 改动 · 原因 · 验证 · 分支/提交。面向买家的说明另写在 `app.js` 的 `UPDATE_LOG`。

## 2026-11-20 · Claude Code · 分支 `claude/brand-video-faq`（未合并 main）
- 改名「爱丽克丝中考题库」：标题、页头、manifest、兑换提示、考点页、推荐卡片。存储 key 和兑换码范围不变。
- 新增「爱」圆形徽标 `assets/icons/elx-badge.svg`（站点图标 + 页头）。点徽标去作者主页 elx.cc.cd，点文字仍回题库首页。
- 购买窗口：加「原价 19.9 不用填邀请码 / 好友价 14.9 的条件」说明，以及“买之前常见问题”折叠区。
- 新增 33 秒使用演示视频 `assets/video/zhongkao-demo.mp4`（打印本周一卷 → 纸上做 → 登记错题 → 1/3/7/14 天复习 → 免费试 / 19.9）。首页简介卡加「▶ 30 秒看怎么用」，点了才加载视频（统计事件 demo_video）。源码见 `promo-video/`。
- promo-video 加考证题库视频（Kaozheng 组合，利息收入坑点题演示），成片在 quiz-bank-app 和 tina-home 各自分支。
- README 删掉“没有付费锁、兑换码”的旧说明；新增 AGENTS.md、CLAUDE.md、本文件。
- 原因：Codex 2026-11-19 购买体验审查 + 站长要求（品牌统一、视频引流）。
- 验证：`node tests/validate.mjs` 通过；本地 iPhone 13 视图截图检查页头、购买窗口和视频弹窗（点击前不请求 mp4，点击后播放），无脚本报错。
