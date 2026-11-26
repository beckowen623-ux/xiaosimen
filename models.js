'use strict';
(() => {
  const tabs = [...document.querySelectorAll('[data-m-subj]')];
  const cards = [...document.querySelectorAll('.m-card')];
  const searchInput = document.getElementById('mSearch');
  const statusEl = document.getElementById('mStatus');
  const maskToggle = document.getElementById('mMaskToggle');
  const revealAllBtn = document.getElementById('mRevealAll');
  const hideAllBtn = document.getElementById('mHideAll');
  const printBtn = document.getElementById('mPrintBtn');
  const printLockNote = document.getElementById('mPrintLockNote');
  const printMeta = document.getElementById('mPrintMeta');

  let activeSubj = 'all';
  let reciteMode = false;
  let paidAccess = false;

  try { paidAccess = localStorage.getItem('xiaosimen_paid') === '1'; } catch {}
  void fetch('/api/access/status', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(d => { if (d && typeof d.authenticated === 'boolean') paidAccess = d.authenticated; })
    .catch(() => {});

  const isOwner = () => {
    try {
      const q = new URLSearchParams(location.search).get('me');
      if (q === '1') { localStorage.setItem('xiaosimen_owner', '1'); return true; }
      return localStorage.getItem('xiaosimen_owner') === '1';
    } catch { return false; }
  };
  const track = (event) => {
    if (isOwner()) return;
    const from = new URLSearchParams(location.search).get('from') || 'models';
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, source: from }),
      keepalive: true,
    }).catch(() => {});
  };
  track('x4m_models_wall');

  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const wrapBlank = txt => `<button type="button" class="m-blank" data-m-blank aria-pressed="false" aria-label="点击揭晓"><span class="mask-inner">${esc(txt)}</span></button>`;
  function maskText(raw) {
    const src = String(raw || '');
    const re = /([「“][^」”]{2,18}[」”]|(?:[A-Za-z][A-Za-z0-9²³⁴⁺⁻₀₁₂₃₄₅₆₇₈₉]*\s*[＝=＜＞<>≤≥≈∝]\s*[^，。；、！？（()）]{1,18})|(?:\d+(?:\.\d+)?(?:\s*[°%℃ΩVAJWs]|\/[a-zA-Z0-9]+)?)|(?:口诀[：:]|结论[：:]|通法[：:]|条件[：:]|核心[：:]|规律[：:])([^，。；、！？（）()\n]{2,14}))/g;
    let out = ''; let last = 0; let m; let hits = 0;
    while ((m = re.exec(src)) !== null) {
      hits++;
      if (m[2]) {
        const pre = m[0].length - m[2].length;
        out += esc(src.slice(last, m.index + pre)) + wrapBlank(m[2]);
      } else {
        out += esc(src.slice(last, m.index)) + wrapBlank(m[0]);
      }
      last = m.index + m[0].length;
    }
    if (hits > 0) return out + esc(src.slice(last));
    const tail = src.match(/([^，。；：、！？\n]{4,14})([。；！？]*)$/);
    if (tail) {
      const idx = src.length - tail[0].length;
      return esc(src.slice(0, idx)) + wrapBlank(tail[1]) + esc(tail[2]);
    }
    return wrapBlank(src);
  }

  // Save original formula text for clean mask toggling
  const formulaEls = [...document.querySelectorAll('.m-formula-text')];
  formulaEls.forEach(el => { el.dataset.raw = el.textContent || ''; });

  function applyMask() {
    formulaEls.forEach(el => {
      const raw = el.dataset.raw || '';
      el.innerHTML = reciteMode ? maskText(raw) : esc(raw);
    });
    if (maskToggle) maskToggle.textContent = reciteMode ? '👁️ 关闭背诵遮罩' : '🙈 开启背诵遮罩';
    if (revealAllBtn) revealAllBtn.hidden = !reciteMode;
    if (hideAllBtn) hideAllBtn.hidden = !reciteMode;
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m-blank]');
    if (!b) return;
    const open = b.classList.toggle('is-open');
    b.setAttribute('aria-pressed', open ? 'true' : 'false');
  });

  maskToggle?.addEventListener('click', () => { reciteMode = !reciteMode; applyMask(); });
  revealAllBtn?.addEventListener('click', () => {
    document.querySelectorAll('[data-m-blank]').forEach(b => { b.classList.add('is-open'); b.setAttribute('aria-pressed', 'true'); });
  });
  hideAllBtn?.addEventListener('click', () => {
    document.querySelectorAll('[data-m-blank]').forEach(b => { b.classList.remove('is-open'); b.setAttribute('aria-pressed', 'false'); });
  });

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFKC').replace(/档/g, '挡').replace(/融化/g, '熔化').replace(/锤/g, '垂').replace(/\s+/g, '');
  }

  function applyFilter() {
    const q = norm(searchInput?.value || '');
    let shown = 0;
    for (const card of cards) {
      const okSubj = activeSubj === 'all' || card.dataset.subj === activeSubj;
      const okQ = !q || norm(card.dataset.hay || '').includes(q);
      const vis = okSubj && okQ;
      card.hidden = !vis;
      if (vis) shown++;
    }
    if (statusEl) {
      statusEl.textContent = q
        ? `筛选结果：共 ${shown} 个压轴模型（点击任意卡片可 1 秒直达 4 步通关微课）`
        : `当前展示 ${shown} / ${cards.length} 个初中数理化名师压轴模型 · 全量免费在线速查`;
    }
  }

  tabs.forEach(btn => btn.addEventListener('click', () => {
    activeSubj = btn.dataset.mSubj || 'all';
    tabs.forEach(t => {
      const on = t === btn;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    applyFilter();
  }));

  searchInput?.addEventListener('input', applyFilter);

  printBtn?.addEventListener('click', () => {
    track('x4m_models_print');
    let printed = 0;
    for (const card of cards) {
      const freeOk = card.dataset.freePrint === '1';
      const allow = !card.hidden && (paidAccess || freeOk);
      card.classList.toggle('print-hidden', !allow);
      if (allow) printed++;
    }
    if (printMeta) {
      printMeta.textContent = paidAccess
        ? `爱丽克丝中考题库（x4m.cc.cd）· 完整版 A4 压轴模型口诀速查手册 · 共 ${printed} 个模型`
        : `爱丽克丝中考题库（x4m.cc.cd）· 免费预览版（精选前 ${printed} 大镇站模型，完整版 ¥19.9 解锁全套 ${cards.length} 个模型无限打印）`;
    }
    if (printLockNote) printLockNote.classList.toggle('is-shown', !paidAccess);
    window.print();
  });

  window.addEventListener('afterprint', () => {
    cards.forEach(c => c.classList.remove('print-hidden'));
    if (printLockNote) printLockNote.classList.remove('is-shown');
  });

  // Optional initial subject filter via ?subject=math|physics|chemistry
  const initSubj = new URLSearchParams(location.search).get('subject');
  if (initSubj && ['math', 'physics', 'chemistry'].includes(initSubj)) {
    const btn = tabs.find(t => t.dataset.mSubj === initSubj);
    if (btn) btn.click();
  } else {
    applyFilter();
  }
})();
