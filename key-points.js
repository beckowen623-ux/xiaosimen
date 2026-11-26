'use strict';

const subjectInfo = {
  yuwen: { name: '语文', icon: 'book-open' },
  yingyu: { name: '英语', icon: 'notebook-pen' },
  daode: { name: '道法', icon: 'scale' },
  lishi: { name: '历史', icon: 'landmark' },
  dili: { name: '地理', icon: 'compass' },
  shengwu: { name: '生物', icon: 'leaf' },
};
const stages = {
  '7-up': '七年级上册',
  '7-down': '七年级下册',
  '8-up': '八年级上册',
  '8-down': '八年级下册',
  '9-up': '九年级上册',
  '9-down': '九年级下册',
};
const types = { core: '应知应会', trap: '易错辨析' };
const data = window.XIAOSIMEN_KEY_POINTS || {};
const params = new URLSearchParams(location.search);
let subject = Object.hasOwn(subjectInfo, params.get('subject')) ? params.get('subject') : 'yuwen';
const tabList = document.getElementById('pointSubjects');
const filters = document.getElementById('pointFilters');
const keyword = document.getElementById('pointSearch');
const stageFilter = document.getElementById('pointStage');
const typeFilter = document.getElementById('pointType');
const status = document.getElementById('pointStatus');
const results = document.getElementById('pointResults');

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  })[character]);
}
function normalize(value) {
  return value.trim().normalize('NFKC').toLowerCase();
}
let reciteMode = false;
let paidAccess = false;
try { paidAccess = localStorage.getItem('xiaosimen_paid') === '1'; } catch {}
void fetch('/api/access/status', { cache: 'no-store' })
  .then(r => (r.ok ? r.json() : null))
  .then(d => { if (d && typeof d.authenticated === 'boolean') paidAccess = d.authenticated; })
  .catch(() => {});

function wrapPtBlank(txt, forPrintBlank) {
  if (forPrintBlank) return ' ____________ ';
  return `<span class="pt-blank" role="button" tabindex="0" aria-label="点击揭晓答案"><span class="mask-inner">${escapeHTML(txt)}</span></span>`;
}

function maskKeywords(text, forPrintBlank = false) {
  const src = String(text ?? '');
  const re = /([“「][^”」]{2,16}[”」]|《[^》]{2,14}》|\d{2,4}年|\d+(?:\.\d+)?(?:%|℃|毫米|米|条|项|大)|(?:根本|核心|前提|基础|关键|标志|实质|原则|制度|特征|意义|作用|影响|地位|目标是|本质是|主要是|包括|决定|要求|坚持|体现为|表现为|是)([^，。；、！？（）()\n]{2,14}))/g;
  let out = '';
  let last = 0;
  let m;
  let hits = 0;
  while ((m = re.exec(src)) !== null) {
    hits++;
    if (m[1]) {
      const prefixLen = m[0].length - m[1].length;
      out += escapeHTML(src.slice(last, m.index + prefixLen));
      out += wrapPtBlank(m[1], forPrintBlank);
    } else {
      out += escapeHTML(src.slice(last, m.index));
      out += wrapPtBlank(m[0], forPrintBlank);
    }
    last = m.index + m[0].length;
  }
  if (hits > 0) return out + escapeHTML(src.slice(last));
  const trimmed = src.trim();
  if (trimmed.length < 5) return wrapPtBlank(src, forPrintBlank);
  const tail = src.match(/([^，。；：、！？\n]{4,14})([。；！？]*)$/);
  if (tail) {
    const start = src.length - tail[0].length;
    const keepLen = tail[1].length > 8 ? Math.floor(tail[1].length * 0.35) : 0;
    const maskStart = start + keepLen;
    return escapeHTML(src.slice(0, maskStart)) + wrapPtBlank(tail[1].slice(keepLen), forPrintBlank) + escapeHTML(tail[2]);
  }
  return wrapPtBlank(src, forPrintBlank);
}

function pointHTML(item, sources) {
  const ruleHtml = reciteMode ? maskKeywords(item.rule) : escapeHTML(item.rule);
  const pitfallHtml = reciteMode ? maskKeywords(item.pitfall) : escapeHTML(item.pitfall);
  return `<article class="card point-card" aria-labelledby="${escapeHTML(item.id)}">
    <div class="point-meta">
      <span class="chip ${item.type === 'trap' ? 'tone-daode' : ''}">${types[item.type]}</span>
      <span class="muted">${escapeHTML(item.topic)}</span>
    </div>
    <h3 id="${escapeHTML(item.id)}">${escapeHTML(item.title)}</h3>
    <div class="point-detail"><h4>要点</h4><p>${ruleHtml}</p></div>
    <div class="point-detail point-pitfall"><h4>易混点</h4><p>${pitfallHtml}</p></div>
    <details class="point-answer">
      <summary>自测 · ${escapeHTML(item.question)}</summary>
      <p>${escapeHTML(item.answer)}</p>
    </details>
    <details class="point-sources">
      <summary>参考来源</summary>
      ${item.evidence ? `<p>真题索引 · ${escapeHTML(item.evidence)}</p>` : ''}
      <ul>${item.refs.map(ref => {
        const source = sources[ref];
        return `<li><a href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(source.label)}</a></li>`;
      }).join('')}</ul>
    </details>
  </article>`;
}

function openPointsPrint(matches, blankMode) {
  if (!matches.length) return;
  void fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'recite_print', source: 'key-points' }),
    keepalive: true,
  }).catch(() => {});
  const picked = paidAccess ? matches : matches.slice(0, 5);
  const omitted = matches.length - picked.length;
  const old = document.getElementById('ptPrintOverlay');
  if (old) old.remove();
  const modeLabel = blankMode ? 'A4 挖空默写纸' : 'A4 考前速记单';
  const rowsHtml = picked.map((item, idx) => `
    <div class="pt-pr-item">
      <p class="pt-pr-title"><b>${idx + 1}. ${escapeHTML(item.title)}</b> <small>（${escapeHTML(stages[item.stage] || '')} · ${escapeHTML(item.topic)}）</small></p>
      <p><b>要点：</b>${blankMode ? maskKeywords(item.rule, true) : escapeHTML(item.rule)}</p>
      <p><b>易混：</b>${blankMode ? maskKeywords(item.pitfall, true) : escapeHTML(item.pitfall)}</p>
      <p><b>自测：</b>${escapeHTML(item.question)} ${blankMode ? '______________________' : `（答：${escapeHTML(item.answer)}）`}</p>
    </div>`).join('');
  const ansHtml = blankMode ? `<div class="pt-pr-ans"><h2>家长核对参考答案</h2>${picked.map((item, idx) => `<p><b>${idx + 1}. ${escapeHTML(item.title)}：</b>${escapeHTML(item.rule)} ｜ 自测答：<b>${escapeHTML(item.answer)}</b></p>`).join('')}</div>` : '';
  const overlay = document.createElement('div');
  overlay.id = 'ptPrintOverlay';
  overlay.className = 'pt-print-overlay';
  overlay.innerHTML = `
    <div class="pt-pr-bar no-print">
      <div><b>${escapeHTML(subjectInfo[subject].name)} · ${modeLabel}（共 ${picked.length} 条）</b></div>
      <div class="pt-pr-btns">
        ${!paidAccess && omitted > 0 ? `<a class="btn" href="./">回首页开通完整版 ¥19.9（印全部 ${matches.length} 条）</a>` : ''}
        <button type="button" class="btn primary" id="ptPrGo">立即打印 / 存 PDF</button>
        <button type="button" class="btn" id="ptPrClose">关闭</button>
      </div>
    </div>
    <div class="pt-pr-page">
      ${!paidAccess && omitted > 0 ? `<div class="pt-pr-note">免费体验可打印每科前 5 条，完整版 ¥19.9 一次买断可无水印打印全部 213 条全科（语英＋小四门）考点速记与默写纸。</div>` : ''}
      <header class="pt-pr-head">
        <h1>爱丽克丝中考题库 · ${escapeHTML(subjectInfo[subject].name)}${modeLabel}</h1>
        <p>人教版 · 姓名：__________　日期：__________　核对得分：______</p>
      </header>
      ${rowsHtml}
      ${ansHtml}
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('pt-printing');
  overlay.querySelector('#ptPrClose').addEventListener('click', () => { overlay.remove(); document.body.classList.remove('pt-printing'); });
  overlay.querySelector('#ptPrGo').addEventListener('click', () => window.print());
}

function updateURL() {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  const query = new URLSearchParams();
  if (subject !== 'yuwen') query.set('subject', subject);
  if (stageFilter.value) query.set('book', stageFilter.value);
  if (typeFilter.value) query.set('type', typeFilter.value);
  const suffix = query.size ? `?${query}` : '';
  const url = `${location.pathname}${suffix}${location.hash}`;
  if (location.search !== suffix) history.replaceState(null, '', url);
}
function updateStages(preferred) {
  const available = new Set((data[subject]?.items || []).map(item => item.stage));
  stageFilter.innerHTML = '<option value="">全部册次</option>' + Object.keys(stages)
    .filter(key => available.has(key)).map(key => `<option value="${key}">${stages[key]}</option>`).join('');
  stageFilter.value = available.has(preferred) ? preferred : '';
}
function render() {
  const bank = data[subject];
  if (!bank?.items?.length) {
    status.textContent = `${subjectInfo[subject].name}考点暂未加载。`;
    results.innerHTML = '<div class="card points-empty"><p>刷新页面后再试一次。</p></div>';
    return;
  }
  const words = normalize(keyword.value).split(/\s+/).filter(Boolean);
  const currentStage = stageFilter.value;
  const currentType = typeFilter.value;
  const matches = bank.items.filter(item => {
    if ((currentStage && item.stage !== currentStage) || (currentType && item.type !== currentType)) return false;
    if (!words.length) return true;
    const text = normalize([item.title, item.topic, item.rule, item.pitfall, item.question, item.answer].join(' '));
    return words.every(word => text.includes(word));
  });
  status.textContent = `${subjectInfo[subject].name} · ${matches.length} 条考点`;
  currentMatches = matches;
  if (!matches.length) {
    results.innerHTML = '<div class="card points-empty"><p>没找到符合筛选条件的考点。</p><button class="btn" id="resetPoints" type="button">重置筛选</button></div>';
    document.getElementById('resetPoints').addEventListener('click', () => {
      keyword.value = '';
      stageFilter.value = '';
      typeFilter.value = '';
      updateURL();
      render();
      keyword.focus();
    });
    return;
  }
  results.innerHTML = Object.entries(stages).map(([stage, label]) => {
    const group = matches.filter(item => item.stage === stage);
    if (!group.length) return '';
    return `<section class="point-group" aria-labelledby="points-${stage}">
      <h2 id="points-${stage}">${label}</h2>
      <div class="point-grid">${group.map(item => pointHTML(item, bank.sources)).join('')}</div>
    </section>`;
  }).join('');
}
function updateSubjectButtons() {
  tabList.querySelectorAll('button').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.subject === subject));
  });
}

tabList.innerHTML = Object.entries(subjectInfo).map(([key, info]) => `
  <button class="point-subject tone-${key}" type="button" data-subject="${key}" aria-pressed="false">
    <svg class="icon" aria-hidden="true"><use href="./assets/icons/ui.svg#${info.icon}"></use></svg>${info.name}
  </button>`).join('');
tabList.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || subject === button.dataset.subject) return;
  subject = button.dataset.subject;
  updateStages(stageFilter.value);
  updateSubjectButtons();
  updateURL();
  render();
});
for (const filter of [stageFilter, typeFilter]) {
  filter.addEventListener('change', () => { updateURL(); render(); });
}
keyword.addEventListener('input', event => { if (!event.isComposing) render(); });
keyword.addEventListener('compositionend', render);

let currentMatches = [];
function currentFilteredMatches() { return currentMatches; }

updateStages(params.get('book'));
typeFilter.value = Object.hasOwn(types, params.get('type')) ? params.get('type') : '';
updateSubjectButtons();
filters.hidden = false;

const reciteBtn = document.getElementById('pointReciteBtn');
const revealAllBtn = document.getElementById('pointRevealAllBtn');
const hideAllBtn = document.getElementById('pointHideAllBtn');
reciteBtn?.addEventListener('click', () => {
  reciteMode = !reciteMode;
  reciteBtn.setAttribute('aria-pressed', String(reciteMode));
  reciteBtn.classList.toggle('primary', reciteMode);
  reciteBtn.textContent = reciteMode ? '👁️ 已开背诵遮罩（点绿块显答案）' : '👁️ 开启背诵遮罩';
  if (revealAllBtn) revealAllBtn.hidden = !reciteMode;
  if (hideAllBtn) hideAllBtn.hidden = !reciteMode;
  render();
});
revealAllBtn?.addEventListener('click', () => {
  results.querySelectorAll('.pt-blank').forEach(el => el.classList.add('revealed'));
});
hideAllBtn?.addEventListener('click', () => {
  results.querySelectorAll('.pt-blank').forEach(el => el.classList.remove('revealed'));
});
results.addEventListener('click', event => {
  const blank = event.target.closest('.pt-blank');
  if (blank) blank.classList.toggle('revealed');
});
document.getElementById('pointPrintNoteBtn')?.addEventListener('click', () => openPointsPrint(currentFilteredMatches(), false));
document.getElementById('pointPrintBlankBtn')?.addEventListener('click', () => openPointsPrint(currentFilteredMatches(), true));
render();
