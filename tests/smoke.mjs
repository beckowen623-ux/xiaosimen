// 核心转化链路与工程完整性自动冒烟检查：node tests/smoke.mjs
// 用于多 AI（Claude / Codex / Antigravity / Gemini）轮流改代码后、推送 main 前防回归。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const ok = [];
const check = (cond, passMsg, failMsg) => {
  if (cond) ok.push(passMsg);
  else errors.push(failMsg);
};
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// 1. 全量前端脚本与 Cloudflare Functions 语法检查
const classicJs = ['app.js', 'national-exams.js', 'key-points.js', 'referrals.js', 'share-offer.js', 'sw.js'];
for (const rel of classicJs) {
  try {
    new vm.Script(read(rel), { filename: rel });
    ok.push(`语法通过: ${rel}`);
  } catch (e) {
    errors.push(`语法错误 ${rel}: ${e.message}`);
  }
}

const moduleJs = [
  'functions/_middleware.js',
  'functions/_share.js',
  'functions/_referrals.js',
  'functions/api/track.js',
  'functions/api/_stats.js',
  'functions/api/config.js',
  'functions/_pay.js',
];
for (const rel of moduleJs) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) continue;
  try {
    execFileSync(process.execPath, ['--check', '--input-type=module'], {
      input: fs.readFileSync(full, 'utf8'),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    ok.push(`ESM 语法通过: ${rel}`);
  } catch (e) {
    errors.push(`ESM 语法错误 ${rel}: ${e.stderr?.toString() || e.message}`);
  }
}

// 2. 首页与核心转化弹窗 DOM 结构防回归
const indexHtml = read('index.html');
check(indexHtml.includes('id="unlockDialog"'), '购买弹窗 #unlockDialog 存在', 'index.html 缺少 #unlockDialog');
check(indexHtml.includes('aria-label="关闭兑换窗口"'), '购买弹窗关闭按钮存在', 'index.html 购买弹窗缺少关闭按钮');
check(indexHtml.includes('class="unlock-trust"'), '购买弹窗安心保障条存在', 'index.html 缺少 .unlock-trust 安心保障条');
check(indexHtml.includes('王者荣耀速度飞车'), '闲鱼保底用户名保留完整', 'index.html 丢失了闲鱼保底用户名');
check(indexHtml.includes('id="cloudSyncBox"') && indexHtml.includes('id="cloudSaveBtn"') && indexHtml.includes('id="cloudLoadBtn"'),
  '进度管理云端同步模块完整', 'index.html 缺少云端同步模块元素');
check(indexHtml.includes("updateViaCache: 'none'"), 'Service Worker 注册启用 updateViaCache: none', 'index.html 注册 SW 未设置 updateViaCache: none');

// 3. 考点速记页文案一致性
const kpHtml = read('key-points.html');
check(!kpHtml.includes('小四门 + 英语'), '考点速记页副标题与实际 4 科一致', 'key-points.html 仍包含未上线的「小四门 + 英语」');

// 4. app.js 试做转化闭环、埋点与云端同步防回归
const appJs = read('app.js');
check(appJs.includes('function isTrialSliceSession()'), '试做结束转化闭环 isTrialSliceSession 存在', 'app.js 缺少 isTrialSliceSession()，可能导致试做结束静默回首页');
check(appJs.includes("trackVisit('buy_click')") && appJs.includes("trackVisit('copy_code')") && appJs.includes("trackVisit('redeem_success')"),
  '核心成交漏斗埋点调用完整', 'app.js 缺少 buy_click / copy_code / redeem_success 埋点调用');
check(appJs.includes("unlockDialog.scrollTop = 0;"), '购买弹窗打开时自动置顶', 'app.js openUnlock 缺少 scrollTop 置顶');
check(appJs.includes("fetch('/api/access/backup'"), '前端云端错题本同步已接入', 'app.js 缺少 /api/access/backup 请求');
check(appJs.includes('access-value-line') && appJs.includes('开通完整版 ¥19.9'), '首页转化横幅含核心权益与主 CTA', 'app.js 缺少首页转化横幅权益文案');
check(appJs.includes('async function openScorePoster(') && appJs.includes('id="analysisPosterBtn"') && read('functions/api/_stats.js').includes('"score_poster"'), '成绩单与学情诊断海报及埋点完整', '缺少成绩单/学情诊断海报或 score_poster 埋点');
check(indexHtml.includes('id="claimConfirmDialog"') && appJs.includes('function confirmFreeClaim('), '免费整卷领取使用站内弹窗避免 WebView 拦截', '缺少 #claimConfirmDialog 或 confirmFreeClaim');
check(appJs.includes('data-mark-poster') && appJs.includes('data-mark-upsell'), '纸上登记完成后含弱项处方、海报与转化引导', 'showEarlybirdMark 缺少海报或转化引导');
check(appJs.includes('home-section-head') && appJs.includes('function rerenderHomeInPlace('), '首页三大分区与防跳屏原地重绘逻辑完整', 'app.js 缺少首页分区或 rerenderHomeInPlace');
check(fs.existsSync(path.join(root, 'assets/hero-scholar-desk.webp')) && appJs.includes('hero-scholar-desk.webp'), '现代书卷风首屏插画存在且已引用', '缺少首屏定制插画 hero-scholar-desk.webp');
check(!read('national-exams.js').includes('app.hideSearch()'), '全国真题页保留顶栏「找题」入口', 'national-exams.js 不应隐藏顶栏找题入口');

// 5. 后端规则与风控护栏防回归
const mwJs = read('functions/_middleware.js');
check(/const MAX_DEVICES\s*=\s*3;/.test(mwJs), '设备激活上限为 3 台', 'functions/_middleware.js 中 MAX_DEVICES 不为 3');
check(mwJs.includes('"/api/access/backup"') && mwJs.includes('async function progressBackup'), '后端云端备份接口 /api/access/backup 存在', 'functions/_middleware.js 缺少 /api/access/backup');
check(mwJs.includes('/api/pay/') && read('functions/_pay.js').includes('export async function handlePay'), '网页直付统一路由 /api/pay/* 存在', '缺少网页直付路由或 functions/_pay.js');

const statsJs = read('functions/api/_stats.js');
for (const ev of ['buy_click', 'copy_code', 'redeem_success']) {
  check(statsJs.includes(`"${ev}"`), `埋点白名单含 ${ev}`, `functions/api/_stats.js 缺少埋点 ${ev}`);
}

const shareJs = read('functions/_share.js');
check(shareJs.includes('RATE_LIMITED'), '分享接口 /api/share/me 含 IP 防刷限流', 'functions/_share.js 缺少 RATE_LIMITED 防刷限流');

// 6. 全国真题目录原卷/答案 WebP 图片零死链检查
const catSandbox = { window: {} };
vm.createContext(catSandbox);
vm.runInContext(read('data/national-catalog.js'), catSandbox, { filename: 'data/national-catalog.js' });
const papers = catSandbox.window.NATIONAL_CATALOG?.papers || [];
let imgCount = 0;
let missingImgs = [];
for (const p of papers) {
  for (const field of ['pages', 'answerPages']) {
    for (const rel of p[field] || []) {
      imgCount++;
      const cleanRel = String(rel).replace(/^\.\//, '');
      const full = path.join(root, cleanRel);
      if (!fs.existsSync(full) || fs.statSync(full).size === 0) missingImgs.push(`${p.id}: ${rel}`);
    }
  }
}
check(missingImgs.length === 0 && imgCount > 0,
  `全库原卷与答案图片零死链（共 ${imgCount} 页）`,
  `发现 ${missingImgs.length} 张缺失或空图片：${missingImgs.slice(0, 5).join(', ')}`);

console.log(`SMOKE CHECKS: ${ok.length} 通过，${errors.length} 失败`);
if (errors.length) {
  for (const e of errors) console.error(' - FAIL:', e);
  process.exit(1);
}
console.log('PASS: 全部冒烟检查通过');
