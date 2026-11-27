'use strict';
(() => {
  const PROG_KEY = 'xiaosimen-yy-lab-v1';
  const stageEl = document.getElementById('yyStage');
  const progSummary = document.getElementById('yyProgSummary');
  const progFill = document.getElementById('yyProgFill');
  const tabBtns = [...document.querySelectorAll('.yy-tab')];

  let paidAccess = false;
  try { paidAccess = localStorage.getItem('xiaosimen_paid') === '1'; } catch {}
  void fetch('/api/access/status', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      if (d && typeof d.authenticated === 'boolean' && d.authenticated !== paidAccess) {
        paidAccess = d.authenticated;
        render();
      }
    }).catch(() => {});

  const isOwner = () => {
    try {
      const q = new URLSearchParams(location.search).get('me');
      if (q === '1') { localStorage.setItem('xiaosimen_owner', '1'); return true; }
      return localStorage.getItem('xiaosimen_owner') === '1';
    } catch { return false; }
  };
  const track = (event) => {
    if (isOwner()) return;
    const from = new URLSearchParams(location.search).get('from') || 'lab-yy';
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, source: from }),
      keepalive: true,
    }).catch(() => {});
  };
  track('yy_lab_open');

  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const loadProg = () => { try { return JSON.parse(localStorage.getItem(PROG_KEY) || '{}') || {}; } catch { return {}; } };
  const saveProg = (p) => { try { localStorage.setItem(PROG_KEY, JSON.stringify(p)); } catch {} };

  const DATA = window.YY_LAB_DATA || { poems: [], reading: [], clinic: [], vocab: [], grammar: [], writing: [], audio: [] };
  const prog = loadProg();
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

  function speakEn(text) {
    if (!canSpeak || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = 'en-US';
      u.rate = 0.92;
      const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
      const picked = voices.find(v => /^en[-_](US|GB)/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang));
      if (picked) u.voice = picked;
      window.speechSynthesis.speak(u);
    } catch {}
  }
  function speakBtnHTML(text, label = '🔊 朗读') {
    if (!canSpeak) return '';
    return `<button type="button" class="yy-speak-btn" data-speak="${esc(text)}">${label}</button>`;
  }

  const state = {
    tab: 'poems',
    idx: { poems: 0, reading: 0, clinic: 0, vocab: 0, grammar: 0, writing: 0 },
    // poems
    pActiveSlot: 0,
    pPicked: {},
    pMaskMode: false,
    // reading
    rPicked: new Set(),
    rChecked: false,
    // clinic
    cWenyanAns: {},
    cBugPicked: -1,
    cTypePicked: -1,
    // vocab
    vAns: {},
    // grammar
    gClueFound: false,
    gWrongClue: -1,
    gChoice: -1,
    // writing
    wTier: 'lv10',
    wBuildAns: {},
    // audio
    audioId: (DATA.audio?.[0]?.id) || 'yy-ep01',
    audioRate: 1,
    audioMask: false,
  };

  function allLevelIds() {
    return ['poems', 'reading', 'clinic', 'vocab', 'grammar', 'writing'].flatMap(k => (DATA[k] || []).map(x => x.id));
  }
  function updateProgress() {
    const ids = allLevelIds();
    const total = ids.length || 114;
    const done = ids.filter(id => prog[id]).length;
    if (progSummary) progSummary.textContent = `已攻克 ${done} / ${total} 关`;
    if (progFill) progFill.style.width = `${Math.round((done / total) * 100)}%`;
  }
  function markDone(id) {
    if (!prog[id]) {
      prog[id] = true;
      saveProg(prog);
      track('yy_lab_clear');
      updateProgress();
    }
  }

  function resetLevel(tab) {
    if (tab === 'poems') { state.pActiveSlot = 0; state.pPicked = {}; }
    else if (tab === 'reading') { state.rPicked = new Set(); state.rChecked = false; }
    else if (tab === 'clinic') { state.cWenyanAns = {}; state.cBugPicked = -1; state.cTypePicked = -1; }
    else if (tab === 'vocab') { state.vAns = {}; }
    else if (tab === 'grammar') { state.gClueFound = false; state.gWrongClue = -1; state.gChoice = -1; }
    else if (tab === 'writing') { state.wTier = 'lv10'; state.wBuildAns = {}; }
  }

  function levelStripHTML(tab, list) {
    const cur = state.idx[tab];
    return `<div class="yy-level-strip">${list.map((lv, i) => {
      const locked = !paidAccess && !lv.free;
      const done = !!prog[lv.id];
      const cls = ['yy-pill', i === cur ? 'is-cur' : '', done ? 'is-done' : '', locked ? 'is-lock' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${cls}" data-pick-lv="${i}">${done ? '✓ ' : (locked ? '🔒 ' : '')}第 ${i + 1} 关</button>`;
    }).join('')}</div>`;
  }

  function lockBoxHTML(moduleName, totalCnt, freeCnt) {
    return `<div class="yy-lock-box">
      <span class="yy-chip gold">前 ${freeCnt} 关已免费体验</span>
      <h3>解锁全部 ${totalCnt} 关「${esc(moduleName)}」</h3>
      <p>开通爱丽克丝中考题库完整版（¥19.9 一次买断），立即解锁《语英提分工坊》全 114 关 ＋ 3 期女声听写 ＋ 全科 253 条带口诀 A4 默写纸 ＋ 小四门《考点演播室》＋ 数理化 395 点与 59 大压轴模型，绝不二次收费。</p>
      <div class="yy-actions">
        <a class="yy-btn primary" href="./?from=lab-yy-lock">去首页开通完整版 ¥19.9 →</a>
        <button type="button" class="yy-btn" data-pick-lv="0">先重温免费关卡</button>
      </div>
    </div>`;
  }

  function nextBtnHTML(tab, list) {
    const cur = state.idx[tab];
    return cur + 1 < list.length
      ? `<button type="button" class="yy-btn primary" data-pick-lv="${cur + 1}">下一关（第 ${cur + 2} 关）→</button>`
      : `<span class="yy-chip">🎉 本工作台已全部通关！</span>`;
  }

  // ==================== 1. 古诗文易错字排雷 ====================
  function renderPoems() {
    const list = DATA.poems || [];
    const cur = state.idx.poems;
    const lv = list[cur];
    if (!lv) return '';
    if (!paidAccess && !lv.free) return levelStripHTML('poems', list) + lockBoxHTML('古诗文易错字排雷', list.length, 6);

    const blanks = [];
    lv.segments.forEach((seg, si) => { if (typeof seg === 'object') blanks.push({ si, ...seg }); });
    const allRight = blanks.length > 0 && blanks.every((b, bi) => state.pPicked[bi] === b.blank);
    if (allRight) markDone(lv.id);

    let bIdx = 0;
    const lineHtml = lv.segments.map(seg => {
      if (typeof seg === 'string') return esc(seg);
      const myIdx = bIdx++;
      const picked = state.pPicked[myIdx];
      const cls = ['yy-char-slot', myIdx === state.pActiveSlot && !allRight ? 'is-cur' : '', picked ? (picked === seg.blank ? 'is-ok' : 'is-bad') : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${cls}" data-poem-slot="${myIdx}">${picked ? esc(picked) : '？'}</button>`;
    }).join('');

    const activeBlank = blanks[state.pActiveSlot] || blanks[0];
    const activePicked = state.pPicked[state.pActiveSlot];

    return `${levelStripHTML('poems', list)}
      <article class="yy-card">
        <div class="yy-card-head">
          <span class="yy-chip">${esc(lv.stage)} · ${esc(lv.title)}（${esc(lv.author)}）</span>
          <button type="button" class="yy-btn sm" id="yyPoemMaskToggle">${state.pMaskMode ? '切回排雷选字' : '纯默写遮罩自测'}</button>
        </div>
        <div class="yy-poem-prompt">理解性默写：${esc(lv.prompt)}</div>
        ${state.pMaskMode ? `
          <div class="yy-poem-line" id="yyPoemMaskLine" style="cursor:pointer" title="点击揭晓完整名句">
            <span style="color:#92400e;font-size:15px">先在心里或纸上默写，再点下方按钮核对：</span>
          </div>
          <div class="yy-actions">
            <button type="button" class="yy-btn primary" id="yyPoemReveal">揭晓标准原文与红线</button>
            ${nextBtnHTML('poems', list)}
          </div>
          <div id="yyPoemMaskAns" hidden>
            <div class="yy-feedback is-ok">
              <b>标准原文：${esc(lv.fullLine)}</b>
              <div class="yy-mnemonic">💡 易错字红线：${esc(lv.redline)}</div>
            </div>
          </div>
        ` : `
          <div class="yy-poem-line">${lineHtml}</div>
          ${!allRight && activeBlank ? `
            <div class="yy-char-picker">
              <span class="yy-sub" style="width:100%;text-align:center">点击选出第 ${state.pActiveSlot + 1} 个陷阱字位的正确汉字：</span>
              ${activeBlank.choices.map(ch => `<button type="button" class="yy-char-opt" data-poem-choice="${esc(ch)}">${esc(ch)}</button>`).join('')}
            </div>
          ` : ''}
          ${activePicked && activePicked !== activeBlank.blank ? `<div class="yy-feedback is-bad"><b>⚠️ 踩坑啦！</b><span>${esc(activeBlank.tip)}</span></div>` : ''}
          ${allRight ? `
            <div class="yy-feedback is-ok">
              <b>✅ 全部排雷成功！规范句：${esc(lv.fullLine)}</b>
              <div>${blanks.map(b => `<div>• <b>${esc(b.blank)}</b>：${esc(b.tip)}</div>`).join('')}</div>
              <div class="yy-mnemonic">💡 一句话红线：${esc(lv.redline)}</div>
            </div>
            <div class="yy-actions">
              ${nextBtnHTML('poems', list)}
              <button type="button" class="yy-btn" id="yyPoemReset">再练一遍</button>
            </div>
          ` : ''}
        `}
      </article>`;
  }

  // ==================== 2. 现代文/古诗阅读采分点公式 ====================
  function renderReading() {
    const list = DATA.reading || [];
    const cur = state.idx.reading;
    const lv = list[cur];
    if (!lv) return '';
    if (!paidAccess && !lv.free) return levelStripHTML('reading', list) + lockBoxHTML('阅读采分点公式拆解', list.length, 4);

    const okIndices = lv.quiz.options.map((o, i) => (o.ok ? i : -1)).filter(i => i >= 0);
    const allCorrect = state.rChecked && okIndices.length === state.rPicked.size && okIndices.every(i => state.rPicked.has(i));
    if (allCorrect) markDone(lv.id);

    return `${levelStripHTML('reading', list)}
      <article class="yy-card">
        <div class="yy-card-head">
          <span class="yy-chip">${esc(lv.genre)} · 母题 ${cur + 1}/${list.length}</span>
          <button type="button" class="yy-btn sm gold" id="yyPrintReading">🖨️ 印 A4《阅读公式速查卡》</button>
        </div>
        <h2>${esc(lv.title)}</h2>
        <div class="yy-formula-row">${lv.formula.map(f => `<span class="yy-formula-tag">${esc(f)}</span>`).join('')}</div>
        <div class="yy-excerpt">
          <div><b>【真题微段落】</b>${esc(lv.excerpt)}</div>
          <div style="margin-top:6px"><b>【设问】</b>${esc(lv.question)}</div>
        </div>
        <div class="yy-sub"><b>互动踩点：</b>${esc(lv.quiz.prompt)}</div>
        <div class="yy-check-opts">
          ${lv.quiz.options.map((opt, oi) => {
            const picked = state.rPicked.has(oi);
            let cls = 'yy-check-btn';
            if (state.rChecked) {
              if (opt.ok && picked) cls += ' is-ok';
              else if (!opt.ok && picked) cls += ' is-bad';
              else if (opt.ok && !picked) cls += ' is-picked';
            } else if (picked) cls += ' is-picked';
            return `<button type="button" class="${cls}" data-read-opt="${oi}"><span>${picked ? '☑' : '☐'}</span><span>${esc(opt.text)}</span></button>`;
          }).join('')}
        </div>
        <div class="yy-actions">
          <button type="button" class="yy-btn primary" id="yyReadCheck">核对采分点 & 看阅卷对比</button>
          ${state.rChecked ? nextBtnHTML('reading', list) : ''}
        </div>
        ${state.rChecked ? `
          <div class="yy-feedback ${allCorrect ? 'is-ok' : 'is-bad'}">
            <b>${allCorrect ? '✅ 精准踩中全部采分点！' : '⚠️ 有漏踩或误选了空洞套话，对照下方阅卷标准看差距：'}</b>
          </div>
          <div class="yy-compare-grid">
            <div class="yy-cmp-box is-weak">
              <h4>❌ 普通低分流水账答案</h4>
              <div>${esc(lv.weakAns)}</div>
              <p style="margin:6px 0 0;color:#991b1b"><b>${esc(lv.weakWhy)}</b></p>
            </div>
            <div class="yy-cmp-box is-full">
              <h4>✅ 中考满分踩点答案</h4>
              <div>${esc(lv.fullAns)}</div>
            </div>
          </div>
          <div class="yy-mnemonic">💡 秒记口诀：${esc(lv.mnemonic)}</div>
        ` : ''}
      </article>`;
  }

  // ==================== 3. 文言实虚词 & 病句手术台 ====================
  function renderClinic() {
    const list = DATA.clinic || [];
    const cur = state.idx.clinic;
    const lv = list[cur];
    if (!lv) return '';
    if (!paidAccess && !lv.free) return levelStripHTML('clinic', list) + lockBoxHTML('文言实虚词与病句手术台', list.length, 4);

    if (lv.mode === 'wenyan') {
      const allRight = lv.pairs.every((p, pi) => state.cWenyanAns[pi] === p.answer);
      if (allRight) markDone(lv.id);
      return `${levelStripHTML('clinic', list)}
        <article class="yy-card">
          <div class="yy-card-head">
            <span class="yy-chip">文言一字多面 · 核心字「${esc(lv.word)}」</span>
            <span class="yy-sub">第 ${cur + 1} / ${list.length} 关</span>
          </div>
          <h2>${esc(lv.title)}</h2>
          <p class="yy-sub">同一个文言高频字放进不同课内真句，点选它在每句中的准确义项：</p>
          ${lv.pairs.map((p, pi) => {
            const chosen = state.cWenyanAns[pi];
            const sentHtml = esc(p.sentence).replace(/【([^】]+)】/g, '<mark>$1</mark>');
            return `<div class="yy-wenyan-row">
              <div class="yy-wenyan-sent">${pi + 1}. ${sentHtml}</div>
              <div class="yy-vocab-choices">
                ${p.choices.map((c, ci) => {
                  const cls = ['yy-vocab-btn', chosen === ci ? (ci === p.answer ? 'is-right' : 'is-wrong') : ''].filter(Boolean).join(' ');
                  return `<button type="button" class="${cls}" data-wy-pair="${pi}" data-wy-opt="${ci}">${esc(c)}</button>`;
                }).join('')}
              </div>
              ${chosen !== undefined ? `<div class="yy-sub" style="color:${chosen === p.answer ? '#15803d' : '#b91c1c'}">${chosen === p.answer ? '✓ ' : '✗ '}${esc(p.explain)}</div>` : ''}
            </div>`;
          }).join('')}
          ${allRight ? `
            <div class="yy-mnemonic">💡 位置速判口诀：${esc(lv.mnemonic)}</div>
            <div class="yy-actions">${nextBtnHTML('clinic', list)}</div>
          ` : ''}
        </article>`;
    }

    // 病句手术台
    const bugFound = state.cBugPicked === lv.bugIdx;
    const typeRight = bugFound && state.cTypePicked === lv.answerType;
    if (typeRight) markDone(lv.id);

    return `${levelStripHTML('clinic', list)}
      <article class="yy-card">
        <div class="yy-card-head">
          <span class="yy-chip gold">🩺 病句找茬手术台</span>
          <span class="yy-sub">第 ${cur + 1} / ${list.length} 关</span>
        </div>
        <h2>${esc(lv.title)}</h2>
        <p class="yy-sub"><b>第 1 步：</b>点击下面句子里“导致语病的病灶词块”把它揪出来！</p>
        <div class="yy-token-strip">
          ${lv.tokens.map((tk, ti) => {
            const isPicked = state.cBugPicked === ti;
            const cls = ['yy-token', isPicked ? (ti === lv.bugIdx ? 'is-clue' : 'is-bug') : ''].filter(Boolean).join(' ');
            return `<button type="button" class="${cls}" data-bug-tk="${ti}">${esc(tk)}</button>`;
          }).join('')}
        </div>
        ${state.cBugPicked >= 0 && !bugFound ? `<div class="yy-feedback is-bad"><b>还没揪准病灶哦！</b><span>再读一遍句子，看看哪个词导致主语消失、前后矛盾或搭配出错。</span></div>` : ''}
        ${bugFound ? `
          <div class="yy-feedback is-ok"><b>✅ 病灶已锁定：「${esc(lv.tokens[lv.bugIdx])}」！</b><span>第 2 步：请判定它属于哪种中考高频病因：</span></div>
          <div class="yy-opts">
            ${lv.bugTypes.map((bt, bi) => {
              const cls = ['yy-opt', state.cTypePicked === bi ? (bi === lv.answerType ? 'is-right' : 'is-wrong') : ''].filter(Boolean).join(' ');
              return `<button type="button" class="${cls}" data-bug-type="${bi}">${esc(bt)}</button>`;
            }).join('')}
          </div>
        ` : ''}
        ${typeRight ? `
          <div class="yy-feedback is-ok">
            <b>🎉 手术成功！修改后的规范句：</b>
            <div>${esc(lv.fixed)}</div>
            <div class="yy-mnemonic">💡 病因解析：${esc(lv.explain)}</div>
          </div>
          <div class="yy-actions">${nextBtnHTML('clinic', list)}</div>
        ` : ''}
      </article>`;
  }

  // ==================== 4. 英语动词变形 & 固定搭配 ====================
  function renderVocab() {
    const list = DATA.vocab || [];
    const cur = state.idx.vocab;
    const lv = list[cur];
    if (!lv) return '';
    if (!paidAccess && !lv.free) return levelStripHTML('vocab', list) + lockBoxHTML('英语词形与固定搭配冲刺', list.length, 4);

    const allRight = lv.items.every((it, ii) => state.vAns[ii] === it.answer);
    if (allRight) markDone(lv.id);

    return `${levelStripHTML('vocab', list)}
      <article class="yy-card">
        <div class="yy-card-head">
          <span class="yy-chip en">${esc(lv.category)} · 第 ${cur + 1}/${list.length} 组</span>
          <span class="yy-sub">${canSpeak ? '答对可点 🔊 跟读完整例句' : '真题语境快刷'}</span>
        </div>
        <h2>${esc(lv.title)}</h2>
        <div class="yy-mnemonic">💡 秒记口诀：${esc(lv.mnemonic)}</div>
        ${lv.items.map((it, ii) => {
          const picked = state.vAns[ii];
          const isOk = picked === it.answer;
          return `<div class="yy-vocab-item">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
              <span class="yy-vocab-stem">${ii + 1}. ${esc(isOk ? it.en : it.stem)}</span>
              ${isOk ? speakBtnHTML(it.en) : ''}
            </div>
            <div class="yy-vocab-choices">
              ${it.choices.map((c, ci) => {
                const cls = ['yy-vocab-btn', picked === ci ? (ci === it.answer ? 'is-right' : 'is-wrong') : ''].filter(Boolean).join(' ');
                return `<button type="button" class="${cls}" data-v-item="${ii}" data-v-opt="${ci}">${esc(c)}</button>`;
              }).join('')}
            </div>
            ${picked !== undefined ? `<div class="yy-sub" style="color:${isOk ? '#15803d' : '#b91c1c'}">${isOk ? '✓ ' : '✗ '}${esc(it.explain)}</div>` : ''}
          </div>`;
        }).join('')}
        ${allRight ? `<div class="yy-actions">${nextBtnHTML('vocab', list)}</div>` : ''}
      </article>`;
  }

  // ==================== 5. 英语语法 & 微完形“线索破案” ====================
  function renderGrammar() {
    const list = DATA.grammar || [];
    const cur = state.idx.grammar;
    const lv = list[cur];
    if (!lv) return '';
    if (!paidAccess && !lv.free) return levelStripHTML('grammar', list) + lockBoxHTML('英语语法与微完形线索破案', list.length, 4);

    const solved = state.gClueFound && state.gChoice === lv.answer;
    if (solved) markDone(lv.id);

    return `${levelStripHTML('grammar', list)}
      <article class="yy-card">
        <div class="yy-card-head">
          <span class="yy-chip en">${esc(lv.category)} · 第 ${cur + 1}/${list.length} 关</span>
          ${solved ? speakBtnHTML(lv.fullEn, '🔊 朗读完整句') : ''}
        </div>
        <h2>${esc(lv.title)}</h2>
        <p class="yy-sub"><b>第 1 步（先找证据再选答案）：</b>${esc(lv.clueHint)}</p>
        <div class="yy-token-strip">
          ${lv.tokens.map((tk, ti) => {
            const isBlank = tk === '____';
            const cls = [
              'yy-token',
              isBlank ? 'is-blank' : '',
              state.gClueFound && ti === lv.clueIdx ? 'is-clue' : '',
              !state.gClueFound && state.gWrongClue === ti ? 'is-bug' : '',
            ].filter(Boolean).join(' ');
            const label = (isBlank && solved) ? lv.choices[lv.answer] : tk;
            return `<button type="button" class="${cls}" data-g-tk="${ti}" ${isBlank ? 'disabled' : ''}>${esc(label)}</button>`;
          }).join('')}
        </div>
        ${!state.gClueFound && state.gWrongClue >= 0 ? `<div class="yy-feedback is-bad"><b>不是这个词哦！</b><span>再找找决定时态、从句或上下文逻辑的关键词（${esc(lv.clueHint)}）。</span></div>` : ''}
        ${state.gClueFound ? `
          <div class="yy-feedback is-ok"><b>🔎 线索词已高亮：「${esc(lv.tokens[lv.clueIdx])}」！</b><span>第 2 步：根据这条线索锁定正确答案：</span></div>
          <div class="yy-opts">
            ${lv.choices.map((c, ci) => {
              const cls = ['yy-opt', state.gChoice === ci ? (ci === lv.answer ? 'is-right' : 'is-wrong') : ''].filter(Boolean).join(' ');
              return `<button type="button" class="${cls}" data-g-opt="${ci}">${String.fromCharCode(65 + ci)}. ${esc(c)}</button>`;
            }).join('')}
          </div>
        ` : ''}
        ${solved ? `
          <div class="yy-feedback is-ok">
            <b>✅ 破案成功！完整句：${esc(lv.fullEn)}</b>
            <div class="yy-mnemonic">💡 线索推演：${esc(lv.rule)}</div>
          </div>
          <div class="yy-actions">${nextBtnHTML('grammar', list)}</div>
        ` : ''}
      </article>`;
  }

  // ==================== 6. 中考英语作文三级升格工坊 ====================
  function renderWriting() {
    const list = DATA.writing || [];
    const cur = state.idx.writing;
    const lv = list[cur];
    if (!lv) return '';
    if (!paidAccess && !lv.free) return levelStripHTML('writing', list) + lockBoxHTML('中考英语作文三级升格工坊', list.length, 3);

    const tierObj = lv.levels[state.wTier] || lv.levels.lv10;
    const buildSolved = lv.builder.blanks.every((b, bi) => state.wBuildAns[bi] === b.answer);
    if (buildSolved) markDone(lv.id);

    let bCursor = 0;
    const buildLine = lv.builder.parts.map(p => {
      if (p !== '____') return `<span>${esc(p)}</span>`;
      const bi = bCursor++;
      const picked = state.wBuildAns[bi];
      const txt = picked !== undefined ? lv.builder.blanks[bi].choices[picked] : `【空 ${bi + 1}】`;
      const ok = picked === lv.builder.blanks[bi].answer;
      return `<b style="padding:2px 7px;border-radius:6px;background:${picked === undefined ? '#fef3c7' : (ok ? '#dcfce7' : '#fee2e2')};color:${picked === undefined ? '#92400e' : (ok ? '#14532d' : '#991b1b')}">${esc(txt)}</b>`;
    }).join(' ');

    return `${levelStripHTML('writing', list)}
      <article class="yy-card">
        <div class="yy-card-head">
          <span class="yy-chip en">话题 ${cur + 1}/${list.length} · ${esc(lv.topic)}</span>
          <button type="button" class="yy-btn sm gold" id="yyPrintWriting">🖨️ 印 A4《英语作文金句卡》</button>
        </div>
        <h2>${esc(lv.title)}</h2>
        <p class="yy-sub">${esc(lv.scene)}</p>

        <div class="yy-tier-tabs">
          <button type="button" class="yy-tier-btn ${state.wTier === 'lv10' ? 'is-active' : ''}" data-tier="lv10">普通 10 分句</button>
          <button type="button" class="yy-tier-btn ${state.wTier === 'lv13' ? 'is-active' : ''}" data-tier="lv13">进阶 13 分句</button>
          <button type="button" class="yy-tier-btn ${state.wTier === 'lv15' ? 'is-active' : ''}" data-tier="lv15">🔥 高分 15 分句</button>
        </div>

        <div class="yy-upgrade-box">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="yy-chip gold">${esc(tierObj.label)}</span>
            ${speakBtnHTML(tierObj.en, '🔊 听读本句')}
          </div>
          <div class="yy-upgrade-en">${esc(tierObj.en)}</div>
          <div class="yy-upgrade-cn">${esc(tierObj.cn)}</div>
          <div class="yy-hi-tags">${tierObj.highlights.map(h => `<span class="yy-hi-tag">★ ${esc(h)}</span>`).join('')}</div>
        </div>

        <div class="yy-builder-box">
          <b>✍️ 考场仿写组装：${esc(lv.builder.prompt)}</b>
          <div style="font-size:15.5px;line-height:1.8">${buildLine}</div>
          ${lv.builder.blanks.map((b, bi) => `
            <div class="yy-vocab-choices">
              <span class="yy-sub" style="align-self:center">空 ${bi + 1}：</span>
              ${b.choices.map((c, ci) => {
                const picked = state.wBuildAns[bi];
                const cls = ['yy-vocab-btn', picked === ci ? (ci === b.answer ? 'is-right' : 'is-wrong') : ''].filter(Boolean).join(' ');
                return `<button type="button" class="${cls}" data-wb-idx="${bi}" data-wb-opt="${ci}">${esc(c)}</button>`;
              }).join('')}
            </div>
          `).join('')}
          ${buildSolved ? `<div class="yy-feedback is-ok"><b>✅ 组装成功！考场直接用这句立拉 2–3 分！</b></div>` : ''}
        </div>

        <div>
          <b style="display:block;margin-bottom:6px;font-size:14px">📌 本主题万能开头 / 结尾金句：</b>
          <div class="yy-tpl-list">
            ${lv.templates.map(t => `<div class="yy-tpl-item">
              <div><div style="font-weight:700;color:#0f2540">${esc(t.en)}</div><div class="yy-sub">${esc(t.cn)}</div></div>
              ${speakBtnHTML(t.en, '🔊')}
            </div>`).join('')}
          </div>
        </div>

        <div class="yy-actions">${nextBtnHTML('writing', list)}</div>
      </article>`;
  }

  // ==================== 7. 语文古诗文易错字听写磨耳朵 ====================
  function renderAudio() {
    const eps = DATA.audio || [];
    const cur = eps.find(e => e.id === state.audioId) || eps[0];
    if (!cur) return '';
    const locked = !paidAccess && !cur.free;

    return `
      <div class="yy-audio-player">
        <span class="yy-badge" style="justify-self:start">🎧 专属女声 · 古诗文易错字听写磨耳朵</span>
        <div class="yy-ap-title">${esc(cur.title)}</div>
        <div class="yy-ap-sub">${esc(cur.subtitle)} · ${esc(cur.duration)}</div>
        ${locked ? `
          <div style="padding:12px;border-radius:10px;background:rgba(255,255,255,.12);font-size:13.5px">
            本讲为完整版专属（前 2 期免费听写）。开通 ¥19.9 完整版立即解锁全 3 期语文听写 ＋ 6 期小四门故事音频！
            <div style="margin-top:8px"><a class="yy-btn gold sm" href="./?from=lab-yy-audio">去首页解锁完整版 ¥19.9 →</a></div>
          </div>
        ` : `
          <audio id="yyAudioEl" controls preload="metadata" src="${esc(cur.src)}"></audio>
          <div class="yy-ap-controls">
            <span style="font-size:12px;color:#cfe2f2">语速：</span>
            ${[0.85, 1, 1.15].map(r => `<button type="button" class="yy-ap-btn ${state.audioRate === r ? 'is-on' : ''}" data-ar="${r}">${r}x</button>`).join('')}
            <button type="button" class="yy-ap-btn ${state.audioMask ? 'is-on' : ''}" id="yyAudioMaskBtn">${state.audioMask ? '🔓 揭晓全部红线词' : '🙈 遮住红线词盲听默写'}</button>
          </div>
        `}
      </div>

      <div class="yy-ep-list">
        ${eps.map(ep => {
          const epLocked = !paidAccess && !ep.free;
          return `<button type="button" class="yy-ep-row ${ep.id === cur.id ? 'is-active' : ''}" data-ep="${esc(ep.id)}">
            <div>
              <div style="font-weight:700;font-size:14.5px">${epLocked ? '🔒 ' : '▶ '}${esc(ep.title)}</div>
              <div class="yy-sub">${esc(ep.subtitle)}</div>
            </div>
            <span class="yy-chip ${ep.free ? '' : 'gold'}">${ep.free ? '免费' : '完整版'}</span>
          </button>`;
        }).join('')}
      </div>

      ${!locked ? `
        <article class="yy-card">
          <div class="yy-card-head">
            <span class="yy-chip gold">📝 本期必默易错字红线（${cur.checkpoints.length} 组）</span>
            <span class="yy-sub">${state.audioMask ? '已遮罩：点击任意词块单独核对' : '建议先点上方“遮住红线词”边听边在纸上默写'}</span>
          </div>
          <div class="yy-cp-chips">
            ${cur.checkpoints.map(cp => `<span class="yy-cp-chip ${state.audioMask ? 'is-masked' : ''}" data-cp-chip>${esc(cp)}</span>`).join('')}
          </div>
          <details>
            <summary style="cursor:pointer;font-weight:700;color:var(--indigo)">展开本期完整规范文字稿（核对字形用）›</summary>
            <div style="margin-top:8px;display:grid;gap:8px;font-size:14px;line-height:1.75;color:#2b3530">
              ${cur.displayScript.map(p => `<p style="margin:0">${esc(p)}</p>`).join('')}
            </div>
          </details>
        </article>
      ` : ''}
    `;
  }

  // ==================== A4 打印生成器 ====================
  function openPrintSheet(kind) {
    track('yy_print');
    const old = document.getElementById('yyPrintOverlay');
    if (old) old.remove();
    const isReading = kind === 'reading';
    const list = isReading ? (DATA.reading || []) : (DATA.writing || []);
    const freeLimit = isReading ? 4 : 3;
    const picked = paidAccess ? list : list.slice(0, freeLimit);
    const omitted = list.length - picked.length;
    const title = isReading ? '中考语文阅读答题公式速查卡' : '中考英语作文三级升格金句手卡';

    const itemsHtml = isReading
      ? picked.map((it, i) => `<div class="yy-pr-item">
          <h3>${i + 1}. 【${esc(it.genre)}】${esc(it.title)}</h3>
          <p><b>采分公式：</b>${it.formula.map(esc).join(' → ')}</p>
          <p><b>满分示例：</b>${esc(it.fullAns)}</p>
          <p><b>秒记口诀：</b>${esc(it.mnemonic)}</p>
        </div>`).join('')
      : picked.map((it, i) => `<div class="yy-pr-item">
          <h3>${i + 1}. 【${esc(it.topic)}】${esc(it.title)} <small style="font-weight:400;color:#555">（${esc(it.scene)}）</small></h3>
          <p><b>普通 10 分句：</b>${esc(it.levels.lv10.en)}</p>
          <p><b>高分 15 分句：</b><b>${esc(it.levels.lv15.en)}</b>（${esc(it.levels.lv15.cn)}）</p>
          <p><b>万能模板：</b>${it.templates.map(t => `${esc(t.en)}`).join(' ｜ ')}</p>
        </div>`).join('');

    const overlay = document.createElement('div');
    overlay.id = 'yyPrintOverlay';
    overlay.className = 'yy-print-overlay';
    overlay.innerHTML = `
      <div class="yy-pr-bar no-print">
        <b>${title}（共 ${picked.length} 项）</b>
        <div class="yy-actions">
          ${!paidAccess && omitted > 0 ? `<a class="yy-btn gold sm" href="./?from=lab-yy-print">回首页开通 ¥19.9 印全部 ${list.length} 项</a>` : ''}
          <button type="button" class="yy-btn green sm" id="yyPrGo">立即打印 / 存 PDF</button>
          <button type="button" class="yy-btn sm" id="yyPrClose">关闭</button>
        </div>
      </div>
      <div class="yy-pr-page">
        ${!paidAccess && omitted > 0 ? `<div class="yy-pr-note">免费体验可打印前 ${freeLimit} 项，完整版 ¥19.9 一次买断可无水印打印全部 ${list.length} 项及全科 253 条默写纸。</div>` : ''}
        <header class="yy-pr-head">
          <h1>爱丽克丝中考题库 · ${title}</h1>
          <p>初一到初三通用 · 姓名：__________　日期：__________</p>
        </header>
        ${itemsHtml}
      </div>`;
    document.body.appendChild(overlay);
    document.body.classList.add('yy-printing');
    overlay.querySelector('#yyPrClose').addEventListener('click', () => { overlay.remove(); document.body.classList.remove('yy-printing'); });
    overlay.querySelector('#yyPrGo').addEventListener('click', () => window.print());
  }

  // ==================== 渲染与事件绑定 ====================
  function render() {
    updateProgress();
    tabBtns.forEach(b => {
      const on = b.dataset.tab === state.tab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    if (state.tab === 'poems') stageEl.innerHTML = renderPoems();
    else if (state.tab === 'reading') stageEl.innerHTML = renderReading();
    else if (state.tab === 'clinic') stageEl.innerHTML = renderClinic();
    else if (state.tab === 'vocab') stageEl.innerHTML = renderVocab();
    else if (state.tab === 'grammar') stageEl.innerHTML = renderGrammar();
    else if (state.tab === 'writing') stageEl.innerHTML = renderWriting();
    else if (state.tab === 'audio') stageEl.innerHTML = renderAudio();
    wireStage();
  }

  function wireStage() {
    stageEl.querySelectorAll('[data-pick-lv]').forEach(btn => btn.addEventListener('click', () => {
      state.idx[state.tab] = Number(btn.dataset.pickLv) || 0;
      resetLevel(state.tab);
      render();
    }));
    stageEl.querySelectorAll('[data-speak]').forEach(btn => btn.addEventListener('click', () => speakEn(btn.dataset.speak)));

    // poems
    stageEl.querySelector('#yyPoemMaskToggle')?.addEventListener('click', () => { state.pMaskMode = !state.pMaskMode; render(); });
    stageEl.querySelector('#yyPoemReveal')?.addEventListener('click', () => {
      const box = document.getElementById('yyPoemMaskAns');
      if (box) box.hidden = false;
      const lv = DATA.poems[state.idx.poems];
      if (lv) markDone(lv.id);
    });
    stageEl.querySelector('#yyPoemReset')?.addEventListener('click', () => { resetLevel('poems'); render(); });
    stageEl.querySelectorAll('[data-poem-slot]').forEach(b => b.addEventListener('click', () => {
      state.pActiveSlot = Number(b.dataset.poemSlot) || 0;
      render();
    }));
    stageEl.querySelectorAll('[data-poem-choice]').forEach(b => b.addEventListener('click', () => {
      const ch = b.dataset.poemChoice;
      const lv = DATA.poems[state.idx.poems];
      const blanks = lv.segments.filter(s => typeof s === 'object');
      state.pPicked[state.pActiveSlot] = ch;
      if (blanks[state.pActiveSlot] && ch === blanks[state.pActiveSlot].blank) {
        const nextEmpty = blanks.findIndex((bl, bi) => state.pPicked[bi] !== bl.blank);
        if (nextEmpty >= 0) state.pActiveSlot = nextEmpty;
      }
      render();
    }));

    // reading
    stageEl.querySelectorAll('[data-read-opt]').forEach(b => b.addEventListener('click', () => {
      if (state.rChecked) return;
      const oi = Number(b.dataset.readOpt);
      if (state.rPicked.has(oi)) state.rPicked.delete(oi); else state.rPicked.add(oi);
      render();
    }));
    stageEl.querySelector('#yyReadCheck')?.addEventListener('click', () => { state.rChecked = true; render(); });
    stageEl.querySelector('#yyPrintReading')?.addEventListener('click', () => openPrintSheet('reading'));

    // clinic
    stageEl.querySelectorAll('[data-wy-pair]').forEach(b => b.addEventListener('click', () => {
      state.cWenyanAns[Number(b.dataset.wyPair)] = Number(b.dataset.wyOpt);
      render();
    }));
    stageEl.querySelectorAll('[data-bug-tk]').forEach(b => b.addEventListener('click', () => {
      state.cBugPicked = Number(b.dataset.bugTk);
      state.cTypePicked = -1;
      render();
    }));
    stageEl.querySelectorAll('[data-bug-type]').forEach(b => b.addEventListener('click', () => {
      state.cTypePicked = Number(b.dataset.bugType);
      render();
    }));

    // vocab
    stageEl.querySelectorAll('[data-v-item]').forEach(b => b.addEventListener('click', () => {
      state.vAns[Number(b.dataset.vItem)] = Number(b.dataset.vOpt);
      render();
    }));

    // grammar
    stageEl.querySelectorAll('[data-g-tk]').forEach(b => b.addEventListener('click', () => {
      const lv = DATA.grammar[state.idx.grammar];
      const ti = Number(b.dataset.gTk);
      if (ti === lv.clueIdx) { state.gClueFound = true; state.gWrongClue = -1; }
      else state.gWrongClue = ti;
      render();
    }));
    stageEl.querySelectorAll('[data-g-opt]').forEach(b => b.addEventListener('click', () => {
      state.gChoice = Number(b.dataset.gOpt);
      render();
    }));

    // writing
    stageEl.querySelectorAll('[data-tier]').forEach(b => b.addEventListener('click', () => {
      state.wTier = b.dataset.tier;
      render();
    }));
    stageEl.querySelectorAll('[data-wb-idx]').forEach(b => b.addEventListener('click', () => {
      state.wBuildAns[Number(b.dataset.wbIdx)] = Number(b.dataset.wbOpt);
      render();
    }));
    stageEl.querySelector('#yyPrintWriting')?.addEventListener('click', () => openPrintSheet('writing'));

    // audio
    const audioEl = document.getElementById('yyAudioEl');
    if (audioEl) {
      audioEl.playbackRate = state.audioRate;
      audioEl.addEventListener('play', () => track('yy_audio_play'), { once: true });
    }
    stageEl.querySelectorAll('[data-ar]').forEach(b => b.addEventListener('click', () => {
      state.audioRate = Number(b.dataset.ar) || 1;
      if (audioEl) audioEl.playbackRate = state.audioRate;
      render();
    }));
    stageEl.querySelectorAll('[data-ep]').forEach(b => b.addEventListener('click', () => {
      state.audioId = b.dataset.ep;
      render();
    }));
    stageEl.querySelector('#yyAudioMaskBtn')?.addEventListener('click', () => {
      state.audioMask = !state.audioMask;
      render();
    });
    stageEl.querySelectorAll('[data-cp-chip]').forEach(el => el.addEventListener('click', () => {
      el.classList.toggle('is-masked');
    }));
  }

  tabBtns.forEach(btn => btn.addEventListener('click', () => {
    state.tab = btn.dataset.tab;
    render();
  }));

  const initTab = new URLSearchParams(location.search).get('tab');
  if (['poems', 'reading', 'clinic', 'vocab', 'grammar', 'writing', 'audio'].includes(initTab)) {
    state.tab = initTab;
  }
  render();
})();
