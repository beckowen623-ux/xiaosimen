// 抓取最新三大主线实拍画面（小四门演播室 / 数理化59模型 / 语英8大提分工坊 / 253条口诀默写纸 / 同步真题）
// 用法：node capture-zhongkao.cjs public/zk
let pw; try { pw = require('playwright'); } catch { pw = require('playwright-core'); }
const {chromium, devices} = pw;
const fs = require('fs');
const OUT = process.argv[2] || 'public/zk';
const BASE = process.env.BASE || 'http://127.0.0.1:8777';
const HOME = BASE + '/?notrack=1';

async function makeCtx(browser) {
  const c = await browser.newContext({...devices['iPhone 13'], deviceScaleFactor: 2});
  await c.route('**/api/**', async r => {
    const u = r.request().url();
    if (u.includes('/access/status')) return r.fulfill({json: {authenticated: false}});
    if (u.includes('free-status')) return r.fulfill({json: {ok: true, free: {print: null, phone: null}}});
    if (u.includes('/config')) return r.fulfill({json: {xiaosimen: {link: 'https://example.com/x', command: '口令'}, bundle: {link: 'https://example.com/b', command: '口令'}}});
    return r.fulfill({json: {ok: true}});
  });
  await c.addInitScript(() => { window.print = () => {}; });
  return c;
}

const boxes = {};
async function shot(p, name, sels = []) {
  await p.screenshot({path: `${OUT}/${name}.png`});
  boxes[name] = {};
  for (const [k, sel] of sels) {
    const bb = await p.locator(sel).first().boundingBox().catch(() => null);
    if (bb) boxes[name][k] = [Math.round(bb.x * 2), Math.round(bb.y * 2), Math.round(bb.width * 2), Math.round(bb.height * 2)];
  }
}

async function scrollToEl(p, sel, offset = 60) {
  await p.locator(sel).first().evaluate((el, o) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - o), offset).catch(() => {});
  await p.waitForTimeout(300);
}

(async () => {
  fs.mkdirSync(OUT, {recursive: true});
  let browser;
  try { browser = await chromium.launch(); } catch { browser = await chromium.launch({channel: 'msedge'}); }
  const c = await makeCtx(browser);
  const p = await c.newPage();
  p.on('pageerror', e => console.log('PAGEERR:', e.message));

  // 1. 首页小四门主线 + 5大Tab
  await p.goto(HOME, {waitUntil: 'networkidle'});
  await p.waitForTimeout(900);
  await scrollToEl(p, '.home-tabs', 12);
  await shot(p, '01-home-x4m', [['tabs', '.home-tabs'], ['card', '.x4m-mainline-card']]);

  // 2. 《考点演播室》独立页面
  await p.goto(BASE + '/lab-x4m.html?tab=studio', {waitUntil: 'networkidle'});
  await p.waitForTimeout(700);
  await shot(p, '02-studio', [['stage', '#lxStage']]);

  // 3. 首页数理化主线
  await p.goto(HOME, {waitUntil: 'networkidle'});
  await p.waitForTimeout(800);
  await p.click('[data-home-tab="kp"]');
  await p.waitForTimeout(600);
  await scrollToEl(p, '.home-tabs', 12);
  await shot(p, '03-home-kp', [['tabs', '.home-tabs'], ['kp', '#knowledgeHome']]);

  // 4. 59 大名师压轴模型图鉴
  await p.goto(BASE + '/models.html', {waitUntil: 'networkidle'});
  await p.waitForTimeout(700);
  await shot(p, '04-models', [['grid', '.models-grid, .model-grid, main']]);

  // 5. 首页语英主线（点开 5 秒微体验）
  await p.goto(HOME, {waitUntil: 'networkidle'});
  await p.waitForTimeout(800);
  await p.click('[data-home-tab="yy"]');
  await p.waitForTimeout(400);
  await p.click('[data-yy-demo-poem="生"]').catch(() => {});
  await p.waitForTimeout(200);
  await p.click('[data-yy-demo-tier="lv15"]').catch(() => {});
  await p.waitForTimeout(300);
  await scrollToEl(p, '.home-tabs', 12);
  await shot(p, '05-home-yy', [['demo', '.yy-ml-demo-grid'], ['grid', '.yy-mainline-card .x4m-ml-grid']]);

  // 6. 《语英提分工坊》古诗易错字排雷
  await p.goto(BASE + '/lab-yy.html?tab=poems', {waitUntil: 'networkidle'});
  await p.waitForTimeout(600);
  await shot(p, '06-yy-poem', [['card', '.yy-card']]);

  // 7. 《语英提分工坊》英语作文 10→15 分三级升格
  await p.goto(BASE + '/lab-yy.html?tab=writing', {waitUntil: 'networkidle'});
  await p.waitForTimeout(500);
  await p.click('[data-tier="lv15"]').catch(() => {});
  await p.waitForTimeout(300);
  await scrollToEl(p, '.yy-card', 55);
  await shot(p, '07-yy-writing', [['upgrade', '.yy-upgrade-box']]);

  // 8. 全科 253 条带口诀速记与 A4 默写纸（开启背诵遮罩）
  await p.goto(BASE + '/key-points.html?subject=yuwen', {waitUntil: 'networkidle'});
  await p.waitForTimeout(700);
  await p.click('#pointReciteBtn').catch(() => {});
  await p.waitForTimeout(300);
  await scrollToEl(p, '#pointFilters', 55);
  await shot(p, '08-keypoints', [['card', '.point-card']]);

  // 9. 首页同步章节卷与真题
  await p.goto(HOME, {waitUntil: 'networkidle'});
  await p.waitForTimeout(800);
  await p.click('[data-home-tab="papers"]');
  await p.waitForTimeout(500);
  await scrollToEl(p, '#sync', 55);
  await shot(p, '09-papers', [['sync', '#sync']]);

  fs.writeFileSync(`${OUT}/boxes.json`, JSON.stringify(boxes, null, 2));
  await browser.close();
  console.log('CAPTURE_OK:', Object.keys(boxes).length, 'shots');
})();
