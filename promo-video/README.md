# 演示视频源码（Remotion）

竖屏 1080×1920，30fps，字幕 + 原创合成轻音乐，无配音。成片放在 `../assets/video/`。

```bash
cd promo-video && npm install
# 1. 在仓库根目录先打包并启动本地站点：node tools/stage_pages_release.mjs .deploy-preview && (cd .deploy-preview && python3 -m http.server 8787)
# 2. 截真实界面（接口用假数据，不会消耗真实免费名额）：
node capture-zhongkao.cjs public/zk
# 3. 生成背景音乐（wav 不进仓库，渲染前先跑一次）：
python3 tools/gen-music.py public/bgm.wav 36
# 4. 渲染：
npx remotion render src/index.ts Zhongkao out/zhongkao.mp4 --codec h264 --crf 26
cp out/zhongkao.mp4 ../assets/video/zhongkao-demo.mp4
```

考证题库视频：在 quiz-bank-app 发布文件目录起 `127.0.0.1:8788`，运行 `node capture-kaozheng.cjs public/kz`，再 `npx remotion render src/index.ts Kaozheng out/kaozheng.mp4 --codec h264 --crf 26`，成片复制到 quiz-bank-app 的 `assets/video/kaozheng-demo.mp4` 和 tina-home 的 `public/assets/videos/`。

改台词：`src/Zhongkao.tsx`、`src/Kaozheng.tsx` 里的 `captions`、`Hook`、`Cta`。预览：`npx remotion studio src/index.ts`。
