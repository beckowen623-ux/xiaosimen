import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const project = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const folder = process.argv[2] || ".deploy-pages";
if (![".deploy-pages", ".deploy-preview"].includes(folder)) {
  throw new Error("Choose .deploy-pages or .deploy-preview as the output folder.");
}

const launchDate = process.env.XIAOSIMEN_PAID_LAUNCH_DATE?.trim() || "";
if (!launchDate && process.env.CF_PAGES === "1" && process.env.CF_PAGES_BRANCH === "main") {
  throw new Error("Set XIAOSIMEN_PAID_LAUNCH_DATE to the first paid launch date in China (YYYY-MM-DD).");
}
if (launchDate) {
  const day = new Date(launchDate + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(launchDate) || !Number.isFinite(day.getTime()) ||
      day.toISOString().slice(0, 10) !== launchDate) {
    throw new Error("XIAOSIMEN_PAID_LAUNCH_DATE must be a calendar date in YYYY-MM-DD format.");
  }
}
const index = readFileSync(join(project, "index.html"), "utf8");
const dateMeta = 'name="xiaosimen-paid-launch-date" content=""';
if (!index.includes(dateMeta)) throw new Error("Missing launch date meta tag in index.html.");

const output = join(project, folder);
if (existsSync(output)) {
  if (!lstatSync(output).isDirectory() || realpathSync(output) !== output) {
    throw new Error("The release directory must be a normal folder inside the project.");
  }
  rmSync(output, { recursive: true });
}

const pages = [
  "app.js", "styles.css", "referrals.js", "share-offer.js", "referrals.css", "qrcode.js",
  "key-points.html", "key-points.js", "key-points.css", "manifest.webmanifest", "_routes.json", "_headers",
  "national-exams.js", "national-exams.css",
];
mkdirSync(output);
writeFileSync(join(output, "index.html"), index.replace(dateMeta, `name="xiaosimen-paid-launch-date" content="${launchDate}"`));
for (const page of pages) {
  copyFileSync(join(project, page), join(output, page));
}
cpSync(join(project, "assets"), join(output, "assets"), { recursive: true });

const data = join(project, "data");
const publicData = join(output, "data");
mkdirSync(publicData);
for (const file of readdirSync(data, { withFileTypes: true })) {
  if (file.isFile() && file.name.endsWith(".js")) {
    copyFileSync(join(data, file.name), join(publicData, file.name));
  }
}
// 题目配图（157 张 jpg，按题 id 命名）必须一起发布，否则线上显示“配图加载失败”。
cpSync(join(project, "data", "figures"), join(publicData, "figures"), { recursive: true });
cpSync(join(project, "data", "national"), join(publicData, "national"), { recursive: true });
const nationalHash = createHash("sha256").update(readFileSync(join(publicData, "national-catalog.js")));
for (const name of readdirSync(join(publicData, "national")).sort()) {
  nationalHash.update(readFileSync(join(publicData, "national", name)));
}
const nationalScript = join(output, "national-exams.js");
writeFileSync(nationalScript, readFileSync(nationalScript, "utf8").replace("__NATIONAL_VERSION__", nationalHash.digest("hex").slice(0, 12)));

// 每次发布按文件内容生成版本号（?v=内容哈希），文件一改，访客浏览器就会拿新文件。
for (const page of ["index.html", "key-points.html"]) {
  const file = join(output, page);
  const html = readFileSync(file, "utf8").replace(/(["'])\.\/([\w./-]+\.(?:js|css))\?v=[\w-]+\1/g, (match, quote, path) => {
    const target = join(output, path);
    if (!existsSync(target)) return match;
    const hash = createHash("sha256").update(readFileSync(target)).digest("hex").slice(0, 10);
    return `${quote}./${path}?v=${hash}${quote}`;
  });
  writeFileSync(file, html);
}
console.log(output);
