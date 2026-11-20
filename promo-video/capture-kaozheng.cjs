// 截考证题库演示画面（接口用假数据）。先在 127.0.0.1:8788 跑考证题库的发布文件。
const {chromium, devices} = require('playwright');
const OUT = process.argv[2];
const boxes = {};
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({...devices['iPhone 13'], deviceScaleFactor: 2});
  await c.route('**/api/**', r => r.fulfill({json: {ok: true, authenticated: false}}));
  const p = await c.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  const shot = async (n, sels = []) => {
    await p.screenshot({path: `${OUT}/${n}.png`});
    boxes[n] = {};
    for (const [k, sel] of sels) {
      const bb = await p.locator(sel).first().boundingBox().catch(() => null);
      if (bb) boxes[n][k] = [bb.x * 2, bb.y * 2, bb.width * 2, bb.height * 2];
    }
  };
  await p.goto('http://127.0.0.1:8788/', {waitUntil: 'networkidle'});
  await p.waitForTimeout(800);
  await shot('k01-home', [['pinned', '.pinned-exam-card']]);
  await p.click('.pinned-exam-card');
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.scrollTo(0, 380));
  await p.waitForTimeout(200);
  await shot('k02-bank', [['notice', 'text=依据财政部']]);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.getByRole('button', {name: '继续练习'}).first().click();
  await p.waitForTimeout(800);
  // 前两题答对，停在第 3 题（利息收入）
  for (const key of ['C', 'A']) {
    await p.click(`[data-action="choose"][data-key="${key}"]`);
    await p.click('[data-action="submit"]');
    await p.waitForTimeout(300);
    await p.getByRole('button', {name: /下一题/}).first().click();
    await p.waitForTimeout(500);
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot('k03-question', [['stem', '[data-action="choose"][data-key="A"]']]);
  await p.click('[data-action="choose"][data-key="A"]');
  await p.waitForTimeout(200);
  await shot('k04-chosen', [['choiceA', '[data-action="choose"][data-key="A"]'], ['submit', '[data-action="submit"]']]);
  await p.click('[data-action="submit"]');
  await p.waitForTimeout(500);
  await p.locator('.answer-panel').scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, 120));
  await p.waitForTimeout(200);
  await shot('k05-result', [['panel', '.answer-panel']]);
  // 购买页
  await p.goto('http://127.0.0.1:8788/', {waitUntil: 'networkidle'});
  await p.waitForTimeout(600);
  await p.click('[data-action="open-purchase"]');
  await p.waitForTimeout(800);
  await shot('k06-purchase');
  require('fs').writeFileSync(OUT + '/boxes.json', JSON.stringify(boxes, null, 1));
  await b.close();
})();
