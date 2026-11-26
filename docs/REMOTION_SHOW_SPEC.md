# 《考点演播室》Remotion 视频制作与零成本上架规范

本文档可直接发给 **Claude Code**，用于统一 NotebookLM 双人音频 + Remotion 渲染规格，实现视频里的“考点横幅”与网站播放器下方“可点击考点书签”100% 同步。

## 1. Remotion 渲染参数建议（专为 15–20 分钟节目优化）
- **分辨率**：横屏 `1280×720`（推荐，横幅与双人演播室构图最舒展）或竖屏 `720×1280`。
- **帧率**：`24 fps`（双人主持波形 + 考点横幅动画 24fps 丝滑且体积比 60fps 小 60%）。
- **画面安全区**：底部预留至少 `10%` 高度空白，避免手机浏览器 `<video>` 控制条遮挡字幕或考点横幅。
- **考点横幅同步导出 JSON**：请让 Claude Code 在渲染时顺手输出同名的 `show-01-highlights.json`，格式如下：
  ```json
  [
    { "t": 120, "badge": "高频考点", "text": "西周分封制诸侯世袭 → 埋下割据伏笔" },
    { "t": 310, "badge": "必背措施", "text": "商鞅变法：废井田、奖励耕战、确立县制" }
  ]
  ```
  - `t` 为该考点横幅在视频中出现的秒数；网站播放器会自动随播放高亮并支持点击 1 秒跳转重看！

## 2. 一键无损瘦身（15–20 分钟压至 ~16–25 MB）
Remotion 属于扁平图形+文字横幅动画，用本机 `ffmpeg` 的 `-tune animation` 压制画质极清、体积骤降：
```powershell
powershell -ExecutionPolicy Bypass -File .\tools\pack_show_video.ps1 -InputVideo "D:\你的原片\show-01.mp4" -Slug "show-01"
```
脚本会自动生成 `packed\show-01.mp4` 和 `packed\show-01-poster.jpg` 封面图。

## 3. 双轨零成本上架到 `x4m.cc.cd`

### 轨道 A：站内直放（仅限压后 ≤ 24 MB 的主打试看集，0 额外配置）
```powershell
node tools/publish_show.mjs --id show-01 --video "D:\你的原片\packed\show-01.mp4" --poster "D:\你的原片\packed\show-01-poster.jpg" --highlights "D:\你的原片\show-01-highlights.json" --target local
```

### 轨道 B：Cloudflare R2 永久免费 10 GB（强烈推荐，可放 400–600 集 15–20 分钟节目，出站流量永久 0 元！）
1. 登录 Cloudflare 控制台 → 左侧 **R2 Object Storage** → 新建存储桶，命名为 `x4m-media`。
2. 进入 `x4m-media` → **Settings** → **Custom Domains** → 绑定子域名 `media.x4m.cc.cd`（Cloudflare 自动配好 HTTPS，1 分钟生效）。
3. 以后每做好 1 集节目，直接运行一条命令一键上传并自动写入节目单：
```powershell
node tools/publish_show.mjs --id show-01 --video "D:\你的原片\packed\show-01.mp4" --poster "D:\你的原片\packed\show-01-poster.jpg" --highlights "D:\你的原片\show-01-highlights.json" --target r2 --bucket x4m-media --domain https://media.x4m.cc.cd
```
最后 `git add data/x4m-shows.js && git commit -m "feat: publish show-01" && git push` 即可上线！
