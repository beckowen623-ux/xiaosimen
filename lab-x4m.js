'use strict';
(() => {
  const PROG_KEY = 'xiaosimen-x4m-lab-v1';
  const stageEl = document.getElementById('lxStage');
  const progSummary = document.getElementById('lxProgSummary');
  const progFill = document.getElementById('lxProgFill');
  const tabBtns = [...document.querySelectorAll('.lx-tab')];

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
    const from = new URLSearchParams(location.search).get('from') || 'lab-x4m';
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, source: from }),
      keepalive: true,
    }).catch(() => {});
  };
  track('x4m_lab_open');

  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const loadProg = () => { try { return JSON.parse(localStorage.getItem(PROG_KEY) || '{}') || {}; } catch { return {}; } };
  const saveProg = (p) => { try { localStorage.setItem(PROG_KEY, JSON.stringify(p)); } catch {} };

  const DATA = window.X4M_LAB_DATA || { history: [], politics: [], geography: [], biology: [], audio: [] };
  const SHOWS = window.X4M_SHOWS || [];
  const prog = loadProg();
  const state = {
    tab: 'studio',
    idx: { history: 0, politics: 0, geography: 0, biology: 0 },
    hOrder: [],
    hChecked: false,
    hShuffled: [],
    pChoice: -1,
    gChoice: -1,
    bStep: 0,
    bChoice: -1,
    bCleared: false,
    showId: (SHOWS[0] && SHOWS[0].id) || 'show-01',
    showRate: 1,
    showLockedHit: false,
    audioId: (DATA.audio[0] && DATA.audio[0].id) || 'x4m-ep01',
    audioRate: 1,
    audioAutoNext: true,
    scriptMask: false,
  };
  function fmtSec(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  function markDone(id) {
    if (!prog[id]) {
      prog[id] = true;
      saveProg(prog);
      track('x4m_lab_clear');
      updateProgress();
    }
  }
  function totalLevels() {
    return (DATA.history?.length || 0) + (DATA.politics?.length || 0) + (DATA.geography?.length || 0) + (DATA.biology?.length || 0);
  }
  function updateProgress() {
    const total = totalLevels() || 57;
    const allIds = [...(DATA.history || []), ...(DATA.politics || []), ...(DATA.geography || []), ...(DATA.biology || [])].map(x => x.id);
    const done = allIds.filter(id => prog[id]).length;
    if (progSummary) progSummary.textContent = `已通关 ${done} / ${total} 关`;
    if (progFill) progFill.style.width = `${Math.round((done / total) * 100)}%`;
  }

  function shuffleDeterministically(arr, seedStr) {
    const out = arr.map((x, i) => ({ ...x, origIdx: i }));
    let h = 0;
    for (let i = 0; i < seedStr.length; i++) h = ((h << 5) - h + seedStr.charCodeAt(i)) | 0;
    for (let i = out.length - 1; i > 0; i--) {
      h = (h * 1664525 + 1013904223) | 0;
      const j = Math.abs(h) % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.every((x, i) => x.origIdx === i) && out.length > 1) [out[0], out[1]] = [out[1], out[0]];
    return out;
  }

  function resetLevelState(tab) {
    if (tab === 'history') {
      const lv = DATA.history[state.idx.history];
      state.hOrder = [];
      state.hChecked = false;
      state.hShuffled = lv ? shuffleDeterministically(lv.events, lv.id) : [];
    } else if (tab === 'politics') {
      state.pChoice = -1;
    } else if (tab === 'geography') {
      state.gChoice = -1;
    } else if (tab === 'biology') {
      state.bStep = 0;
      state.bChoice = -1;
      state.bCleared = false;
    }
  }

  function wrapBlank(txt) {
    return `<button type="button" class="lx-blank" data-lx-blank aria-pressed="false" aria-label="点击揭晓"><span class="mask-inner">${esc(txt)}</span></button>`;
  }
  function maskLine(raw) {
    const src = String(raw || '');
    const re = /(分封制|郡县制|推恩令|尊崇儒术|盐铁官营|南京条约|马关条约|辛丑条约|香港岛|台湾全岛|开设工厂|网络保护|司法保护|行政处罚|刑罚附加刑|基层群众性自治组织|地上河|温带海洋性气候|高谷低脊|房连静|室连动|左动右静|主动脉|肺动脉|肺静脉|肾小球滤过|肾小管重吸收|葡萄糖|唾液|小肠|凹透镜|三点水|田字旁|一般现在时|[\d一二三四五六七八九十百千]+[年元条个步度]|「[^」]{2,12}」|《[^》]{2,12}》)/g;
    let out = ''; let last = 0; let m; let hits = 0;
    while ((m = re.exec(src)) !== null) {
      hits++;
      out += esc(src.slice(last, m.index)) + wrapBlank(m[0]);
      last = m.index + m[0].length;
    }
    if (hits > 0) return out + esc(src.slice(last));
    const tail = src.match(/([^，。；：、！？]{4,12})([。；！？]*)$/);
    if (tail) {
      const idx = src.length - tail[0].length;
      return esc(src.slice(0, idx)) + wrapBlank(tail[1]) + esc(tail[2]);
    }
    return wrapBlank(src);
  }

  function levelStripHTML(tab, list) {
    const cur = state.idx[tab];
    return `<div class="lx-level-strip">${list.map((lv, i) => {
      const locked = !paidAccess && !lv.free;
      const done = !!prog[lv.id];
      const cls = ['lx-pill', i === cur ? 'is-cur' : '', done ? 'is-done' : '', locked ? 'is-lock' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${cls}" data-pick-lv="${i}">${done ? '✓ ' : (locked ? '🔒 ' : '')}第 ${i + 1} 关</button>`;
    }).join('')}</div>`;
  }

  function lockBoxHTML(subjectName, totalCnt) {
    return `<div class="lx-lock-box">
      <span class="lx-chip gold">前 3 关已免费体验</span>
      <h3>解锁全部 ${totalCnt} 关${esc(subjectName)}趣味记忆</h3>
      <p>开通爱丽克丝中考题库完整版（¥19.9 一次买断），立即解锁小四门全部 57 关反死记硬背闯关 ＋ 6 期专属女声故事磨耳朵 ＋ 253 条全科 A4 默写纸 ＋ 数理化 395 点与 59 大压轴模型，绝不二次收费。</p>
      <div class="lx-actions">
        <a class="lx-btn primary" href="./?from=lab-x4m-lock">去首页开通完整版 ¥19.9 →</a>
        <button type="button" class="lx-btn" data-pick-lv="0">先重温免费前 3 关</button>
      </div>
    </div>`;
  }

  function renderHistory() {
    const list = DATA.history || [];
    const cur = state.idx.history;
    const lv = list[cur];
    if (!lv) return '';
    if (!paidAccess && !lv.free) return levelStripHTML('history', list) + `<div class="lx-card">${lockBoxHTML('历史时间轴排雷', list.length)}</div>`;
    if (!state.hShuffled.length) resetLevelState('history');

    const pickedSet = new Set(state.hOrder);
    const allPlaced = state.hOrder.length === lv.events.length;
    const allRight = state.hChecked && state.hOrder.every((id, i) => lv.events[i].id === id);

    const slotsHtml = lv.events.map((correctEv, i) => {
      const pickedId = state.hOrder[i];
      const pickedEv = pickedId ? lv.events.find(e => e.id === pickedId) : null;
      let cls = 'lx-slot';
      if (pickedEv) cls += ' is-filled';
      if (state.hChecked && pickedEv) cls += pickedEv.id === correctEv.id ? ' is-ok' : ' is-bad';
      return `<div class="${cls}" data-remove-slot="${i}">
        <span class="lx-slot-num">${i + 1}</span>
        <span class="lx-slot-text">${pickedEv ? esc(pickedEv.label) : '点击下方事件按先后排入…'}</span>
        ${state.hChecked && pickedEv ? `<span class="lx-slot-year">${esc(pickedEv.year)}</span>` : ''}
      </div>`;
    }).join('');

    const poolHtml = state.hShuffled.map(ev => `
      <button type="button" class="lx-event-btn" data-add-ev="${esc(ev.id)}" ${pickedSet.has(ev.id) || state.hChecked ? 'disabled' : ''}>${esc(ev.label)}</button>
    `).join('');

    const fbHtml = state.hChecked ? `
      <div class="lx-feedback ${allRight ? 'is-ok' : 'is-bad'}">
        <b>${allRight ? '🎉 全对通关！时间因果链牢牢记住了' : '⚠️ 有事件顺序颠倒，对照下方正确时间轴看因果：'}</b>
        ${!allRight ? `<div>正确顺序：${lv.events.map(e => `<b>${esc(e.year)} ${esc(e.label)}</b>`).join(' → ')}</div>` : ''}
        <div><b>📜 因果故事串记：</b>${esc(lv.story)}</div>
        <div class="lx-mnemonic">💡 一句话口诀：${esc(lv.mnemonic)}</div>
      </div>` : '';

    return `${levelStripHTML('history', list)}
      <div class="lx-card">
        <div class="lx-card-head">
          <span class="lx-chip">📜 历史时间轴排雷 · 第 ${cur + 1}/${list.length} 关</span>
          <span class="lx-chip gold">${esc(lv.stage || '中考高频')}</span>
        </div>
        <h2>${esc(lv.title)}</h2>
        <p class="lx-sub">按发生先后顺序，依次点击下方历史事件排进时间轴（点已排槽位可撤回）：</p>
        <div class="lx-slots">${slotsHtml}</div>
        <div class="lx-pool">${poolHtml}</div>
        ${fbHtml}
        <div class="lx-actions">
          ${!state.hChecked ? `<button type="button" class="lx-btn primary" id="lxHCheck" ${allPlaced ? '' : 'disabled'}>核对时间顺序</button>` : ''}
          <button type="button" class="lx-btn" id="lxHReset">重新排一遍</button>
          ${cur + 1 < list.length ? `<button type="button" class="lx-btn ${state.hChecked ? 'primary' : ''}" id="lxNextLv">下一关 →</button>` : ''}
          <a class="lx-btn sm" href="${esc(lv.targetLink || './key-points.html?subject=lishi')}">看历史口诀默写纸 ›</a>
        </div>
      </div>`;
  }

  function renderPolitics() {
    const list = DATA.politics || [];
    const cur = state.idx.politics;
    const lv = list[cur];
    if (!lv) return '';
    if (!paidAccess && !lv.free) return levelStripHTML('politics', list) + `<div class="lx-card">${lockBoxHTML('道法生活小判官', list.length)}</div>`;
    const answered = state.pChoice >= 0;
    const ok = state.pChoice === lv.answerIdx;

    return `${levelStripHTML('politics', list)}
      <div class="lx-card">
        <div class="lx-card-head">
          <span class="lx-chip">⚖️ 30 秒生活小判官 · 第 ${cur + 1}/${list.length} 关</span>
          <span class="lx-chip gold">${esc(lv.stage || '中考高频')}</span>
        </div>
        <h2>${esc(lv.title)}</h2>
        <div class="lx-case-box"><b>案情现场：</b>${esc(lv.caseText)}</div>
        <p class="lx-sub"><b>请你断案：</b>${esc(lv.question)}</p>
        <div class="lx-opts">${lv.options.map((opt, i) => {
          let cls = 'lx-opt';
          if (answered) {
            if (i === lv.answerIdx) cls += ' is-right';
            else if (i === state.pChoice) cls += ' is-wrong';
          }
          return `<button type="button" class="${cls}" data-pick-p="${i}" ${answered ? 'disabled' : ''}>${String.fromCharCode(65 + i)}. ${esc(opt)}</button>`;
        }).join('')}</div>
        ${answered ? `<div class="lx-feedback ${ok ? 'is-ok' : 'is-bad'}">
          <b>${ok ? '⚖️ 判得准！一秒抓中道法题眼' : '⚠️ 判偏了，看判决书抓核心题眼：'}</b>
          <div>${esc(lv.verdict)}</div>
          <div class="lx-mnemonic">💡 抓题眼口诀：${esc(lv.mnemonic)}</div>
        </div>` : ''}
        <div class="lx-actions">
          ${answered ? `<button type="button" class="lx-btn" id="lxPRetry">再判一次</button>` : ''}
          ${cur + 1 < list.length ? `<button type="button" class="lx-btn ${answered ? 'primary' : ''}" id="lxNextLv">下一桩案子 →</button>` : ''}
          <a class="lx-btn sm" href="${esc(lv.targetLink || './key-points.html?subject=daode')}">看道法口诀默写纸 ›</a>
        </div>
      </div>`;
  }

  function renderGeography() {
    const list = DATA.geography || [];
    const cur = state.idx.geography;
    const lv = list[cur];
    if (!lv) return '';
    if (!paidAccess && !lv.free) return levelStripHTML('geography', list) + `<div class="lx-card">${lockBoxHTML('地理因果多米诺', list.length)}</div>`;
    const answered = state.gChoice >= 0;
    const ok = state.gChoice === lv.answerIdx;

    const dominoHtml = lv.chain.map((step, i) => {
      const isMiss = i === lv.missingIdx;
      const cls = isMiss ? (answered ? 'lx-dom-node is-lit' : 'lx-dom-node is-missing') : (answered && ok ? 'lx-dom-node is-lit' : 'lx-dom-node');
      const text = isMiss && !answered ? '【缺失骨牌：从下方选出最关键的因果推演】' : step;
      return `${i > 0 ? '<div class="lx-dom-arrow">↓</div>' : ''}<div class="${cls}"><b>第 ${i + 1} 环</b>${esc(text)}</div>`;
    }).join('');

    return `${levelStripHTML('geography', list)}
      <div class="lx-card">
        <div class="lx-card-head">
          <span class="lx-chip">🌍 地理因果多米诺 · 第 ${cur + 1}/${list.length} 关</span>
          <span class="lx-chip gold">${esc(lv.stage || '会考高频')}</span>
        </div>
        <h2>${esc(lv.title)}</h2>
        <p class="lx-sub">地理大题不用死背！补齐中间缺失的那块因果骨牌，整条逻辑链自动贯通：</p>
        <div class="lx-domino">${dominoHtml}</div>
        <div class="lx-opts">${lv.options.map((opt, i) => {
          let cls = 'lx-opt';
          if (answered) {
            if (i === lv.answerIdx) cls += ' is-right';
            else if (i === state.gChoice) cls += ' is-wrong';
          }
          return `<button type="button" class="${cls}" data-pick-g="${i}" ${answered ? 'disabled' : ''}>${String.fromCharCode(65 + i)}. ${esc(opt)}</button>`;
        }).join('')}</div>
        ${answered ? `<div class="lx-feedback ${ok ? 'is-ok' : 'is-bad'}">
          <b>${ok ? '🌍 多米诺全链点亮！这条地理逻辑拿稳了' : '⚠️ 因果链断了，看完整推导逻辑：'}</b>
          <div><b>📝 考场大题满分模板：</b>${esc(lv.template)}</div>
          <div class="lx-mnemonic">💡 地理速记口诀：${esc(lv.mnemonic)}</div>
        </div>` : ''}
        <div class="lx-actions">
          ${answered ? `<button type="button" class="lx-btn" id="lxGRetry">再推一次</button>` : ''}
          ${cur + 1 < list.length ? `<button type="button" class="lx-btn ${answered ? 'primary' : ''}" id="lxNextLv">下一条因果链 →</button>` : ''}
          <a class="lx-btn sm" href="${esc(lv.targetLink || './key-points.html?subject=dili')}">看地理口诀默写纸 ›</a>
        </div>
      </div>`;
  }

  function renderBiology() {
    const list = DATA.biology || [];
    const cur = state.idx.biology;
    const lv = list[cur];
    if (!lv) return '';
    if (!paidAccess && !lv.free) return levelStripHTML('biology', list) + `<div class="lx-card">${lockBoxHTML('生物生命流程大冒险', list.length)}</div>`;

    const step = lv.steps[state.bStep];
    const answered = state.bChoice >= 0;
    const ok = step && state.bChoice === step.answerIdx;

    return `${levelStripHTML('biology', list)}
      <div class="lx-card">
        <div class="lx-card-head">
          <span class="lx-chip">🧬 生物流程大冒险 · 第 ${cur + 1}/${list.length} 关</span>
          <span class="lx-chip gold">${esc(lv.stage || '会考高频')}</span>
        </div>
        <h2>${esc(lv.title)}</h2>
        <div class="lx-bio-hero">
          <span>${esc(lv.hero || '🧬')}</span>
          <div><b>角色任务：</b>${esc(lv.intro)}</div>
        </div>
        <div class="lx-bio-steps">${lv.steps.map((_, i) => `<i class="lx-bio-dot ${i < state.bStep || state.bCleared ? 'is-done' : (i === state.bStep ? 'is-cur' : '')}"></i>`).join('')}</div>
        ${state.bCleared ? `
          <div class="lx-feedback is-ok">
            <b>🎉 冒险通关！你亲手跑通了整条生物流程</b>
            <div class="lx-mnemonic">💡 防混总口诀：${esc(lv.mnemonic)}</div>
          </div>
        ` : `
          <p class="lx-sub"><b>第 ${state.bStep + 1} / ${lv.steps.length} 站：</b>${esc(step.prompt)}</p>
          <div class="lx-opts">${step.options.map((opt, i) => {
            let cls = 'lx-opt';
            if (answered) {
              if (i === step.answerIdx) cls += ' is-right';
              else if (i === state.bChoice) cls += ' is-wrong';
            }
            return `<button type="button" class="${cls}" data-pick-b="${i}" ${answered ? 'disabled' : ''}>${String.fromCharCode(65 + i)}. ${esc(opt)}</button>`;
          }).join('')}</div>
          ${answered ? `<div class="lx-feedback ${ok ? 'is-ok' : 'is-bad'}">
            <b>${ok ? '✅ 走对站点！' : '⚠️ 走偏啦，记住这站规则：'}</b>
            <div>${esc(step.note)}</div>
          </div>` : ''}
        `}
        <div class="lx-actions">
          ${!state.bCleared && answered ? `<button type="button" class="lx-btn primary" id="lxBNextStep">${state.bStep + 1 < lv.steps.length ? '进入下一站 →' : '完成本关大冒险 🎉'}</button>` : ''}
          ${state.bCleared ? `<button type="button" class="lx-btn" id="lxBReset">再跑一遍</button>` : ''}
          ${cur + 1 < list.length ? `<button type="button" class="lx-btn ${state.bCleared ? 'primary' : ''}" id="lxNextLv">下一关冒险 →</button>` : ''}
          <a class="lx-btn sm" href="${esc(lv.targetLink || './key-points.html?subject=shengwu')}">看生物口诀默写纸 ›</a>
        </div>
      </div>`;
  }

  function renderStudio() {
    const cur = SHOWS.find(s => s.id === state.showId) || SHOWS[0];
    if (!cur) return '<div class="lx-card"><p>演播室节目单加载中…</p></div>';
    const isReady = cur.status === 'ready' && !!cur.videoUrl;
    const previewMin = Math.round((cur.freePreviewSec || 600) / 60);
    const accessLabel = cur.free
      ? '本集免费全片看'
      : (paidAccess ? '完整版已解锁全片' : `免费试看前 ${previewMin} 分钟`);

    const stageMediaHtml = isReady
      ? `<div class="lx-video-wrap">
           <video id="lxStudioVideo" controls playsinline preload="none" ${cur.poster ? `poster="${esc(cur.poster)}"` : ''} src="${esc(cur.videoUrl)}"></video>
           ${state.showLockedHit && !paidAccess && !cur.free ? `
             <div class="lx-video-lock-overlay">
               <h3>已免费试看前 ${previewMin} 分钟</h3>
               <p>开通爱丽克丝中考题库完整版（¥19.9 一次买断），畅看《考点演播室》全季男女双主持视频＋57 关趣味闯关＋395 个数理化知识点与 59 大压轴模型。</p>
               <div class="lx-actions">
                 <a class="lx-btn gold" href="./?from=studio-preview">去首页解锁完整版 ¥19.9 →</a>
                 <button type="button" class="lx-btn" id="lxStudioRewind">重温前 ${previewMin} 分钟</button>
               </div>
             </div>` : ''}
         </div>
         <div class="lx-ap-controls">
           <button type="button" class="lx-ap-btn" id="lxVBack">↺ -15s</button>
           <button type="button" class="lx-ap-btn" id="lxVFwd">+15s ↻</button>
           ${[0.8, 1, 1.25, 1.5].map(r => `<button type="button" class="lx-ap-btn ${state.showRate === r ? 'is-on' : ''}" data-vrate="${r}">${r}×</button>`).join('')}
         </div>`
      : `<div class="lx-upcoming-stage">
           <div class="lx-hosts-row">🎙️ 男主持 × 女主持 · Remotion 动态演播室画面（每集 15–20 分钟 · ${esc(accessLabel)}）</div>
           <div class="lx-banner-demo"><em>考点横幅示例</em><span>${esc((cur.highlights && cur.highlights[0] && cur.highlights[0].text) || '讲到中考核心得分点时，画面自动弹出高亮横幅')}</span></div>
           <p class="lx-studio-desc">本集双人视频节目正在后期渲染上架中！现在可以先听同主题专属女声故事音频，或直接点下方考点书签与配套闯关抢先掌握得分点：</p>
           <div class="lx-actions">
             ${cur.fallbackAudioId ? `<button type="button" class="lx-btn gold" data-open-audio="${esc(cur.fallbackAudioId)}">🎧 先听本集主题女声故事 →</button>` : ''}
             <button type="button" class="lx-btn" data-jump-tab="${esc(cur.quizTab || 'history')}">${esc(cur.quizLabel || '去玩配套闯关 →')}</button>
           </div>
         </div>`;

    const hlHtml = (cur.highlights && cur.highlights.length) ? `
      <div class="lx-hl-box">
        <div class="lx-hl-head">
          <span>🔖 本集考点横幅书签（${isReady ? '点击 1 秒跳转重看' : '本集必考得分点抢先看'}）</span>
          <span>${cur.highlights.length} 个核心考点</span>
        </div>
        <div class="lx-hl-list">
          ${cur.highlights.map((h, i) => `
            <button type="button" class="lx-hl-item" data-hl-idx="${i}" data-hl-sec="${h.t}">
              <span class="lx-hl-time">${fmtSec(h.t)}</span>
              <span class="lx-hl-badge">${esc(h.badge || '考点')}</span>
              <span>${esc(h.text)}</span>
            </button>`).join('')}
        </div>
      </div>` : '';

    const listHtml = SHOWS.map(s => {
      const isCur = s.id === cur.id;
      const ready = s.status === 'ready' && !!s.videoUrl;
      const pMin = Math.round((s.freePreviewSec || 600) / 60);
      return `<article class="lx-show-card ${isCur ? 'is-cur' : ''}">
        <div class="lx-ep-head">
          <div>
            <span class="lx-chip">${esc(s.badge)}</span>
            <span class="lx-chip gold">${s.free ? '免费全片' : `前 ${pMin} 分钟免费试看`}</span>
            <span class="lx-chip">${ready ? '▶ 可观看' : '🎬 筹备上架中'}</span>
          </div>
          <button type="button" class="lx-btn ${isCur ? 'primary' : ''} sm" data-pick-show="${esc(s.id)}">${isCur ? '正在查看' : (ready ? '▶ 观看本集' : '查看考点预告')}</button>
        </div>
        <h3>${esc(s.title)}</h3>
        <p class="lx-sub">${esc(s.hosts)} · ${esc(s.durationText)}</p>
        <div class="lx-actions">
          <button type="button" class="lx-btn sm" data-jump-tab="${esc(s.quizTab || 'history')}">${esc(s.quizLabel || '配套闯关 →')}</button>
          <a class="lx-btn sm" href="${esc(s.kpLink || './key-points.html')}">印本集口诀默写纸 ›</a>
        </div>
      </article>`;
    }).join('');

    return `
      <div class="lx-studio-stage">
        <div class="lx-studio-meta">
          <span class="lx-studio-pill">${esc(cur.badge)}</span>
          <span class="lx-studio-pill">${esc(cur.durationText)}</span>
          <span class="lx-studio-pill">${esc(accessLabel)}</span>
        </div>
        <h2>${esc(cur.title)}</h2>
        <p class="lx-studio-desc">${esc(cur.summary)}</p>
        ${stageMediaHtml}
        ${hlHtml}
      </div>
      <div class="lx-show-grid">${listHtml}</div>`;
  }

  function renderAudio() {
    const eps = DATA.audio || [];
    const curEp = eps.find(e => e.id === state.audioId) || eps[0];
    const curAllowed = curEp && (paidAccess || curEp.free);

    const playerHtml = curEp ? `
      <div class="lx-audio-player">
        <div class="lx-ap-title">${esc(curEp.badge)} ${esc(curEp.title)}</div>
        <div class="lx-ap-sub">${esc(curEp.sub || '专属女声纯净讲述 · 上学路上 / 睡前 2 分钟听懂核心考点')}</div>
        ${curAllowed
          ? `<audio id="lxAudioEl" controls preload="metadata" src="${esc(curEp.src)}"></audio>
             <div class="lx-ap-controls">
               <button type="button" class="lx-ap-btn" id="lxSeekBack">↺ -15s</button>
               <button type="button" class="lx-ap-btn" id="lxSeekFwd">+15s ↻</button>
               ${[0.8, 1, 1.25, 1.5].map(r => `<button type="button" class="lx-ap-btn ${state.audioRate === r ? 'is-on' : ''}" data-rate="${r}">${r}×</button>`).join('')}
               <button type="button" class="lx-ap-btn ${state.audioAutoNext ? 'is-on' : ''}" id="lxAutoNext">${state.audioAutoNext ? '🔁 连播已开' : '🔁 连播已关'}</button>
               <button type="button" class="lx-ap-btn ${state.scriptMask ? 'is-on' : ''}" id="lxScriptMask">${state.scriptMask ? '👁️ 关闭文稿遮罩' : '🙈 遮罩边听边背'}</button>
             </div>`
          : `<div class="lx-lock-box" style="background:rgba(255,255,255,.1);border-color:rgba(255,229,170,.45);color:#fff">
               <p style="color:#e2f3ee">前 4 期（历史/道法/地理）完全免费试听，第 5–6 期随 ¥19.9 完整版解锁。</p>
               <a class="lx-btn gold" href="./?from=lab-x4m-audio">回首页解锁完整版 ¥19.9 →</a>
             </div>`}
      </div>` : '';

    const listHtml = eps.map((ep, i) => {
      const locked = !paidAccess && !ep.free;
      const isCur = curEp && ep.id === curEp.id;
      return `<article class="lx-ep-card ${isCur ? 'is-playing' : ''}">
        <div class="lx-ep-head">
          <div>
            <span class="lx-chip">${esc(ep.badge)} · 第 ${i + 1} 期</span>
            <span class="lx-chip ${ep.free ? 'gold' : ''}">${ep.free ? '免费试听' : (paidAccess ? '完整版已解锁' : '🔒 完整版')}</span>
          </div>
          <button type="button" class="lx-btn ${isCur ? 'primary' : ''} sm" data-play-ep="${esc(ep.id)}">${locked ? '🔒 解锁收听' : (isCur ? '▶ 正在选中' : '▶ 点击收听')}</button>
        </div>
        <h3>${esc(ep.title)}</h3>
        <p class="lx-sub">${esc(ep.sub || '')}</p>
        <div class="lx-actions">
          ${ep.targetLink && ep.targetLink.startsWith('#')
            ? `<button type="button" class="lx-btn sm" data-jump-tab="${esc(ep.targetLink.slice(1))}">${esc(ep.targetLabel || '去玩对应闯关 →')}</button>`
            : `<a class="lx-btn sm" href="${esc(ep.targetLink || './key-points.html')}">${esc(ep.targetLabel || '去印对应默写纸 →')}</a>`}
        </div>
        <details class="lx-script-box" ${isCur ? 'open' : ''}>
          <summary>📖 展开逐字故事与口诀文稿（支持遮罩边听边背）</summary>
          <ol class="lx-script-lines">${(ep.lines || []).map(l => `<li>${state.scriptMask ? maskLine(l) : esc(l)}</li>`).join('')}</ol>
        </details>
      </article>`;
    }).join('');

    return `${playerHtml}<div class="lx-ep-list">${listHtml}</div>`;
  }

  function wireStage() {
    stageEl.querySelectorAll('[data-pick-lv]').forEach(btn => btn.addEventListener('click', () => {
      state.idx[state.tab] = Number(btn.dataset.pickLv) || 0;
      resetLevelState(state.tab);
      render();
    }));
    stageEl.querySelector('#lxNextLv')?.addEventListener('click', () => {
      state.idx[state.tab] += 1;
      resetLevelState(state.tab);
      render();
    });

    if (state.tab === 'studio') {
      const cur = SHOWS.find(s => s.id === state.showId) || SHOWS[0];
      const videoEl = stageEl.querySelector('#lxStudioVideo');
      if (videoEl && cur) {
        videoEl.playbackRate = state.showRate;
        videoEl.addEventListener('play', () => track('x4m_studio_play'), { once: true });
        const limitSec = (!paidAccess && !cur.free) ? (cur.freePreviewSec || 600) : 0;
        const hlBtns = [...stageEl.querySelectorAll('[data-hl-sec]')];
        videoEl.addEventListener('timeupdate', () => {
          const t = videoEl.currentTime || 0;
          if (limitSec && t >= limitSec) {
            videoEl.pause();
            videoEl.currentTime = limitSec;
            if (!state.showLockedHit) { state.showLockedHit = true; render(); }
            return;
          }
          let activeIdx = -1;
          for (let i = 0; i < hlBtns.length; i++) {
            if (t >= Number(hlBtns[i].dataset.hlSec || 0)) activeIdx = i;
          }
          hlBtns.forEach((b, i) => b.classList.toggle('is-active', i === activeIdx));
        });
      }
      stageEl.querySelector('#lxStudioRewind')?.addEventListener('click', () => {
        state.showLockedHit = false;
        render();
        const v = stageEl.querySelector('#lxStudioVideo');
        if (v) { v.currentTime = 0; v.play().catch(() => {}); }
      });
      stageEl.querySelector('#lxVBack')?.addEventListener('click', () => { if (videoEl) videoEl.currentTime = Math.max(0, videoEl.currentTime - 15); });
      stageEl.querySelector('#lxVFwd')?.addEventListener('click', () => {
        if (!videoEl) return;
        const limit = (!paidAccess && cur && !cur.free) ? (cur.freePreviewSec || 600) : (videoEl.duration || 9999);
        videoEl.currentTime = Math.min(limit, videoEl.currentTime + 15);
      });
      stageEl.querySelectorAll('[data-vrate]').forEach(b => b.addEventListener('click', () => {
        state.showRate = Number(b.dataset.vrate) || 1;
        if (videoEl) videoEl.playbackRate = state.showRate;
        stageEl.querySelectorAll('[data-vrate]').forEach(x => x.classList.toggle('is-on', x === b));
      }));
      stageEl.querySelectorAll('[data-hl-sec]').forEach(b => b.addEventListener('click', () => {
        if (!videoEl) return;
        const sec = Number(b.dataset.hlSec || 0);
        const limit = (!paidAccess && cur && !cur.free) ? (cur.freePreviewSec || 600) : 999999;
        if (sec >= limit) {
          state.showLockedHit = true;
          render();
          return;
        }
        videoEl.currentTime = sec;
        videoEl.play().catch(() => {});
      }));
      stageEl.querySelectorAll('[data-pick-show]').forEach(b => b.addEventListener('click', () => {
        state.showId = b.dataset.pickShow;
        state.showLockedHit = false;
        render();
      }));
      stageEl.querySelectorAll('[data-open-audio]').forEach(b => b.addEventListener('click', () => {
        state.audioId = b.dataset.openAudio;
        switchTab('audio');
        setTimeout(() => stageEl.querySelector('#lxAudioEl')?.play?.().catch(() => {}), 80);
      }));
      stageEl.querySelectorAll('[data-jump-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.jumpTab)));
    } else if (state.tab === 'history') {
      stageEl.querySelectorAll('[data-add-ev]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.dataset.addEv;
        if (!state.hOrder.includes(id)) { state.hOrder.push(id); render(); }
      }));
      stageEl.querySelectorAll('[data-remove-slot]').forEach(slot => slot.addEventListener('click', () => {
        if (state.hChecked) return;
        const i = Number(slot.dataset.removeSlot);
        if (i < state.hOrder.length) { state.hOrder.splice(i, 1); render(); }
      }));
      stageEl.querySelector('#lxHCheck')?.addEventListener('click', () => {
        const lv = DATA.history[state.idx.history];
        state.hChecked = true;
        if (lv && state.hOrder.every((id, i) => lv.events[i].id === id)) markDone(lv.id);
        render();
      });
      stageEl.querySelector('#lxHReset')?.addEventListener('click', () => { resetLevelState('history'); render(); });
    } else if (state.tab === 'politics') {
      stageEl.querySelectorAll('[data-pick-p]').forEach(btn => btn.addEventListener('click', () => {
        const lv = DATA.politics[state.idx.politics];
        state.pChoice = Number(btn.dataset.pickP);
        if (lv && state.pChoice === lv.answerIdx) markDone(lv.id);
        render();
      }));
      stageEl.querySelector('#lxPRetry')?.addEventListener('click', () => { state.pChoice = -1; render(); });
    } else if (state.tab === 'geography') {
      stageEl.querySelectorAll('[data-pick-g]').forEach(btn => btn.addEventListener('click', () => {
        const lv = DATA.geography[state.idx.geography];
        state.gChoice = Number(btn.dataset.pickG);
        if (lv && state.gChoice === lv.answerIdx) markDone(lv.id);
        render();
      }));
      stageEl.querySelector('#lxGRetry')?.addEventListener('click', () => { state.gChoice = -1; render(); });
    } else if (state.tab === 'biology') {
      stageEl.querySelectorAll('[data-pick-b]').forEach(btn => btn.addEventListener('click', () => {
        state.bChoice = Number(btn.dataset.pickB);
        render();
      }));
      stageEl.querySelector('#lxBNextStep')?.addEventListener('click', () => {
        const lv = DATA.biology[state.idx.biology];
        if (!lv) return;
        if (state.bStep + 1 < lv.steps.length) {
          state.bStep += 1;
          state.bChoice = -1;
        } else {
          state.bCleared = true;
          markDone(lv.id);
        }
        render();
      });
      stageEl.querySelector('#lxBReset')?.addEventListener('click', () => { resetLevelState('biology'); render(); });
    } else if (state.tab === 'audio') {
      const audioEl = stageEl.querySelector('#lxAudioEl');
      if (audioEl) {
        audioEl.playbackRate = state.audioRate;
        audioEl.addEventListener('play', () => track('x4m_audio_play'), { once: true });
        audioEl.addEventListener('ended', () => {
          if (!state.audioAutoNext) return;
          const eps = DATA.audio || [];
          const idx = eps.findIndex(e => e.id === state.audioId);
          const next = eps[idx + 1];
          if (next && (paidAccess || next.free)) {
            state.audioId = next.id;
            render();
            stageEl.querySelector('#lxAudioEl')?.play?.().catch(() => {});
          }
        });
      }
      stageEl.querySelector('#lxSeekBack')?.addEventListener('click', () => { if (audioEl) audioEl.currentTime = Math.max(0, audioEl.currentTime - 15); });
      stageEl.querySelector('#lxSeekFwd')?.addEventListener('click', () => { if (audioEl) audioEl.currentTime = Math.min(audioEl.duration || 999, audioEl.currentTime + 15); });
      stageEl.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => {
        state.audioRate = Number(b.dataset.rate) || 1;
        if (audioEl) audioEl.playbackRate = state.audioRate;
        stageEl.querySelectorAll('[data-rate]').forEach(x => x.classList.toggle('is-on', x === b));
      }));
      stageEl.querySelector('#lxAutoNext')?.addEventListener('click', () => { state.audioAutoNext = !state.audioAutoNext; render(); });
      stageEl.querySelector('#lxScriptMask')?.addEventListener('click', () => { state.scriptMask = !state.scriptMask; render(); });
      stageEl.querySelectorAll('[data-play-ep]').forEach(b => b.addEventListener('click', () => {
        state.audioId = b.dataset.playEp;
        render();
        const a = stageEl.querySelector('#lxAudioEl');
        if (a) a.play().catch(() => {});
      }));
      stageEl.querySelectorAll('[data-jump-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.jumpTab)));
    }
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lx-blank]');
    if (!b) return;
    const open = b.classList.toggle('is-open');
    b.setAttribute('aria-pressed', open ? 'true' : 'false');
  });

  function switchTab(tab) {
    if (!['studio', 'history', 'politics', 'geography', 'biology', 'audio'].includes(tab)) return;
    state.tab = tab;
    if (tab === 'studio') track('x4m_studio_open');
    tabBtns.forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (tab !== 'audio' && tab !== 'studio') resetLevelState(tab);
    render();
  }

  function render() {
    updateProgress();
    if (state.tab === 'studio') stageEl.innerHTML = renderStudio();
    else if (state.tab === 'history') stageEl.innerHTML = renderHistory();
    else if (state.tab === 'politics') stageEl.innerHTML = renderPolitics();
    else if (state.tab === 'geography') stageEl.innerHTML = renderGeography();
    else if (state.tab === 'biology') stageEl.innerHTML = renderBiology();
    else stageEl.innerHTML = renderAudio();
    wireStage();
  }

  tabBtns.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  const initTab = new URLSearchParams(location.search).get('tab') || location.hash.replace(/^#/, '');
  if (['studio', 'history', 'politics', 'geography', 'biology', 'audio'].includes(initTab)) switchTab(initTab);
  else switchTab('studio');
})();
