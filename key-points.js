'use strict';

const subjectInfo = {
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
let subject = Object.hasOwn(subjectInfo, params.get('subject')) ? params.get('subject') : 'daode';
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
function pointHTML(item, sources) {
  return `<article class="card point-card" aria-labelledby="${escapeHTML(item.id)}">
    <div class="point-meta">
      <span class="chip ${item.type === 'trap' ? 'tone-daode' : ''}">${types[item.type]}</span>
      <span class="muted">${escapeHTML(item.topic)}</span>
    </div>
    <h3 id="${escapeHTML(item.id)}">${escapeHTML(item.title)}</h3>
    <div class="point-detail"><h4>要点</h4><p>${escapeHTML(item.rule)}</p></div>
    <div class="point-detail point-pitfall"><h4>易混点</h4><p>${escapeHTML(item.pitfall)}</p></div>
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

function updateURL() {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  const query = new URLSearchParams();
  if (subject !== 'daode') query.set('subject', subject);
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

updateStages(params.get('book'));
typeFilter.value = Object.hasOwn(types, params.get('type')) ? params.get('type') : '';
updateSubjectButtons();
filters.hidden = false;
render();
