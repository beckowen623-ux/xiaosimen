// 截考证题库演示画面（接口用假数据）。先在本地跑考证题库的发布文件（默认 127.0.0.1:8788，可用 BASE 环境变量改）。
// 没装 playwright 时用 playwright-core + 本机 Edge：npm i --no-save playwright-core
let pw; try { pw = require('playwright'); } catch { pw = require('playwright-core'); }
const {chromium, devices} = pw;
const OUT = process.argv[2];
const BASE = process.env.BASE || 'http://127.0.0.1:8788';
const boxes = {};
(async () => {
  let b; try { b = await chromium.launch(); } catch { b = await chromium.launch({channel: 'msedge'}); }
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
  await p.goto(BASE + '/', {waitUntil: 'networkidle'});
  await p.waitForTimeout(800);
  await p.evaluate(() => { const el = document.querySelector('.pinned-exam-card'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 360); });
  await p.waitForTimeout(300);
  await shot('k01-home', [['pinned', '.pinned-exam-card']]);
  await p.click('.pinned-exam-card');
  await p.evaluate(() => window.scrollTo(0, 0));
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
  await p.goto(BASE + '/', {waitUntil: 'networkidle'});
  await p.waitForTimeout(600);
  await p.click('[data-action="open-purchase"]');
  await p.waitForTimeout(800);
  await shot('k06-purchase');
  // 早鸟自测：首页红色入口 → 初级自测选卷 → 做完一套出分（模拟一个基础一般的人：大约一半题答对）
  await p.goto(BASE + '/', {waitUntil: 'networkidle'});
  await p.waitForTimeout(600);
  await p.evaluate(() => { const el = document.querySelector('.selftest-card'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 40); });
  await p.waitForTimeout(300);
  await shot('k07-selftest', [['card', '.selftest-card']]);
  await p.click('[data-action="open-selftest"][data-level="junior"]');
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const el = document.querySelector('.mock-paper-grid'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 300); });
  await p.waitForTimeout(300);
  await shot('k08-papers', [['grid', '.mock-paper-grid']]);
  await p.click('[data-chapter="1"]');
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    const right = new Set([1, 2, 3, 5, 7, 11, 12, 14, 16, 21, 22, 23, 26, 27, 29, 31, 33]);
    bank.questions.filter((q) => q.chapterId === 1).forEach((q, i) => {
      const wrong = q.options.map((o) => o.key).filter((k) => !q.answer.includes(k));
      state.transientSelection = right.has(i + 1) ? [...q.answer] : q.type === 'multiple' ? [...q.answer.slice(0, 1), wrong[0]] : [wrong[0]];
      submitQuestion(q.id);
    });
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(500);
  await p.evaluate(() => { const el = document.querySelector('.mock-score-panel'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60); });
  await p.waitForTimeout(300);
  await shot('k09-score', [['result', '.mock-score-panel']]);
  require('fs').writeFileSync(OUT + '/boxes.json', JSON.stringify(boxes, null, 1));
  await b.close();
})();
