import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  "app.js", "styles.css", "referrals.js", "referrals.css",
  "key-points.html", "key-points.js", "key-points.css", "manifest.webmanifest", "_routes.json",
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
console.log(output);
