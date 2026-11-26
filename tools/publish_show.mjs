// 一键上架《考点演播室》节目视频（支持 local 站内托管 与 Cloudflare R2 永久免费 10GB 托管）
// 用法示例：
//   node tools/publish_show.mjs --id show-01 --video D:\shows\packed\show-01.mp4 --poster D:\shows\packed\show-01-poster.jpg --target local
//   node tools/publish_show.mjs --id show-01 --video D:\shows\packed\show-01.mp4 --poster D:\shows\packed\show-01-poster.jpg --target r2 --bucket x4m-media --domain https://media.x4m.cc.cd
// 可选：--highlights D:\shows\show-01-highlights.json  --title "..."  --duration "16 分 20 秒"
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h") || !args.length) {
  console.log(`用法: node tools/publish_show.mjs --id <show-01> --video <mp4> [--poster <jpg>] [--target local|r2] [--bucket x4m-media] [--domain https://media.x4m.cc.cd] [--highlights <json>] [--title <标题>] [--duration <时长>]`);
  process.exit(0);
}
function arg(name, def = "") {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const id = arg("id");
const videoPath = arg("video");
const posterPath = arg("poster");
const target = arg("target", "local");
const bucket = arg("bucket", "x4m-media");
const domain = arg("domain", "https://media.x4m.cc.cd").replace(/\/+$/, "");
const hlPath = arg("highlights");
const customTitle = arg("title");
const customDuration = arg("duration");

if (!id || !videoPath || !existsSync(videoPath)) {
  throw new Error("必须提供有效的 --id 和已存在的 --video 文件路径。");
}

const sizeMB = statSync(videoPath).size / (1024 * 1024);
let videoUrl = "";
let posterUrl = "";

if (target === "local") {
  if (sizeMB > 24.5) {
    throw new Error(`视频体积 ${sizeMB.toFixed(2)} MB 超过 Cloudflare Pages 25 MiB 单文件上限！请改用 --target r2 上传到免费 R2 桶。`);
  }
  const destDir = join(root, "assets", "video", "shows");
  mkdirSync(destDir, { recursive: true });
  const vName = `${id}.mp4`;
  copyFileSync(videoPath, join(destDir, vName));
  videoUrl = `./assets/video/shows/${vName}`;
  if (posterPath && existsSync(posterPath)) {
    const pName = `${id}-poster.jpg`;
    copyFileSync(posterPath, join(destDir, pName));
    posterUrl = `./assets/video/shows/${pName}`;
  }
} else if (target === "r2") {
  const vKey = `shows/${id}.mp4`;
  console.log(`正在上传 ${basename(videoPath)} (${sizeMB.toFixed(2)} MB) 到 R2: ${bucket}/${vKey} ...`);
  execFileSync("npx", ["--yes", "wrangler", "r2", "object", "put", `${bucket}/${vKey}`, "--file", videoPath, "--content-type", "video/mp4", "--remote"], { stdio: "inherit" });
  videoUrl = `${domain}/${vKey}`;
  if (posterPath && existsSync(posterPath)) {
    const pKey = `shows/${id}-poster.jpg`;
    execFileSync("npx", ["--yes", "wrangler", "r2", "object", "put", `${bucket}/${pKey}`, "--file", posterPath, "--content-type", "image/jpeg", "--remote"], { stdio: "inherit" });
    posterUrl = `${domain}/${pKey}`;
  }
} else {
  throw new Error(`未知 --target: ${target}（仅支持 local 或 r2）`);
}

// 更新 data/x4m-shows.js
const showsFile = join(root, "data", "x4m-shows.js");
const ctx = { window: {} };
vm.runInContext(readFileSync(showsFile, "utf8"), vm.createContext(ctx));
const shows = ctx.window.X4M_SHOWS || [];
let item = shows.find(s => s.id === id);
if (!item) {
  item = {
    id, subject: "lishi", badge: `🎬 演播室 · ${id}`, title: customTitle || id,
    hosts: "男女双主持深度对谈 · 考点横幅同步弹出", durationText: customDuration || "约 16 分钟",
    free: false, freePreviewSec: 600, status: "ready", videoUrl, poster: posterUrl,
    quizTab: "history", quizLabel: "去玩配套趣味闯关 →", kpLink: "./key-points.html",
    summary: "", highlights: [],
  };
  shows.push(item);
}
item.status = "ready";
item.videoUrl = videoUrl;
if (posterUrl) item.poster = posterUrl;
if (customTitle) item.title = customTitle;
if (customDuration) item.durationText = customDuration;
if (hlPath && existsSync(hlPath)) {
  const parsed = JSON.parse(readFileSync(hlPath, "utf8"));
  if (Array.isArray(parsed)) item.highlights = parsed;
}

const header = `// 爱丽克丝《考点演播室》视频节目清单（男女双主持 · 讲到考点自动弹高亮得分横幅）\n// 支持双轨托管：站内相对路径 (./assets/video/shows/xxx.mp4) 或 Cloudflare R2 链接 (https://media.x4m.cc.cd/shows/xxx.mp4)\n`;
writeFileSync(showsFile, `${header}window.X4M_SHOWS = ${JSON.stringify(shows, null, 2)};\n`, "utf8");
console.log(`OK 已更新 data/x4m-shows.js: ${id} -> ${videoUrl}`);
