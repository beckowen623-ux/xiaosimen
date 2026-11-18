/* National exam catalogue. Question practice uses the app's existing renderer. */
(() => {
  'use strict';
  const labels = { english: '英语', physics: '物理', chemistry: '化学', math: '数学',
    chinese: '语文', daode: '道法', lishi: '历史', dili: '地理', shengwu: '生物' };
  const subjects = Object.keys(labels);
  const escape = value => String(value ?? '').replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const state = { subject: 'english', region: '', year: '', mode: 'short', paper: null, showAnswers: false };
  const pending = new Map();
  const papers = new Map();
  const dataVersion = '__NATIONAL_VERSION__';
  let catalog;
  let app;
  let revision = 0;
  let opened = false;

  function loadScript(url) {
    if (pending.has(url)) return pending.get(url);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = () => { script.remove(); pending.delete(url); reject(new Error('资料加载失败，请检查网络后重试。')); };
      document.head.appendChild(script);
    });
    pending.set(url, promise);
    return promise;
  }

  async function getCatalog() {
    if (!catalog) {
      await loadScript('./data/national-catalog.js?v=' + dataVersion);
      if (!window.NATIONAL_CATALOG?.papers) throw new Error('真题目录暂时不可用。');
      catalog = window.NATIONAL_CATALOG.papers;
    }
    return catalog;
  }

  async function getQuestions(paper) {
    if (!papers.has(paper.id)) {
      await loadScript(paper.data + '?v=' + dataVersion);
      const questions = window.NATIONAL_PAPERS?.[paper.id];
      if (!Array.isArray(questions) || questions.length !== paper.questionCount) throw new Error('这份真题暂时无法加载。');
      // 免费试做：英语每个题型的第一组（单选前 5 题、情景交际前 2 题，作文不开放）；其他科第一组或前 5 题。
      const previewIds = new Set();
      if (paper.subject === 'english') {
        const seen = new Map();
        for (const q of questions) {
          const key = q.section || 'other';
          const count = seen.get(key) || 0;
          const first = questions.find(x => (x.section || 'other') === key);
          const ok = key === '书面表达' ? false : q.groupId ? q.groupId === first.groupId : count < (key === '情景交际' ? 2 : 5);
          if (ok) previewIds.add(q.id);
          seen.set(key, count + 1);
        }
      } else {
        (questions[0]?.materialHtml ? questions.filter(q => q.groupId === questions[0].groupId) : questions.slice(0, 5)).forEach(q => previewIds.add(q.id));
      }
      questions.forEach(question => { question.preview = previewIds.has(question.id); });
      papers.set(paper.id, questions);
    }
    return papers.get(paper.id);
  }

  function goBack() {
    leave();
    app.home();
  }

  function leave() {
    opened = false;
    revision++;
    if (location.hash === '#national') history.replaceState(null, '', location.pathname + location.search);
  }

  function shell(content) {
    document.body.classList.remove('practice');
    app.hideSearch();
    app.view.innerHTML = `
      <div class="national-header">
        <button type="button" class="btn text-button" data-national="home">← 返回小四门</button>
        <h1 id="nationalTitle" tabindex="-1">全国中考真题</h1>
        <p class="muted">选一科，练几题。也可以按地区、年份查看原卷。</p>
      </div>${content}`;
    app.view.querySelector('[data-national="home"]').addEventListener('click', goBack);
  }

  function drawFilters(available) {
    const regions = [...new Set(available.map(paper => paper.region))].sort((a, b) => a === '福建' ? -1 : b === '福建' ? 1 : a.localeCompare(b, 'zh'));
    const years = [...new Set(available.map(paper => paper.year))].sort((a, b) => b - a);
    const liveSubjects = subjects.filter(subject => available.some(paper => paper.subject === subject));
    return `<section class="card national-filters" aria-label="筛选真题">
      <div class="national-tabs" role="group" aria-label="练习方式">
        <button class="btn ${state.mode === 'short' ? 'primary' : ''}" data-mode="short" type="button" aria-pressed="${state.mode === 'short'}">${state.subject === 'english' ? '按题型练' : '几分钟短练'}</button>
        <button class="btn ${state.mode === 'paper' ? 'primary' : ''}" data-mode="paper" type="button" aria-pressed="${state.mode === 'paper'}">按原卷练</button>
      </div>
      <div class="national-subjects" role="group" aria-label="选择科目">
        ${liveSubjects.map(subject => `<button type="button" class="btn ${state.subject === subject ? 'primary' : ''}" data-subject="${subject}" aria-pressed="${state.subject === subject}">${labels[subject]}</button>`).join('')}
      </div>
      <div class="national-selects">
        <label>地区<select id="nationalRegion"><option value="">全部地区</option>${regions.map(region => `<option ${state.region === region ? 'selected' : ''}>${escape(region)}</option>`).join('')}</select></label>
        <label>年份<select id="nationalYear"><option value="">全部年份</option>${years.map(year => `<option ${String(year) === state.year ? 'selected' : ''}>${year}</option>`).join('')}</select></label>
      </div>
    </section>`;
  }

  function paperCard(paper) {
    const questionCount = paper.questionCount;
    const images = paper.pages?.length;
    const description = questionCount
      ? `${paper.description} · ${questionCount} 道已整理题`
      : `完整试题 ${images} 页 · 答案 ${paper.answerPages.length} 页`;
    return `<article class="card national-paper-card">
      <div class="national-paper-meta"><span>${escape(paper.region)}</span><span>${paper.year}</span></div>
      <h2>${escape(paper.title)}</h2><p class="muted">${escape(description)}</p>
      <div class="national-actions">
        ${questionCount ? `<button class="btn primary" type="button" data-start="${paper.id}">${state.mode === 'short' ? (paper.subject === 'english' ? '阅读 1 篇' : '练 5 题') : '按原题顺序练'}</button>` : ''}
        <button class="btn ${questionCount ? '' : 'primary'}" type="button" data-read="${paper.id}">${images ? '查看原卷 / 答案' : '查看已整理题'}</button>
      </div>
    </article>`;
  }

  // 英语按中考题型练：单选一次 10 道；完形、阅读、七选五、短文填空一次一篇；情景交际 5 组；作文 1 篇。
  const ENGLISH_TYPES = [
    ['单项选择', '语法、词汇、交际', 10], ['语法选择', '一篇短文 10 空，考语法', 0], ['完形填空', '一篇短文 10 空', 0],
    ['阅读理解', '一篇文章 4—5 题', 0], ['七选五', '一篇短文 5 空', 0], ['补全对话', '从选项里选句子补全对话', 0],
    ['配对阅读', '为每条描述选出对应项', 0], ['短文填空', '用词的正确形式填空', 0], ['情景交际', '自己写句子补全对话', 5],
    ['回答问题', '读短文，用完整句子回答', 0], ['书面表达', '写一篇作文，对照得分点', 1],
  ];
  const englishPapers = () => catalog.filter(paper => paper.subject === 'english' && paper.data &&
    (!state.region || paper.region === state.region) && (!state.year || String(paper.year) === state.year));
  function englishTypeCards() {
    const papersHere = englishPapers();
    const count = type => papersHere.reduce((sum, paper) => sum + (paper.sections?.[type] || 0), 0);
    const cards = ENGLISH_TYPES.filter(([type]) => count(type)).map(([type, hint]) => `<article class="card national-paper-card national-type-card">
      <h2>${escape(type)}</h2><p class="muted">${escape(hint)} · 共 ${count(type)} 题，来自 ${papersHere.filter(p => p.sections?.[type]).length} 套真题</p>
      <div class="national-actions"><button class="btn primary" type="button" data-type="${escape(type)}">${app.hasAccess() ? '练一组' : type === '书面表达' ? '完整版可练' : '免费试一组'}</button></div></article>`).join('');
    const note = app.hasAccess() ? '按中考题型练，每题都有 Claude 写的解析。想做整套卷子，切到「按原卷练」。'
      : '原卷免费看（切到「按原卷练」）。在线刷题和 Claude 解析属于小四门完整版，19.9 一起解锁；每种题型先免费试一组。';
    return cards ? `<p class="national-status muted">${note}</p><div class="national-paper-grid">${cards}</div>` : '';
  }
  async function startType(button) {
    button.disabled = true;
    const version = ++revision;
    try {
      const type = button.dataset.type;
      const lists = await Promise.all(englishPapers().filter(paper => paper.sections?.[type]).map(getQuestions));
      if (version !== revision || !opened) return;
      const all = lists.flat().filter(q => q.section === type);
      const pool = app.hasAccess() ? all : all.filter(q => q.preview);
      if (!pool.length) { app.unlock?.(`「${type}」在线刷题属于完整版：小四门 19.9 一起解锁，原卷可以免费看。`); return; }
      const progress = app.progress();
      const fresh = pool.filter(q => !progress.banks[q.id]?.done);
      const source = fresh.length ? fresh : pool;
      const size = (ENGLISH_TYPES.find(([name]) => name === type) || [])[2];
      let chosen;
      if (!size) {
        const groupId = source[Math.floor(Math.random() * source.length)].groupId;
        chosen = pool.filter(q => q.groupId === groupId);
        if (!app.hasAccess() && source === pool && pool.every(q => app.progress().banks[q.id]?.done)) {
          app.unlock?.(`免费的「${type}」已经做完了。完整版可以刷全部真题，小四门 19.9 一起解锁。`);
          return;
        }
      } else {
        chosen = [...source].sort(() => Math.random() - 0.5).slice(0, size);
      }
      app.practice(chosen);
      window.scrollTo(0, 0);
    } catch (error) { app.toast(error.message); }
    finally { button.disabled = false; }
  }

  function render() {
    state.paper = null;
    const filtered = catalog.filter(paper => paper.subject === state.subject &&
      (!state.region || paper.region === state.region) && (!state.year || String(paper.year) === state.year));
    const practice = state.mode === 'short' ? filtered.filter(paper => paper.questionCount > 0) : filtered;
    const typeCards = state.subject === 'english' && state.mode === 'short' ? englishTypeCards() : '';
    if (typeCards) {
      shell(`${drawFilters(catalog)}${typeCards}`);
      wireFilters();
      app.view.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => { void startType(button); }));
      return;
    }
    shell(`${drawFilters(catalog)}
      <p class="national-status muted" role="status">${app.hasAccess() ? '已解锁完整版，全部题目都能刷。' : '原卷免费看、免费打印。在线刷题和 Claude 解析属于小四门完整版（19.9 一起解锁），每份卷子可先免费试做一组。'}</p>
      <div class="national-paper-grid">${practice.length ? practice.map(paperCard).join('') :
        `<section class="card national-empty"><h2>${filtered.length ? '这科目前提供原卷与参考答案' : '当前筛选下暂无试卷'}</h2><p class="muted">${filtered.length ? '切换「按原卷练」即可查看和打印。' : '可以切换地区或年份再看看。'}</p>${filtered.length ? '<button type="button" class="btn primary" id="switchToPapers">查看原卷</button>' : ''}</section>`}</div>`);
    wireFilters();
    document.getElementById('switchToPapers')?.addEventListener('click', () => { state.mode = 'paper'; render(); });
    app.view.querySelectorAll('[data-start]').forEach(button => button.addEventListener('click', () => { void start(button); }));
    app.view.querySelectorAll('[data-read]').forEach(button => button.addEventListener('click', () => { void readPaper(button.dataset.read); }));
  }

  function wireFilters() {
    app.view.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { state.mode = button.dataset.mode; render(); }));
    app.view.querySelectorAll('[data-subject]').forEach(button => button.addEventListener('click', () => { state.subject = button.dataset.subject; render(); }));
    for (const [id, key] of [['nationalRegion', 'region'], ['nationalYear', 'year']]) {
      document.getElementById(id).addEventListener('change', event => { state[key] = event.target.value; render(); });
    }
  }

  async function start(button) {
    button.disabled = true;
    const version = ++revision;
    try {
      const paper = catalog.find(item => item.id === button.dataset.start);
      const questions = await getQuestions(paper);
      if (version !== revision || !opened) return;
      const pool = app.hasAccess() ? questions : questions.filter(q => q.preview);
      if (!pool.length) { app.unlock?.('在线刷题属于完整版，原卷可以免费看。'); return; }
      const progress = app.progress();
      const fresh = pool.filter(question => !progress.banks[question.id]?.done);
      const choices = fresh.length ? fresh : pool;
      let chosen = pool;
      if (state.mode === 'short') {
        if (paper.subject === 'english') chosen = pool.filter(question => question.groupId === choices[0].groupId);
        else chosen = choices.slice(0, 5);
      }
      app.practice(chosen);
      window.scrollTo(0, 0);
    } catch (error) { app.toast(error.message); }
    finally { button.disabled = false; }
  }

  function readerContent(paper, questions) {
    if (paper.pages?.length) {
      const pageImages = (paths, title) => `<section class="national-original"><h2>${title}</h2>${paths.map((url, i) =>
        `<figure><img src="${escape(url)}" alt="${escape(paper.title)}${title}第 ${i + 1} 页" loading="lazy" decoding="async"><figcaption>${title} · 第 ${i + 1} 页</figcaption></figure>`).join('')}</section>`;
      return pageImages(paper.pages, '原卷试题') + (state.showAnswers ? pageImages(paper.answerPages, '参考答案') : '');
    }
    return `<section class="national-prepared"><p class="muted">以下为已核对的${escape(paper.description)}，共 ${questions.length} 道。</p>${questions.map((question, i) =>
      `<article class="national-source-question">${question.materialHtml && (i === 0 || questions[i - 1].groupId !== question.groupId) ? `<div class="national-reading">${question.materialHtml}</div>` : ''}${question.originalHtml}
      ${state.showAnswers ? `<div class="national-answer"><strong>答案 ${escape(question.answer.join('、'))}</strong><p>${escape(question.explanation).replace(/\n/g, '<br>')}</p></div>` : ''}</article>`).join('')}</section>`;
  }

  async function readPaper(id) {
    const version = ++revision;
    const paper = catalog.find(item => item.id === id);
    state.paper = paper;
    state.showAnswers = false;
    try {
      const questions = paper.data ? await getQuestions(paper) : [];
      if (version !== revision || !opened) return;
      const draw = () => {
        shell(`<div class="national-reader-bar"><button type="button" class="btn" id="nationalBack">← 返回列表</button><button type="button" class="btn" id="nationalAnswers">${state.showAnswers ? '收起答案' : '显示答案'}</button><button type="button" class="btn" id="nationalPrint">打印</button></div>
          <h2 class="national-reader-title">${escape(paper.title)}</h2><div class="national-reader" id="nationalPrintArea">${readerContent(paper, questions)}</div>`);
        document.getElementById('nationalBack').onclick = () => { revision++; render(); };
        document.getElementById('nationalAnswers').onclick = () => { state.showAnswers = !state.showAnswers; draw(); };
        document.getElementById('nationalPrint').onclick = async event => {
          const button = event.currentTarget;
          button.disabled = true;
          button.textContent = '正在准备…';
          try {
            const images = [...document.querySelectorAll('#nationalPrintArea img')];
            images.forEach(img => { img.loading = 'eager'; });
            await Promise.all(images.map(img => img.decode()));
            if (state.paper?.id !== id || !opened) return;
            document.body.classList.add('national-printing');
            window.print();
          } catch { app.toast('原卷图片尚未加载完成，请稍后重试。'); }
          finally { button.disabled = false; button.textContent = '打印'; }
        };
      };
      draw();
      window.scrollTo(0, 0);
    } catch (error) { app.toast(error.message); render(); }
  }

  async function open() {
    if (!app) return;
    opened = true;
    const version = ++revision;
    if (location.hash !== '#national') history.pushState(null, '', '#national');
    shell('<div class="card" role="status">正在加载真题目录…</div>');
    try {
      await getCatalog();
      if (version === revision && opened) { render(); document.getElementById('nationalTitle')?.focus(); }
    } catch (error) {
      if (version !== revision || !opened) return;
      shell(`<div class="card"><p>${escape(error.message)}</p><button type="button" class="btn" id="nationalRetry">重试</button></div>`);
      document.getElementById('nationalRetry').onclick = open;
    }
  }

  window.addEventListener('afterprint', () => document.body.classList.remove('national-printing'));
  window.addEventListener('hashchange', () => {
    if (location.hash === '#national') void open();
    else if (opened) { opened = false; revision++; app?.home(); }
  });
  window.NationalExams = { attach: options => { app = options; }, open, leave };
})();
