// 截中考题库演示画面（接口用假数据）。先跑本地预览：node tools/stage_pages_release.mjs .deploy-preview 并在 8777 端口提供静态服务，可用 BASE 环境变量改。
// 用法：node capture-zhongkao.cjs public/zk
// 没装 playwright 时用 playwright-core + 本机 Edge：npm i --no-save playwright-core
let pw; try { pw = require('playwright'); } catch { pw = require('playwright-core'); }
const {chromium, devices} = pw;
const OUT = process.argv[2];
const BASE = process.env.BASE || 'http://localhost:8777';
const HOME = BASE + '/?notrack=1';
let paid = false; let free = {print: null, phone: null};
async function ctx(b, state) {
  const c = await b.newContext({...devices['iPhone 13'], deviceScaleFactor: 2, storageState: state});
  await c.route('**/api/**', async r => {
    const u = r.request().url();
    if (u.includes('/access/status')) return r.fulfill({json: {authenticated: paid}});
    if (u.includes('free-status')) return r.fulfill({json: {ok: true, free}});
    if (u.includes('free-use')) { const d = JSON.parse(r.request().postData()); free = {...free, [d.kind]: {paperId: d.paperId, title: d.title}}; return r.fulfill({json: {ok: true, free}}); }
    if (u.includes('/config')) return r.fulfill({json: {xiaosimen: {link: 'https://example.com/x', command: '口令'}, bundle: {link: 'https://example.com/b', command: '口令'}}});
    return r.fulfill({json: {ok: true}});
  });
  await c.addInitScript(() => { window.print = () => {}; });
  return c;
}
const boxes = {};
const shot = async (p, n, sels = []) => {
  await p.screenshot({path: `${OUT}/${n}.png`}); boxes[n] = {};
  for (const [k, sel] of sels) { const bb = await p.locator(sel).first().boundingBox().catch(() => null); if (bb) boxes[n][k] = [bb.x * 2, bb.y * 2, bb.width * 2, bb.height * 2]; }
};
const top = async (p, sel, offset = 90) => { await p.locator(sel).first().evaluate((el, o) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - o), offset); await p.waitForTimeout(250); };
// 学情分析演示用的做题记录（只写进截图浏览器的本地存储）
function seed() {
  const banks = {};
  const add = (paper, from, to, wrongs) => { for (let n = from; n <= to; n++) { const id = `national-${paper}-q${String(n).padStart(2, '0')}`; const bad = wrongs.includes(n); banks[id] = {done: true, attempts: 1, correct: !bad, wrongCount: bad ? 1 : 0}; } };
  add('xsc-math-1', 1, 10, [7]);
  add('xsc-math-2', 1, 10, [1, 3, 5, 8, 9]);
  add('xsc-math-3', 1, 8, [2, 5]);
  add('xsc-english-1', 1, 15, [4, 6, 12]);
  add('xsc-chinese-2', 7, 15, [7, 8, 10, 13]);
  return banks;
}
(async () => {
  let b; try { b = await chromium.launch(); } catch { b = await chromium.launch({channel: 'msedge'}); }
  let c = await ctx(b); let p = await c.newPage(); p.on('dialog', d => d.accept()); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(HOME, {waitUntil: 'networkidle'}); await p.waitForTimeout(900);
  // 1 学期 + 早鸟卷
  await p.click('[data-stage-pick="9-up"]'); await p.waitForTimeout(500);
  await top(p, '.stage-bar', 40);
  await shot(p, '01-stage', [['chips', '.stage-chips'], ['grid', '.earlybird-grid']]);
  // 2 按章节练（物理）
  await p.click('[data-unit-subject="physics"]'); await p.waitForTimeout(2500);
  await top(p, '#unitCard', 40);
  await shot(p, '02-unit', [['list', '#unitCard .unit-list']]);
  // 3 小升初衔接
  await p.goto(BASE + '/?notrack=1&go=xsc', {waitUntil: 'networkidle'}); await p.waitForTimeout(1200);
  await top(p, '#xsc', 40);
  await shot(p, '03-xsc', [['list', '#xsc .unit-list']]);
  // 4 每周一卷：打印、登记错题
  await p.click('[data-stage-pick="9-down"]'); await p.waitForTimeout(500);
  await top(p, '.weekly-card', 120);
  await shot(p, '04-weekly', [['print', '[data-weekly="print"]'], ['card', '.weekly-card']]);
  await p.click('[data-weekly="print"]'); await p.waitForTimeout(1500); await shot(p, '05-print');
  await p.goto(HOME, {waitUntil: 'networkidle'}); await p.waitForTimeout(900);
  await p.click('[data-weekly="mark"]'); await p.waitForTimeout(500);
  await top(p, '#weeklyMark', 60);
  for (const i of [2, 7, 13]) await p.click(`.weekly-num[data-i="${i}"]`);
  await p.waitForTimeout(200); await shot(p, '06-marked', [['grid', '.weekly-grid'], ['save', '#weeklySave']]);
  await p.click('#weeklySave'); await p.waitForTimeout(400); await shot(p, '07-saved', [['toast', '#toast']]);
  const st = await c.storageState(); await c.close();
  // 5 错题复习（完整版）
  paid = true; c = await ctx(b, st); p = await c.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(HOME, {waitUntil: 'networkidle'}); await p.waitForTimeout(900);
  await top(p, '#modesTitle', 60); await shot(p, '08-review-hub', [['wrong', '.quick-card[data-mode="wrong"]'], ['due', '.quick-card[data-mode="due"]']]);
  await p.click('.quick-card[data-mode="wrong"]'); await p.waitForTimeout(800);
  await p.locator('.option, .opt, button[data-opt], .choice').first().click().catch(() => console.log('no option sel'));
  await p.waitForTimeout(400);
  const submit = p.getByRole('button', {name: /提交|确定/}); if (await submit.count()) await submit.first().click();
  await p.waitForTimeout(600); await shot(p, '09-answered', [['fb', '.result-panel']]);
  // 6 学情分析
  await p.evaluate(banks => { const k = 'xiaosimen-quiz-v1'; const pr = JSON.parse(localStorage.getItem(k) || '{}'); pr.banks = {...(pr.banks || {}), ...banks}; localStorage.setItem(k, JSON.stringify(pr)); }, seed());
  await p.goto(HOME, {waitUntil: 'networkidle'}); await p.waitForTimeout(900);
  await top(p, '#analysisCard', 40);
  await p.click('#analysisBtn'); await p.waitForTimeout(4000);
  await top(p, '#analysisCard', 40);
  await shot(p, '10-analysis', [['out', '#analysisOut']]);
  require('fs').writeFileSync(OUT + '/boxes.json', JSON.stringify(boxes, null, 1)); await b.close();
})();
