/* 知识点补缺：按学期 → 章 → 知识点浏览，3 分钟快测出《孩子学情体检单》，看卡片、练分层题与压轴大题、一键印名校教研风 A4 补缺卷。 */
(() => {
  'use strict';
  const version = '__KNOWLEDGE_VERSION__';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const SELECT_KEY = 'xiaosimen-kp-marked-v1'; // 家长手动勾选的薄弱知识点
  const STATUS = {
    none: { label: '未练', cls: 'kp-none' },
    weak: { label: '薄弱', cls: 'kp-weak' },
    shaky: { label: '待巩固', cls: 'kp-shaky' },
    ok: { label: '基本掌握', cls: 'kp-ok' },
    good: { label: '已掌握', cls: 'kp-good' },
  };
  const state = { subject: 'math', semester: '', view: 'list', point: '', selecting: false, open: new Set() };
  let app;
  const pending = new Map();

  function load(url) {
    if (pending.has(url)) return pending.get(url);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url; s.onload = resolve;
      s.onerror = () => { s.remove(); pending.delete(url); reject(new Error('知识点资料加载失败，请检查网络后重试。')); };
      document.head.appendChild(s);
    });
    pending.set(url, p);
    return p;
  }
  const loadIndex = () => window.KNOWLEDGE_INDEX ? Promise.resolve(window.KNOWLEDGE_INDEX) : load(`./data/knowledge-index.js?v=${version}`).then(() => window.KNOWLEDGE_INDEX);
  async function loadSemester(subject, key) {
    const id = `${subject}-${key}`;
    if (!window.KNOWLEDGE_DATA?.[id]) await load(`./data/knowledge-${id}.js?v=${version}`);
    return window.KNOWLEDGE_DATA[id];
  }

  function readMarked() { try { const v = JSON.parse(localStorage.getItem(SELECT_KEY) || '[]'); return new Set(Array.isArray(v) ? v : []); } catch { return new Set(); } }
  function saveMarked(set) { try { localStorage.setItem(SELECT_KEY, JSON.stringify([...set])); } catch { /* 隐私模式 */ } }

  // 一个知识点的掌握情况 + 3 星闯关进度（基础稳拿 / 提分变式 / 拓展压轴）
  function pointStatus(ids, progress, marked, pointId) {
    let done = 0; let right = 0;
    for (const id of ids) {
      const r = progress.banks?.[id];
      if (!r?.done || (r.revealed && !(r.attempts > 0))) continue;
      done++; if (r.correct) right++;
    }
    const rate = done ? right / done : 0;
    let key = 'none';
    if (done) key = rate < 0.6 ? 'weak' : (rate < 0.85 ? 'shaky' : (done >= 5 ? 'good' : 'ok'));
    if (marked.has(pointId) && (key === 'none' || key === 'ok')) key = 'weak';
    return { key, done, right, total: ids.length, marked: marked.has(pointId) };
  }
  function isCorrectRec(progress, id) {
    const r = progress.banks?.[id];
    return Boolean(r?.done && r.correct && !(r.revealed && !(r.attempts > 0)));
  }
  function pointMastery(data, point, progress) {
    const byId = new Map(data.questions.map(q => [q.id, q]));
    const all = [...point.qids, ...point.refs].map(id => byId.get(id)).filter(Boolean);
    const l1 = all.filter(q => q.knowledge && q.type !== 'essay' && (q.level || 1) === 1);
    const l2 = all.filter(q => q.knowledge && q.type !== 'essay' && q.level === 2);
    const l3e = all.filter(q => q.type === 'essay' || (q.knowledge && q.level >= 3));
    const countRight = arr => arr.filter(q => isCorrectRec(progress, q.id)).length;
    const s1 = { list: l1, right: countRight(l1), total: l1.length, cleared: l1.length > 0 && countRight(l1) >= l1.length };
    const s2 = { list: l2, right: countRight(l2), total: l2.length, cleared: l2.length > 0 && countRight(l2) >= l2.length };
    const s3 = { list: l3e, right: countRight(l3e), total: l3e.length, cleared: l3e.length > 0 && countRight(l3e) >= l3e.length };
    const stars = (s1.cleared ? 1 : 0) + (s2.cleared ? 1 : 0) + (s3.cleared ? 1 : 0);
    return { s1, s2, s3, stars, maxStars: 3 };
  }
  function starBadgeHTML(stars) {
    const filled = '★'.repeat(stars);
    const empty = '☆'.repeat(3 - stars);
    const cls = stars === 3 ? 'is-gold' : stars > 0 ? 'is-mid' : 'is-zero';
    return `<span class="kp-stars ${cls}" aria-label="已点亮 ${stars} 颗星（满分 3 星）">${filled}${empty}</span>`;
  }
  function wrapKpBlank(txt) {
    return `<button type="button" class="kp-blank" data-kp-blank aria-pressed="false" aria-label="点击揭晓答案"><span class="mask-inner">${esc(txt)}</span></button>`;
  }
  function maskKpText(raw) {
    const src = String(raw ?? '');
    const re = /([「“][^」”]{2,18}[」”]|(?:[A-Za-z][A-Za-z0-9²³⁴⁺⁻₀₁₂₃₄₅₆₇₈₉]*\s*[＝=＜＞<>≤≥≈∝]\s*[^，。；、！？（()）]{1,18})|(?:\d+(?:\.\d+)?(?:\s*[°%℃ΩVAJWs]|\/[a-zA-Z0-9]+)?)|(?:先[^，。；]{1,6}后[^，。；]{1,6}|偏大|偏小|变大|变小|增大|减小|不变)|(?:叫做|称为|统称为|表示|等于|成正比|成反比|定律[：:]|原理[：:]|条件[：:]|性质[：:]|判定[：:]|结论[：:]|现象[：:]|实质[：:]|口诀[：:]|规律[：:])([^，。；、！？（）()\n]{2,14}))/g;
    let out = ''; let last = 0; let m; let hits = 0;
    while ((m = re.exec(src)) !== null) {
      hits++;
      if (m[2]) {
        const prefixLen = m[0].length - m[2].length;
        out += esc(src.slice(last, m.index + prefixLen));
        out += wrapKpBlank(m[2]);
      } else {
        out += esc(src.slice(last, m.index));
        out += wrapKpBlank(m[0]);
      }
      last = m.index + m[0].length;
    }
    if (hits > 0) return out + esc(src.slice(last));
    // 100% 兜底：若该行未命中理科符号/词库，自动遮住冒号后或句末 4–14 字核心结论
    const trimmed = src.trim();
    if (trimmed.length < 5) return wrapKpBlank(src);
    const colonIdx = src.search(/[：:]/);
    if (colonIdx > 0 && colonIdx <= 20 && src.length - colonIdx - 1 >= 4) {
      const rest = src.slice(colonIdx + 1);
      const seg = rest.match(/^(\s*)([^，。；！？\n]{3,14})/);
      if (seg) {
        const s0 = colonIdx + 1 + seg[1].length;
        return esc(src.slice(0, s0)) + wrapKpBlank(seg[2]) + esc(src.slice(s0 + seg[2].length));
      }
    }
    const tail = src.match(/([^，。；：、！？\n]{4,14})([。；！？]*)$/);
    if (tail) {
      const start = src.length - tail[0].length;
      const keepLen = tail[1].length > 8 ? Math.floor(tail[1].length * 0.35) : 0;
      const maskStart = start + keepLen;
      const maskStr = tail[1].slice(keepLen);
      return esc(src.slice(0, maskStart)) + wrapKpBlank(maskStr) + esc(tail[2]);
    }
    return wrapKpBlank(src);
  }
  function splitExampleSteps(text) {
    const parts = String(text || '').split(/[；;。\n]/).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) return { hint: '先圈出题干中的已知量/图形特征，对应上方通法公式列出核心关系式。', full: String(text || '') };
    return { hint: parts[0] + '……', full: String(text || '') };
  }
  function semesterStats(sem, progress = app.progress()) {
    const marked = readMarked();
    const out = { none: 0, weak: 0, shaky: 0, ok: 0, good: 0, total: 0, essays: 0 };
    for (const c of sem.chapters || []) for (const p of c.points) {
      out[pointStatus(p.ids, progress, marked, p.id).key]++;
      out.total++;
      if (p.hasEssay) out.essays++;
    }
    return out;
  }
  function subjectSummaryCounts(subj) {
    let pts = 0; let qs = 0; let essays = 0;
    for (const sem of subj?.semesters || []) {
      if (!sem.ready) continue;
      pts += (sem.pointCount || 0);
      qs += (sem.questionCount || 0);
      for (const c of sem.chapters || []) for (const p of c.points || []) if (p.hasEssay) essays++;
    }
    return { pts, qs, essays };
  }
  function totalSummaryCounts() {
    const idx = window.KNOWLEDGE_INDEX;
    let pts = 0; let qs = 0; let essays = 0;
    for (const s of idx?.subjects || []) {
      const sub = subjectSummaryCounts(s);
      pts += sub.pts; qs += sub.qs; essays += sub.essays;
    }
    return { pts: pts || 395, qs: qs || 4800, essays: essays || 125, subjects: (idx?.subjects || []).map(s => s.label).join('、') || '数理化' };
  }

  function normSearchText(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFKC')
      .replace(/档/g, '挡')
      .replace(/融化/g, '熔化')
      .replace(/锤/g, '垂')
      .replace(/[·・•\-—_，。、！？：；（）()【】「」“”\s]/g, '');
  }

  const KP_ALIASES = [
    // 数学名师几何/函数压轴模型全覆盖（数组第 1 项为最精准主匹配，排序优先）
    [/婆罗摩|笈多|双等腰直角|中线与高互换/, ['婆罗摩笈多', '双等腰直角', '倍长中线', '手拉手']],
    [/阿氏圆|阿波罗|pa\+k|kpb/i, ['阿氏圆', '母子相似', '胡不归']],
    [/费马点|三线段最值|60度旋转|60°旋转/, ['费马点', '旋转60°', '最值']],
    [/十字架|赵爽|弦图|垂直线段/, ['十字架', '赵爽弦图', '勾股']],
    [/鸡爪|对角互补|共顶点三线段/, ['鸡爪', '对角互补', '旋转全等']],
    [/12345|45度角|45°角|半角正切/, ['12345', '45°', '半角']],
    [/逆等线|定角夹等长/, ['逆等线', '平移', '最值']],
    [/猪蹄|铅笔|锯齿|鹰嘴|拐点|平行线拐点/, ['平行线拐点', '猪蹄', '铅笔', '锯齿']],
    [/建系|坐标法|斜化直/, ['建系法', '斜化直', '铅垂高']],
    [/一线三垂直|k字|k型|一线三直角|三垂直|一线三等角/i, ['一线三等角', '一线三直角', '相似综合']],
    [/手拉手|共顶点旋转|旋转全等/, ['手拉手', '婆罗摩笈多', '鸡爪']],
    [/半角模型|半角|90夹45|120夹60/, ['半角模型', '截长补短']],
    [/子母相似|母子相似|母子型|射影定理|双垂|反a|反8|a字|8字/i, ['相似综合', '母子型', '射影', '三角形相似']],
    [/飞镖|角平分线模型|双内|双外|一内一外/, ['角平分线三大夹角', '飞镖', '角平分线']],
    [/将军饮马|胡不归|瓜豆|一箭穿心|点圆最值|垂线段最短/, ['将军饮马', '胡不归', '瓜豆', '一箭穿心', '阿氏圆', '费马点']],
    [/隐圆|四点共圆|定弦定角|定边定角|定点定长|米勒|托勒密|梅涅劳斯/, ['隐圆', '四点共圆', '定弦定角', '圆与切线']],
    [/铅垂法|铅垂高|水平宽|斜高|面积最值/, ['铅垂高', '面积最值']],
    [/辅助线|中点|倍长|截长补短|中位线|斜边中线/, ['倍长中线', '截长补短', '中位线', '中点四边形', '斜边中线']],
    [/动点|动角|折叠|存在性|等腰存在|直角存在|平行四边形存在/, ['动点', '动角', '折叠', '存在性', '等腰', '平行四边形']],
    [/黄金分割|位似/, ['黄金分割', '位似']],
    [/交点式|两根式|韦达|根与系数|对称性/, ['交点式', '韦达定理', '根与系数']],
    [/降幂|升幂|不含某项|与字母无关|含参/, ['降幂', '不含某项', '含参']],
    [/尺规|作图|画图/, ['尺规作图', '作图', '力臂', '平面镜', '实物图']],
    [/十字相乘|分解因式|因式分解|分组分解/, ['十字相乘', '因式分解', '分组分解']],
    [/统计|概率|树状图|方差|中位数|众数/, ['统计', '概率', '方差', '中位数']],
    // 物理名师模型与高频实验
    [/杠杆最小力|最小力|动态杠杆|力臂|穿绳|滑轮组/, ['杠杆最小力', '动态杠杆', '滑轮组', '机械效率', '杠杆']],
    [/安阻法|伏阻法|单表法|特殊法测电阻|缺电流表|缺电压表|等效替代/, ['单表法', '缺电压表', '缺电流表', '测电阻', '额定功率']],
    [/特殊法测密度|缺量筒|缺天平|缺砝码|漂浮法|溢水杯|等浮力|双提法/, ['缺砝码', '缺量筒', '特殊测密度', '溢水法', '等浮力']],
    [/多挡位|多档位|电热器|高中低挡|高中低档|多开关/, ['多挡位', '电热器', '多开关', '动态电路']],
    [/动态电路|变阻器|极值|范围最值|安全取值|敏感电阻/, ['滑动变阻器安全取值', '动态电路', '非线性灯泡']],
    [/故障|短路|断路|测电笔|试电笔|家庭电路/, ['电路故障', '家庭电路', '试电笔', '串并联电路设计']],
    [/电路设计|病房呼叫|声光控|实物图|电路图/, ['串并联电路设计', '实物图', '电路图']],
    [/浮力|阿基米德|漂浮|冰块|液面变化|液面升降|浸没|提拉|f-h/i, ['液面变化', '冰块熔化', '浸没提拉', '浮力', '漂浮']],
    [/切割|叠放|竖切|横切|柱体压强|液柱压强|连通器/, ['切割叠放', '固体切割', '液面变化', '压强', '连通器']],
    [/摩擦|受力|多物体|叠放受力|二力平衡/, ['摩擦力', '受力分析', '二力平衡', '多物体']],
    [/焦耳|u形管|电热|比热容|吸放热/, ['焦耳定律', '比热容', '热机', '内能']],
    [/平均速度|斜面小车|晶体熔化|海波|水沸腾/, ['平均速度', '晶体熔化', '水沸腾', '物态变化']],
    [/透镜|凸透镜|成像|平面镜|近视|远视/, ['凸透镜', '平面镜', '近视']],
    // 化学名师模型与高频实验
    [/万能瓶|多功能瓶|洗气瓶|排空气|排水集气|气体制取|气体净化|量气/, ['万能瓶', '多功能瓶', '气体制取', '气体净化', '氧气', '二氧化碳']],
    [/滤渣|滤液|滤液滤渣|四大图像|金属与盐|混合盐/, ['滤渣滤液', '混合盐', '金属与酸', '金属活动性']],
    [/工业流程|工艺流程|海水提镁|矿石|碳捕集|双碳/, ['粗盐除可溶性杂质', '海水提镁', '矿石综合利用', '碳捕集']],
    [/变质|氢氧化钠变质|生石灰变质|氧化钙变质|成分探究|溶质成分/, ['变质程度探究', '溶质成分', '氢氧化钠']],
    [/传感器|数字化|压强曲线|ph曲线|温度曲线|中和曲线|拐点图像/i, ['数字化传感', '拐点图像', '复分解', '中和反应', '溶解度曲线']],
    [/粗盐提纯|除杂|鉴别|玻璃棒|铵态氮肥|化肥/, ['粗盐', '多步除杂', '鉴别', '铵态氮肥', '可溶性杂质']],
    [/溶液配制|质量分数|偏大偏小|溶解度/, ['溶液配制', '溶质质量分数', '溶解度']],
    [/一氧化碳|co还原|炼铁|氧化铜|氧化铁|尾气/i, ['一氧化碳还原', '氧化铜', '氧化铁', '碳']],
    [/气密性|实验操作|仪器/, ['气密性', '实验基本操作']],
    [/俗名|烧碱|纯碱|小苏打|沉淀|推断|框图|离子共存|三角转化/, ['框图推断', '离子共存', '俗名沉淀', '特征沉淀', '常见的盐']],
    [/差量法|守恒法|元素守恒|质量守恒|极值法/, ['元素守恒法', '差量法', '质量守恒']],
  ];

  function searchPoints(rawQuery) {
    const qRaw = String(rawQuery || '').trim();
    const q = qRaw.toLowerCase();
    const qNorm = normSearchText(qRaw);
    if (!qNorm || !window.KNOWLEDGE_INDEX?.subjects) return [];
    const aliasTerms = [];
    for (const [re, words] of KP_ALIASES) {
      if (re.test(q) || re.test(qNorm)) {
        words.forEach((w, idx) => {
          const nw = normSearchText(w);
          if (nw) aliasTerms.push({ term: nw, rank: idx });
        });
      }
    }
    // 双字/词元切分，用于容错匹配（如“多档位电热器”“金属混合盐滤液”）
    const tokens = [];
    const alpha = qNorm.match(/[a-z0-9]+/g) || [];
    tokens.push(...alpha.filter(t => t.length >= 2));
    const cjk = qNorm.replace(/[a-z0-9]+/g, '');
    for (let i = 0; i < cjk.length - 1; i++) tokens.push(cjk.slice(i, i + 2));
    const uniqTokens = [...new Set(tokens)];

    const results = [];
    for (const subj of window.KNOWLEDGE_INDEX.subjects) {
      for (const sem of subj.semesters || []) {
        if (!sem.ready) continue;
        for (const ch of sem.chapters || []) {
          for (const p of ch.points || []) {
            const nameN = normSearchText(p.name);
            const chN = normSearchText(ch.name);
            const kwN = normSearchText(p.kw || '');
            const hayN = `${normSearchText(subj.label)}${normSearchText(sem.label)}${chN}${nameN}`;
            const fullN = `${hayN}${kwN}`;
            let score = 0;
            if (nameN.includes(qNorm)) score += 120;
            else if (chN.includes(qNorm)) score += 75;
            else if (kwN.includes(qNorm)) score += 65;
            else if (hayN.includes(qNorm)) score += 50;
            else {
              let bestAlias = 0;
              for (const a of aliasTerms) {
                const bonus = a.rank === 0 ? 12 : (a.rank === 1 ? 6 : 0);
                if (nameN.includes(a.term)) bestAlias = Math.max(bestAlias, 44 + bonus);
                else if (fullN.includes(a.term)) bestAlias = Math.max(bestAlias, 30 + Math.floor(bonus / 2));
              }
              if (bestAlias) score += bestAlias;
              else if (uniqTokens.length >= 2) {
                const hitCnt = uniqTokens.filter(t => fullN.includes(t)).length;
                const ratio = hitCnt / uniqTokens.length;
                if (ratio >= 0.5) score += Math.round(22 * ratio);
              }
            }
            if (!score) continue;
            if (sem.key === 'sp') score += 5;
            if (p.hasDeep) score += 8;
            if (p.hasEssay) score += 6;
            if (String(p.tag || '').includes('★')) score += 4;
            results.push({
              subject: subj.key, subjectLabel: subj.label,
              semester: sem.key, semLabel: sem.label,
              chapter: ch.name, id: p.id, name: p.name, tag: p.tag || '',
              hasEssay: !!p.hasEssay, hasDeep: !!p.hasDeep,
              count: p.ids?.length || 0, score,
            });
          }
        }
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 12);
  }
  function searchBoxHTML(idPrefix) {
    const hots = ['婆罗摩笈多', '阿氏圆', '安阻法', '万能瓶', '滤液滤渣', '电路故障'];
    return `<div class="kp-search-wrap" data-kp-search-wrap>
      <div class="kp-search-row">
        <input type="search" class="kp-search-input" id="${idPrefix}KpSearch" placeholder="🔍 搜课本考点或名师模型：如 婆罗摩笈多、阿氏圆、安阻法、万能瓶、滤液滤渣…" autocomplete="off" aria-label="搜索数理化知识点或压轴模型">
      </div>
      <div class="kp-search-hots"><span>热搜模型：</span>${hots.map(h => `<button type="button" class="kp-hot-chip" data-kp-hot="${h}">${h}</button>`).join('')}<a class="kp-models-link" href="./models.html">🏆 59 大压轴模型图鉴 &amp; A4 手册 →</a></div>
      <div class="kp-search-results" data-kp-search-results hidden></div>
    </div>`;
  }
  let missTrackTimer = null;
  function wireSearchBox(root) {
    const wrap = root?.querySelector('[data-kp-search-wrap]');
    if (!wrap) return;
    const input = wrap.querySelector('.kp-search-input');
    const box = wrap.querySelector('[data-kp-search-results]');
    const run = async (val) => {
      const q = String(val || '').trim();
      if (!q) { box.hidden = true; box.innerHTML = ''; return; }
      await loadIndex().catch(() => null);
      const list = searchPoints(q);
      if (!list.length) {
        clearTimeout(missTrackTimer);
        if (q.length >= 2) missTrackTimer = setTimeout(() => app.track?.('kp_search_miss'), 900);
        const fbUrl = `https://elx.cc.cd/?panel=feedback&from=x4m-kp-miss&q=${encodeURIComponent(q)}`;
        box.innerHTML = `<div class="kp-sr-empty">暂时没搜到「<b>${esc(q)}</b>」对应的知识点或模型。<a href="${fbUrl}" target="_blank" rel="noopener">一键把「${esc(q)}」带去留言给作者，优先补进题库 ›</a></div>`;
        box.hidden = false;
        return;
      }
      box.innerHTML = list.map(item => `
        <button type="button" class="kp-sr-item" data-sr-subj="${esc(item.subject)}" data-sr-sem="${esc(item.semester)}" data-sr-pt="${esc(item.id)}">
          <span class="kp-sr-main"><b>${esc(item.name)}</b>${item.hasDeep ? '<em class="kp-deep-tag">名师详讲</em>' : ''}${item.hasEssay ? '<em class="kp-essay-tag">含大题</em>' : ''}</span>
          <span class="kp-sr-sub">${esc(item.subjectLabel)} · ${esc(item.semLabel)} · ${esc(item.chapter)}（${item.count} 题）›</span>
        </button>`).join('');
      box.hidden = false;
      box.querySelectorAll('[data-sr-pt]').forEach(btn => btn.addEventListener('click', () => {
        void open({ subject: btn.dataset.srSubj, semester: btn.dataset.srSem, point: btn.dataset.srPt });
      }));
    };
    input.addEventListener('input', () => { void run(input.value); });
    wrap.querySelectorAll('[data-kp-hot]').forEach(btn => btn.addEventListener('click', () => {
      input.value = btn.dataset.kpHot;
      void run(btn.dataset.kpHot);
      input.focus();
    }));
  }

  // ---- 3 分钟快测（8 题阶梯摸底：2 基础 + 4 提高 + 2 拓展，分散覆盖各章高频点） ----
  function quickDiagQuestions(data) {
    const byId = new Map(data.questions.map(q => [q.id, q]));
    const chapters = data.chapters || [];
    const pool = [];
    // 按章节轮询提取知识点，优先带 ★ 的中考高频点
    const sortedChapters = chapters.map(c => ({
      name: c.name,
      points: [...c.points].sort((a, b) => Number(String(b.tag || '').includes('★')) - Number(String(a.tag || '').includes('★'))),
    }));
    const maxLen = Math.max(0, ...sortedChapters.map(c => c.points.length));
    for (let i = 0; i < maxLen; i++) {
      for (const c of sortedChapters) {
        if (c.points[i]) pool.push(c.points[i]);
      }
    }
    const usedPoints = new Set();
    const picked = [];
    const takeLevel = (lv, want) => {
      for (const p of pool) {
        if (picked.filter(x => x.level === lv).length >= want) break;
        if (usedPoints.has(p.id)) continue;
        const qs = p.qids.map(id => byId.get(id)).filter(q => q && q.type !== 'essay');
        const cand = (lv === 2 ? qs.find(q => q.kpDiag) : null) || qs.find(q => q.level === lv);
        if (cand) {
          usedPoints.add(p.id);
          picked.push({ ...cand, kpFree: true, kpQuickDiag: true });
        }
      }
    };
    takeLevel(1, 2);
    takeLevel(2, 4);
    takeLevel(3, 2);
    // 若某学期知识点较少不足 8 题，按序补齐
    if (picked.length < 8) {
      for (const p of pool) {
        if (picked.length >= 8) break;
        if (usedPoints.has(p.id)) continue;
        const qs = p.qids.map(id => byId.get(id)).filter(q => q && q.type !== 'essay');
        const cand = qs.find(q => q.kpDiag) || qs[0];
        if (cand) {
          usedPoints.add(p.id);
          picked.push({ ...cand, kpFree: true, kpQuickDiag: true });
        }
      }
    }
    return picked.sort((a, b) => (a.level || 1) - (b.level || 1));
  }

  // ---- 首页大卡片 ----
  function homeCardHTML(stage) {
    const idx = window.KNOWLEDGE_INDEX;
    const subj = idx?.subjects?.find(s => s.key === state.subject) || idx?.subjects?.[0];
    const sem = subj?.semesters.find(s => s.stage === stage && s.ready) || subj?.semesters.find(s => s.ready) || subj?.semesters[0];
    const ready = subj?.semesters.filter(s => s.ready) || [];
    const totals = totalSummaryCounts();
    const subTotals = subjectSummaryCounts(subj);
    const semPills = ready.length
      ? `<div class="kp-home-sems" aria-label="${esc(subj?.label || '')}全部学期知识点">${ready.map(s => `<button type="button" class="kp-sem-pill ${s.key === sem?.key ? 'is-cur' : ''}" data-kp-sem="${s.key}">${esc(s.label.replace('学期', ''))}<b>${s.pointCount}点</b></button>`).join('')}</div>`
      : '';
    let body;
    if (!subj) {
      body = '<p class="muted">正在加载知识点目录…</p>';
    } else if (sem?.ready) {
      const st = semesterStats(sem);
      const weak = st.weak + st.shaky;
      body = `
        <div class="kp-home-stats">
          <span><b>${subTotals.pts}</b>${esc(subj.label)}全初中点<small class="kp-sub-note">（本学期 ${st.total} 点）</small></span>
          <span><b>${subTotals.essays}</b>道${esc(subj.label)}解答大题<small class="kp-sub-note">（三科共 ${totals.essays} 道）</small></span>
          <span class="kp-weak-text"><b>${weak}</b>本学期待补</span>
          <span><b>${st.ok + st.good}</b>本学期已掌握</span>
        </div>
        ${semPills}
        <div class="kp-home-actions">
          <button class="btn primary" type="button" data-kp-go="quick">开始 3 分钟快测（8 题免费）</button>
          <button class="btn kp-sprint-btn" type="button" data-kp-go="sprint7">🔥 考前 7 天急救包</button>
          <button class="btn" type="button" data-kp-go="${weak ? 'weak' : 'mark'}">${weak ? `集中补弱项（${weak} 个）` : '家长勾选薄弱点'}</button>
          <button class="btn" type="button" data-kp-sem="sp">专题与压轴（含大题）</button>
          <button class="btn" type="button" data-kp-go="sample-print">预览 A4 补缺样卷</button>
          <button class="btn" type="button" data-kp-go="weekly-poster">📊 生成本周补缺战报</button>
          <button class="btn text-button" type="button" data-kp-go="list">查看全部 ${subTotals.pts} 个知识点 ›</button>
        </div>`;
    } else {
      body = `<p class="muted">${esc(sem?.label || '')}${esc(subj?.label || '')}知识点正在整理，全初中已上线 <b>${subTotals.pts} 个知识点</b>：${ready.map(s => esc(s.label)).join('、') || '—'}。</p>
        ${semPills}
        <div class="kp-home-actions">${ready.map(s => `<button class="btn primary" type="button" data-kp-sem="${s.key}">看${esc(s.label)}（${s.pointCount}点）</button>`).join('')}<button class="btn kp-sprint-btn" type="button" data-kp-go="sprint7">🔥 考前 7 天急救包</button><button class="btn" type="button" data-kp-go="weekly-poster">📊 生成本周补缺战报</button></div>`;
    }
    return `<section class="card kp-home" id="knowledgeHome">
      <div class="kp-home-head"><span class="kp-badge">数理化补缺主线 · 名师 4 步微课</span><h2>全初中 ${totals.pts} 个知识点 · 秒搜直达 ＋ 3 分钟测弱项</h2></div>
      ${searchBoxHTML('home')}
      <div class="kp-sem-tabs" style="margin:10px 0 6px">${(idx?.subjects || []).map(s => { const sc = subjectSummaryCounts(s); return `<button type="button" class="btn ${s.key === (subj?.key || 'math') ? 'primary' : ''}" data-kp-subj="${s.key}">${esc(s.label)}（${sc.pts}点）</button>`; }).join('')}</div>
      <p class="kp-home-lead">全初中数理化共 <b>${totals.pts}</b> 个核心知识点、<b>${totals.qs.toLocaleString()}</b> 道分层题与 <b>${totals.essays}</b> 道解答大题。先用 8 道阶梯题出<b>《孩子学情体检单》</b>，再进<b>《名师 4 步通关微课》</b>（遮罩背公式 → 拆母题 → 3 关集 ★★★），一键印 A4 卷纸上验收。</p>
      ${sem ? `<p class="kp-home-sem">当前定位：<b>${esc(sem.label)}</b>${sem.ready ? `（${sem.chapters.length} 章 ${sem.pointCount} 点，点上方胶囊可切全初中任意学期）· 免费测 8 题＋每点第 1 关免费` : ''}</p>` : ''}
      ${body}
    </section>`;
  }
  function wireHome(root) {
    wireSearchBox(root);
    root.querySelectorAll('[data-kp-go]').forEach(b => b.addEventListener('click', () => {
      const go = b.dataset.kpGo;
      if (go === 'sample-print') { void previewSampleSheet(app.stage()); return; }
      if (go === 'sprint7') { void openSprint7(app.stage()); return; }
      if (go === 'weekly-poster') { app.openWeeklyPoster?.(); return; }
      void open({ stage: app.stage(), action: go });
    }));
    root.querySelectorAll('[data-kp-sem]').forEach(b => b.addEventListener('click', () => { void open({ subject: state.subject, semester: b.dataset.kpSem }); }));
    root.querySelectorAll('[data-kp-subj]').forEach(b => b.addEventListener('click', () => {
      state.subject = b.dataset.kpSubj;
      const el = document.getElementById('knowledgeHome');
      if (el) {
        const wrap = document.createElement('div');
        wrap.innerHTML = homeCardHTML(app.stage());
        el.replaceWith(wrap.firstElementChild);
        wireHome(document.getElementById('knowledgeHome'));
      }
    }));
  }

  // ---- 首页“预览 A4 补缺样卷”：让家长零门槛看到纸质补缺卷的质感 ----
  async function previewSampleSheet(stage) {
    const idx = await loadIndex().catch(() => null);
    if (!idx) { app.toast('知识点资料加载失败，请检查网络后重试。'); return; }
    const semKey = semesterForStage(idx, stage);
    try {
      const data = await loadSemester(state.subject, semKey);
      const weak = weakPoints(data);
      let samplePts = weak.slice(0, 2);
      if (!samplePts.length) {
        const allPts = data.chapters.flatMap(c => c.points);
        const hot = allPts.filter(p => String(p.tag || '').includes('★'));
        samplePts = (hot.length >= 2 ? hot : allPts).slice(0, 2);
      }
      openPrintSheet(data, samplePts, `${data.label} · 专属薄弱知识点补缺卷${weak.length ? '' : '（样卷预览）'}`, { sample: !weak.length });
    } catch (error) {
      app.toast(error.message);
    }
  }

  // ---- 页面 ----
  function shell(inner) {
    document.body.classList.remove('practice');
    const totals = totalSummaryCounts();
    app.view.innerHTML = `
      <div class="national-header">
        <button type="button" class="btn text-button" data-kp-home>← 返回首页</button>
        <h1 id="kpTitle" tabindex="-1">数理化按知识点补缺补漏</h1>
        <p class="muted">人教版同步 ＋ 中考专题与压轴（<b>${totals.pts} 个知识点 · ${totals.essays} 道解答大题分步拆解</b>）。名师 4 步通关微课：遮罩背公式 → 拆母题 → 3 关星级闯关 → 一键印 A4 卷。</p>
      </div>${inner}`;
    app.view.querySelector('[data-kp-home]').addEventListener('click', () => { leave(); app.home(); });
  }
  function semTabs(idx) {
    const subj = idx.subjects.find(s => s.key === state.subject) || idx.subjects[0];
    const subjBar = idx.subjects.length > 1 ? `<div class="kp-sem-tabs" role="tablist" aria-label="切换学科">${idx.subjects.map(s => { const sc = subjectSummaryCounts(s); return `<button type="button" class="btn ${s.key === subj.key ? 'primary' : ''}" data-subj="${s.key}">${esc(s.label)}（${sc.pts}点）</button>`; }).join('')}</div>` : '';
    return subjBar + `<div class="kp-sem-tabs" role="tablist">${subj.semesters.map(s => `<button type="button" class="btn ${s.key === state.semester ? 'primary' : ''}" data-sem="${s.key}" ${s.ready ? '' : 'aria-disabled="true"'}>${esc(s.label)}${s.ready ? `<small>${s.pointCount}点</small>` : '<small>整理中</small>'}</button>`).join('')}</div>`;
  }
  function levelOf(q) {
    if (q.type === 'essay') return 3.5;
    return q.knowledge ? (q.level || 1) : 4;
  }
  function pointQuestions(data, point, onlyUndone = false) {
    const byId = new Map(data.questions.map(q => [q.id, q]));
    const progress = app.progress();
    let list = [...point.qids, ...point.refs].map(id => byId.get(id)).filter(Boolean)
      .sort((a, b) => levelOf(a) - levelOf(b));
    if (onlyUndone) list = list.filter(q => !progress.banks?.[q.id]?.correct);
    return list;
  }
  function startList(list, emptyMsg) {
    if (!list.length) { app.toast(emptyMsg || '这里没有要练的题了。'); return; }
    if (!app.hasAccess()) {
      const free = list.filter(app.isTrial);
      if (!free.length) {
        const hasEssay = list.some(q => q.type === 'essay');
        const totals = totalSummaryCounts();
        app.unlock(hasEssay
          ? `中考压轴解答大题（含分步审题思路＋采分点自评）属于完整版专属：一次买断 ¥19.9，解锁全部 ${totals.essays} 道数理化解答大题、${totals.pts} 个知识点与无限 A4 打印。`
          : '这些知识点的提高/拓展题属于完整版：每个知识点前 3 题与 3 分钟快测免费，完整版全部开放。');
        return;
      }
      if (free.length < list.length) app.toast(`免费可练 ${free.length} 题，完整版可练全部 ${list.length} 题（含压轴解答大题）。`);
    }
    app.practice(list);
  }
  function diagQuestions(data, chapterName = '') {
    const out = [];
    for (const c of data.chapters) {
      if (chapterName && c.name !== chapterName) continue;
      for (const p of c.points) {
        const qs = p.qids.map(id => data.questions.find(q => q.id === id)).filter(q => q && q.type !== 'essay');
        const pick = qs.find(q => q.kpDiag) || qs[0];
        if (pick) out.push(pick);
        if (chapterName) { const second = qs.find(q => q.level === 1); if (second && second !== pick) out.push(second); }
      }
    }
    return out;
  }
  function weakPoints(data) {
    const progress = app.progress(); const marked = readMarked();
    const out = [];
    for (const c of data.chapters) for (const p of c.points) {
      const st = pointStatus([...p.qids, ...p.refs], progress, marked, p.id);
      if (st.key === 'weak' || st.key === 'shaky') out.push(p);
    }
    return out;
  }

  function formatPrintAnswer(q) {
    if (q.type === 'judge') return q.answer?.[0] === 'true' ? '正确' : '错误';
    if (q.type === 'essay') {
      if (q.sample) return q.sample;
      if (q.points?.length) return q.points.map((p, i) => `${i + 1}. ${p.text}`).join('；');
    }
    return Array.isArray(q.answer) ? q.answer.join(' / ') : String(q.answer || '');
  }
  function levelBadge(q) {
    if (q.type === 'essay') return `<span class="kp-pr-lv kp-pr-lv-essay">压轴解答 · ${q.score || 10}分</span>`;
    if (q.level === 3) return '<span class="kp-pr-lv kp-pr-lv-3">拓展</span>';
    if (q.level === 2) return '<span class="kp-pr-lv kp-pr-lv-2">提高</span>';
    if (q.kpRef) return '<span class="kp-pr-lv kp-pr-lv-ref">真题</span>';
    return '<span class="kp-pr-lv kp-pr-lv-1">基础</span>';
  }

  // ---- 名校教研风 A4 专属补缺卷（知识点卡片 + 分层题 + 解题留白区 + 家长核对引导页） ----
  function openPrintSheet(data, points, title, opts = {}) {
    if (!points.length) { app.toast('当前没有可打印的知识点。'); return; }
    app.track?.('kp_print_preview');
    const paid = app.hasAccess();
    const byId = new Map(data.questions.map(q => [q.id, q]));
    const sections = [];
    const answers = [];
    let qNo = 0;
    let omitted = 0;
    let omittedEssays = 0;
    for (const p of points) {
      const allQs = [...p.qids, ...p.refs].map(id => byId.get(id)).filter(Boolean).sort((a, b) => levelOf(a) - levelOf(b));
      const picked = (paid ? allQs : allQs.filter(app.isTrial)).slice(0, paid ? 9 : 3);
      const skipped = allQs.filter(q => !picked.includes(q));
      omitted += skipped.length;
      omittedEssays += skipped.filter(q => q.type === 'essay').length;
      const qHtml = picked.map(q => {
        qNo++;
        const optsHtml = (q.type === 'single' || q.type === 'multiple') && q.options?.length
          ? `<div class="kp-pr-opts">${q.options.map(o => `<span><b>${esc(o.key)}.</b> ${esc(o.text)}</span>`).join('')}</div>` : '';
        const img = q.image ? `<img class="kp-pr-fig" src="${esc(q.image)}" alt="题目配图">` : '';
        const workbox = q.type === 'essay'
          ? '<div class="kp-pr-workbox kp-pr-workbox-lg"><span>解题步骤区（请规范写出辅助线 / 公式 / 推理过程）：</span></div>'
          : (q.level === 3 || q.type === 'blank' ? '<div class="kp-pr-workbox"><span>草稿与演算区：</span></div>' : '');
        const ansStr = formatPrintAnswer(q);
        if (q.type === 'essay') {
          const ptsList = (q.points || []).map((pt, i) => `<li>${esc(pt.text)} <b>（${pt.score} 分）</b></li>`).join('');
          answers.push(`<div class="kp-pr-ans-item kp-pr-ans-essay">
            <p><b>${qNo}.【${esc(q.meta || '压轴解答')} · 满分 ${q.score || 10} 分】</b></p>
            ${q.method ? `<p class="kp-pr-method"><b>家长引导 / 审题思路：</b>${esc(q.method)}</p>` : ''}
            ${ptsList ? `<ol class="kp-pr-pts">${ptsList}</ol>` : ''}
            <div class="kp-pr-sample"><b>规范解答示范：</b><pre>${esc(ansStr)}</pre></div>
            ${q.explanation ? `<p class="kp-pr-tip"><b>阅卷提醒：</b>${esc(q.explanation)}</p>` : ''}
          </div>`);
        } else {
          answers.push(`<div class="kp-pr-ans-item"><b>${qNo}.</b> 答案：<b>${esc(ansStr)}</b>${q.explanation ? `　解析：${esc(q.explanation)}` : ''}</div>`);
        }
        return `<div class="kp-pr-q"><p class="kp-pr-stem"><b>${qNo}.</b> ${levelBadge(q)} ${esc(q.stem)}</p>${img}${optsHtml}${workbox}</div>`;
      }).join('');
      const c = p.card;
      const d = p.deep;
      sections.push(`<section class="kp-pr-sec">
        <div class="kp-pr-card">
          <h3>${esc(p.name)}${p.tag ? ` <small>${esc(p.tag)}</small>` : ''}${p.hasEssay ? ' <span class="kp-pr-essay-pill">含压轴大题</span>' : ''}</h3>
          <p><b>核心要点：</b>${c.concept.map(esc).join(' ')}</p>
          <p><b>通法公式：</b>${c.formula.map(esc).join(' ')}</p>
          <p><b>防错红线：</b>${c.pitfall.map(esc).join(' ')}</p>
          ${d?.triggers?.length ? `<p><b>题眼识别：</b>${d.triggers.map(esc).join('；')}</p>` : ''}
          ${d?.parentGuide?.ask ? `<p><b>家长 30 秒抽查：</b>${esc(d.parentGuide.ask)}</p>` : ''}
        </div>
        ${qHtml || '<p class="muted">（本点暂无可打印题目）</p>'}
      </section>`);
    }
    const old = document.getElementById('kpPrintOverlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'kpPrintOverlay';
    overlay.className = 'kp-print-overlay';
    const previewStrip = !paid
      ? `<div class="kp-pr-preview-note">体验样卷预览（每点含前 3 道免费题${omitted ? `，另有 ${omitted} 道提高/拓展${omittedEssays ? `与 ${omittedEssays} 道压轴解答大题` : ''}在完整版开放` : ''}）· 解锁完整版 ¥19.9 可无水印打印全部薄弱点与家长引导页</div>`
      : '';
    overlay.innerHTML = `
      <div class="kp-pr-bar no-print">
        <div class="kp-pr-bar-info"><b>教研风 A4 补缺卷预览</b> · 共 ${points.length} 个知识点、${qNo} 道题${!paid && omitted ? `（完整版可印全部 ${qNo + omitted} 题）` : ''}</div>
        <div class="kp-pr-bar-btns">
          ${!paid ? '<button type="button" class="btn" id="kpPrUnlock">解锁完整无水印打印 ¥19.9</button>' : ''}
          <button type="button" class="btn primary" id="kpPrGo">立即打印 / 存 PDF</button>
          <button type="button" class="btn" id="kpPrClose">关闭</button>
        </div>
      </div>
      <div class="kp-pr-page">
        ${previewStrip}
        <header class="kp-pr-head">
          <div class="kp-pr-brand">爱丽克丝中考题库 · 教研补缺专练卷（x4m.cc.cd）</div>
          <h1>${esc(title)}</h1>
          <p>${esc(data.label)} · 姓名：___________　日期：___________　用时：______分钟　自评得分：______</p>
        </header>
        ${sections.join('')}
        <div class="kp-pr-ans">
          <h2>家长核对与引导页（含分步审题思路与参考答案，可单独打印）</h2>
          ${answers.join('')}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.body.classList.add('kp-printing');
    overlay.querySelector('#kpPrClose').addEventListener('click', () => { overlay.remove(); document.body.classList.remove('kp-printing'); });
    overlay.querySelector('#kpPrGo').addEventListener('click', async () => {
      const imgs = [...overlay.querySelectorAll('img')];
      await Promise.all(imgs.map(im => im.decode().catch(() => {})));
      if (window.QuizReferrals?.print) window.QuizReferrals.print(location.href);
      else window.print();
    });
    const totals = totalSummaryCounts();
    overlay.querySelector('#kpPrUnlock')?.addEventListener('click', () => {
      overlay.remove();
      document.body.classList.remove('kp-printing');
      app.unlock(`开通完整版（¥19.9 一次买断），即可无水印无限打印${totals.subjects}全部 ${totals.pts} 个知识点的完整练习卷、${totals.essays} 道压轴解答大题与家长引导页。`);
    });
  }

  function weakQueue(data, points) {
    const lists = points.map(p => pointQuestions(data, p, true).slice(0, 9));
    return lists.flat();
  }

  async function render() {
    const rev = ++renderRev;
    shell('<p class="muted">正在加载知识点…</p>');
    let idx; let data;
    try {
      idx = await loadIndex();
      const subj = idx.subjects.find(s => s.key === state.subject);
      const sem = subj.semesters.find(s => s.key === state.semester);
      if (!sem?.ready) { if (rev === renderRev) drawNotReady(idx, sem); return; }
      data = await loadSemester(state.subject, state.semester);
    } catch (error) { if (rev === renderRev) shell(`<p class="card">${esc(error.message)}</p>`); return; }
    if (rev !== renderRev) return;
    if (state.view === 'point') drawPoint(idx, data); else drawList(idx, data);
    window.scrollTo(0, 0);
  }
  let renderRev = 0;

  function drawNotReady(idx, sem) {
    const subj = idx.subjects.find(s => s.key === state.subject) || idx.subjects[0];
    const firstReady = subj?.semesters?.find(s => s.ready);
    shell(`${semTabs(idx)}<section class="card kp-empty"><h2>${esc(sem?.label || '')}${esc(subj?.label || '')}知识点正在整理</h2><p class="muted">其余已上线学期可直接点击切换学习。</p>${firstReady ? `<button class="btn primary" type="button" data-sem="${esc(firstReady.key)}">看${esc(firstReady.label)}</button>` : ''}</section>`);
    wireTabs();
  }
  function wireTabs() {
    app.view.querySelectorAll('[data-subj]').forEach(b => b.addEventListener('click', () => {
      state.subject = b.dataset.subj;
      state.semester = semesterForStage(window.KNOWLEDGE_INDEX, app.stage());
      state.view = 'list'; state.selecting = false; void render();
    }));
    app.view.querySelectorAll('[data-sem]').forEach(b => b.addEventListener('click', () => { state.semester = b.dataset.sem; state.view = 'list'; state.selecting = false; void render(); }));
  }

  function drawList(idx, data) {
    const progress = app.progress(); const marked = readMarked();
    const stats = { none: 0, weak: 0, shaky: 0, ok: 0, good: 0, essays: 0, cleared: 0, deep: 0 };
    const rows = data.chapters.map((c, ci) => {
      let chEssays = 0;
      let chCleared = 0;
      const items = c.points.map(p => {
        const st = pointStatus([...p.qids, ...p.refs], progress, marked, p.id); stats[st.key]++;
        const m = pointMastery(data, p, progress);
        if (m.stars === 3) { chCleared++; stats.cleared++; }
        if (p.hasEssay) { stats.essays++; chEssays++; }
        if (p.hasDeep || p.deep) stats.deep++;
        const sel = state.selecting ? `<input type="checkbox" class="kp-check" data-mark="${p.id}" ${marked.has(p.id) ? 'checked' : ''} aria-label="标记为薄弱：${esc(p.name)}">` : '';
        return `<li class="kp-row">${sel}<button type="button" class="kp-point" data-point="${p.id}"><span class="kp-name">${esc(p.name)}${p.tag ? `<em class="kp-tag">${esc(p.tag)}</em>` : ''}${p.hasDeep || p.deep ? '<em class="kp-deep-tag">名师详讲</em>' : ''}${p.hasEssay ? '<em class="kp-essay-tag">含压轴大题</em>' : ''}</span><span class="kp-meta">${starBadgeHTML(m.stars)} · ${p.qids.length + p.refs.length} 题 · <i class="${STATUS[st.key].cls}">${STATUS[st.key].label}${st.done ? ` ${st.right}/${st.done}` : ''}</i></span></button></li>`;
      }).join('');
      const chPct = c.points.length ? Math.round((chCleared / c.points.length) * 100) : 0;
      const open = state.open.has(c.name) || state.selecting || (state.semester === 'sp' && ci === 0 && state.open.size === 0);
      return `<details class="card kp-chapter" data-chapter="${esc(c.name)}" ${open ? 'open' : ''}><summary><span class="kp-ch-title"><b>${esc(c.name)}</b><i class="kp-ch-bar" aria-hidden="true"><b style="width:${chPct}%"></b></i></span><span>已通关 ${chCleared}/${c.points.length}${chEssays ? ` · ${chEssays} 道大题` : ''} ›</span></summary><ol class="kp-list">${items}</ol><div class="kp-chapter-actions"><button class="btn" type="button" data-diag-chapter="${esc(c.name)}">本章诊断（${diagQuestions(data, c.name).length} 题）</button></div></details>`;
    }).join('');
    const weak = weakPoints(data);
    const total = data.chapters.reduce((s, c) => s + c.points.length, 0);
    const qDiag = quickDiagQuestions(data);
    shell(`${searchBoxHTML('dir')}${semTabs(idx)}
      <section class="card kp-summary">
        <div class="kp-home-stats"><span><b>${total}</b>个知识点</span><span><b>${stats.cleared}</b>个三星通关</span><span class="kp-weak-text"><b>${stats.weak + stats.shaky}</b>个待补</span>${stats.essays ? `<span><b>${stats.essays}</b>道解答大题</span>` : `<span><b>${stats.ok + stats.good}</b>个已掌握</span>`}</div>
        <p class="muted kp-how">名师 4 步补缺闭环：① 先做 <b>3 分钟快测（${qDiag.length} 题）</b>拿《孩子学情体检单》；② 点开知识点进入<b>《名师 4 步通关微课》</b>（遮罩背公式 → 拆母题 → 3 关集齐 ★★★）；③ 一键打印专属 A4 补缺卷在纸上验收。</p>
        <div class="kp-home-actions">
          <button class="btn primary" type="button" data-kp-act="quick">3 分钟快测（${qDiag.length} 题）</button>
          <button class="btn" type="button" data-kp-act="diag">全学期深度诊断（${diagQuestions(data).length} 题）</button>
          <button class="btn" type="button" data-kp-act="weak" ${weak.length ? '' : 'disabled'}>练薄弱点（${weak.length} 个）</button>
          <button class="btn" type="button" data-kp-act="print-weak" ${weak.length ? '' : 'disabled'}>打印薄弱 A4 卷</button>
          <button class="btn ${state.selecting ? 'primary' : ''}" type="button" data-kp-act="select">${state.selecting ? '勾选完成' : '我来选薄弱点'}</button>
        </div>
        ${state.selecting ? '<p class="kp-select-tip">在下面勾选孩子不会的知识点，勾上的会算作“薄弱”，可随时取消。</p>' : ''}
      </section>
      ${rows}
      <p class="muted kp-foot">知识点按人教版新教材整理；带 ★ 为中考高频，◆ 为易错点，“名师详讲”含题眼识别、通法 3 步走与家长 30 秒提问卡，“含压轴大题”配分步思路与采分点自评。3 分钟快测与每点第 1 关免费，完整版全部开放。</p>`);
    wireSearchBox(app.view);
    wireTabs();
    app.view.querySelectorAll('details[data-chapter]').forEach(d => d.addEventListener('toggle', () => { if (d.open) state.open.add(d.dataset.chapter); else state.open.delete(d.dataset.chapter); }));
    app.view.querySelectorAll('[data-point]').forEach(b => b.addEventListener('click', () => { state.point = b.dataset.point; state.view = 'point'; void render(); }));
    app.view.querySelectorAll('[data-mark]').forEach(box => box.addEventListener('change', () => {
      const set = readMarked(); if (box.checked) set.add(box.dataset.mark); else set.delete(box.dataset.mark); saveMarked(set);
    }));
    app.view.querySelectorAll('[data-diag-chapter]').forEach(b => b.addEventListener('click', () => startList(diagQuestions(data, b.dataset.diagChapter))));
    app.view.querySelector('[data-kp-act="quick"]').addEventListener('click', () => { app.track?.('kp_quick_diag_start'); startList(qDiag); });
    app.view.querySelector('[data-kp-act="diag"]').addEventListener('click', () => startList(diagQuestions(data)));
    app.view.querySelector('[data-kp-act="weak"]').addEventListener('click', () => startList(weakQueue(data, weakPoints(data)), '薄弱知识点的题都做对了，可以再做一次快测检验。'));
    app.view.querySelector('[data-kp-act="print-weak"]').addEventListener('click', () => openPrintSheet(data, weakPoints(data), `${data.label} · 薄弱知识点补缺卷`));
    app.view.querySelector('[data-kp-act="select"]').addEventListener('click', () => { state.selecting = !state.selecting; drawList(idx, data); });
  }

  let reciteMaskOn = false;

  function drawPoint(idx, data) {
    let point; let chapter;
    for (const c of data.chapters) for (const p of c.points) if (p.id === state.point) { point = p; chapter = c; }
    if (!point) { state.view = 'list'; drawList(idx, data); return; }
    const progress = app.progress(); const marked = readMarked();
    const st = pointStatus([...point.qids, ...point.refs], progress, marked, point.id);
    const mastery = pointMastery(data, point, progress);
    const all = pointQuestions(data, point);
    const undone = pointQuestions(data, point, true);
    const essays = all.filter(q => q.type === 'essay');
    const card = point.card;
    const deep = point.deep;
    const li = arr => (arr || []).map(t => `<li>${reciteMaskOn ? maskKpText(t) : esc(t)}</li>`).join('');
    const flat = chapter.points;
    const i = flat.indexOf(point);
    const paid = app.hasAccess();
    const starTip = mastery.stars === 3
      ? '🎉 已集齐 3 颗星！建议印出 A4 卷在纸上限时验收。'
      : !mastery.s1.cleared
        ? `先刷「第 1 关·基础稳拿」答对剩余 ${mastery.s1.total - mastery.s1.right} 题，点亮第 1 颗星（免费）！`
        : !mastery.s2.cleared
          ? `第 1 关已过！再攻克「第 2 关·提分变式」剩余 ${mastery.s2.total - mastery.s2.right} 题，点亮第 2 颗星！`
          : `离满分三星只差最后一步！攻克「第 3 关·拓展${essays.length ? '/压轴大题' : ''}」即可三星通关！`;

    const primaryStep = splitExampleSteps(card.example.a);
    const bonusExamplesHtml = (deep?.examples || []).map((ex, ei) => `
      <div class="kp-step-ex" data-step-ex>
        <p class="kp-ex-badge">进阶母题 ${ei + 2} · ${esc(ex.title || '高频变式拆解')}</p>
        <p class="kp-ex-q">${esc(ex.q)}</p>
        <div class="kp-step-reveal-bar">
          <button type="button" class="btn" data-rev-step="1">① 看审题题眼</button>
          <button type="button" class="btn" data-rev-step="2">② 看破题通法</button>
          <button type="button" class="btn" data-rev-step="3">③ 看规范解答</button>
        </div>
        <div class="kp-rev-box" data-rev-box="1" hidden><b>① 审题题眼：</b>${esc(ex.eye)}</div>
        <div class="kp-rev-box" data-rev-box="2" hidden><b>② 破题通法：</b>${esc(ex.method)}</div>
        <div class="kp-rev-box is-final" data-rev-box="3" hidden><b>③ 规范解答：</b>${Array.isArray(ex.steps) ? ex.steps.map(s => `<div style="margin-top:4px">${esc(s)}</div>`).join('') : esc(ex.steps)}</div>
      </div>`).join('');

    const deepBlocksHtml = deep ? `
      <section class="kp-deep-block kp-deep-triggers">
        <h3>🎯 题眼识别（题目出现这些词立刻用）</h3>
        <ul>${li(deep.triggers)}</ul>
      </section>
      <section class="kp-deep-block kp-deep-steps">
        <h3>🧭 名师通法 3 步走</h3>
        <ol class="kp-steps-ol">${(deep.steps || []).map(t => `<li>${reciteMaskOn ? maskKpText(t) : esc(t)}</li>`).join('')}</ol>
      </section>
      <section class="kp-deep-block kp-deep-variants">
        <h3>🔀 常考变式对照（从保底到压轴）</h3>
        <ul>${li(deep.variants)}</ul>
      </section>
      ${deep.parentGuide ? `<section class="kp-parent-box">
        <h3>👨‍👩‍👧 家长 30 秒陪练抽查（不懂数理化也能考孩子）</h3>
        <p class="kp-parent-ask"><b>直接这样问孩子：</b>${esc(deep.parentGuide.ask)}</p>
        <details><summary>点开看孩子要答到哪些核心得分词</summary><p class="kp-parent-key">${esc(deep.parentGuide.key)}</p></details>
      </section>` : ''}` : '';

    shell(`${semTabs(idx)}
      <button type="button" class="btn text-button kp-back" data-back>← ${esc(chapter.name)} · 全部知识点</button>

      <section class="card kp-mastery-banner">
        <div class="kp-mastery-top">
          <div>
            <p class="kp-crumb">${esc(data.label)} · ${esc(chapter.name)}</p>
            <h2>${esc(point.name)}${point.tag ? `<em class="kp-tag">${esc(point.tag)}</em>` : ''}${deep ? '<em class="kp-deep-tag">名师详讲</em>' : ''}${essays.length ? '<em class="kp-essay-tag">含压轴大题</em>' : ''}</h2>
          </div>
          <div class="kp-mastery-stars">
            ${starBadgeHTML(mastery.stars)}
            <span>${mastery.stars}/3 星通关</span>
          </div>
        </div>
        <div class="kp-mastery-bar" aria-hidden="true"><i style="width:${Math.round((mastery.stars / 3) * 100)}%"></i></div>
        <p class="kp-mastery-tip">${starTip}</p>
      </section>

      <article class="card kp-card">
        <div class="kp-step-head">
          <span class="kp-step-pill">第 1 步 · 考点速通</span>
          <button type="button" class="btn ${reciteMaskOn ? 'primary' : ''}" id="kpMaskToggle">${reciteMaskOn ? '👁️ 关闭背诵遮罩' : '👁️ 开启背诵遮罩'}</button>
        </div>
        ${reciteMaskOn ? '<div class="kp-mask-hint"><span>已遮住核心公式、条件与关键词，先默背再轻点绿色色块核对。</span><div class="kp-mask-tools"><button type="button" class="btn" id="kpRevealAll">👁️ 全部揭晓</button><button type="button" class="btn" id="kpHideAll">🙈 全部重遮</button></div></div>' : ''}
        <section><h3>知识要点</h3><ul>${li(card.concept)}</ul></section>
        <section><h3>公式与方法</h3><ul>${li(card.formula)}</ul></section>
        <section class="kp-pitfall"><h3>⚠️ 防错红线（高频扣分坑）</h3><ul>${li(card.pitfall)}</ul></section>
        ${deepBlocksHtml}
      </article>

      <section class="card kp-example-card">
        <div class="kp-step-head">
          <span class="kp-step-pill">第 2 步 · 母题分步拆解</span>
          <span class="muted" style="font-size:12.5px">先想再点，逐层揭晓不直接剧透</span>
        </div>
        <div class="kp-step-ex" data-step-ex>
          <p class="kp-ex-badge">基础母题 1 · 规范示范</p>
          <p class="kp-ex-q">${esc(card.example.q)}</p>
          ${card.example.img ? `<img class="kp-fig" src="${esc(card.example.img)}" alt="例题配图" loading="lazy">` : ''}
          <div class="kp-step-reveal-bar">
            <button type="button" class="btn" data-rev-step="1">① 先看破题提示</button>
            <button type="button" class="btn" data-rev-step="2">② 看完整规范解答</button>
          </div>
          <div class="kp-rev-box" data-rev-box="1" hidden><b>① 破题提示：</b>${esc(primaryStep.hint)}</div>
          <div class="kp-rev-box is-final" data-rev-box="2" hidden><b>② 完整解答：</b>${esc(primaryStep.full)}</div>
        </div>
        ${bonusExamplesHtml}
      </section>

      <section class="card kp-practice">
        <div class="kp-step-head">
          <span class="kp-step-pill">第 3 步 · 3 关阶梯闯关</span>
          <span class="kp-state">当前状态：<i class="${STATUS[st.key].cls}">${STATUS[st.key].label}</i>${st.done ? `（已对 ${st.right}/${st.done}）` : ''}</span>
        </div>
        <div class="kp-stage-grid">
          <button type="button" class="kp-stage-card ${mastery.s1.cleared ? 'is-cleared' : ''}" data-start="s1" ${mastery.s1.total ? '' : 'disabled'}>
            <span class="kp-stage-lv">第 1 关 · 基础稳拿 <em>免费体验</em></span>
            <b>${mastery.s1.cleared ? '★ 已过关' : `去闯关（${mastery.s1.right}/${mastery.s1.total}）`}</b>
            <small>吃透定义与直接代公式，确保基础题零失分</small>
          </button>
          <button type="button" class="kp-stage-card ${mastery.s2.cleared ? 'is-cleared' : ''}" data-start="s2" ${mastery.s2.total ? '' : 'disabled'}>
            <span class="kp-stage-lv">第 2 关 · 提分变式 ${!paid ? '<em class="is-pro">完整版</em>' : ''}</span>
            <b>${mastery.s2.cleared ? '★ 已过关' : `去闯关（${mastery.s2.right}/${mastery.s2.total}）`}</b>
            <small>专练期中/期末拉分变式与隐含条件坑点</small>
          </button>
          <button type="button" class="kp-stage-card ${mastery.s3.cleared ? 'is-cleared' : ''} ${essays.length ? 'has-essay' : ''}" data-start="s3" ${mastery.s3.total ? '' : 'disabled'}>
            <span class="kp-stage-lv">第 3 关 · 拓展${essays.length ? '＋压轴大题' : '冲高'} ${!paid ? '<em class="is-pro">完整版</em>' : ''}</span>
            <b>${mastery.s3.cleared ? '★ 已过关' : `去冲刺（${mastery.s3.right}/${mastery.s3.total}）`}</b>
            <small>${essays.length ? `含 ${essays.length} 道规范解答大题（分步审题＋采分点自评）` : '挑战综合拓展题，冲刺高分档'}</small>
          </button>
        </div>
        <div class="kp-step-head" style="margin-top:14px">
          <span class="kp-step-pill">第 4 步 · 巩固与纸上验收</span>
        </div>
        <div class="kp-home-actions">
          <button class="btn primary" type="button" data-start="all">从头连刷本点（${all.length} 题${point.refs.length ? `，含 ${point.refs.length} 道真题` : ''}）</button>
          ${essays.length ? `<button class="btn kp-essay-btn" type="button" data-start="essay">直攻压轴解答大题（${essays.length} 题）</button>` : ''}
          <button class="btn" type="button" data-start="undone" ${undone.length && undone.length < all.length ? '' : 'disabled'}>只练没做对的（${undone.length} 题）</button>
          <button class="btn" type="button" data-start="print-one">🖨️ 打印本点 A4 通关卷</button>
          <label class="kp-mark"><input type="checkbox" data-mark-one ${marked.has(point.id) ? 'checked' : ''}> 标记为薄弱点</label>
        </div>
      </section>
      <nav class="kp-nav">${i > 0 ? `<button class="btn text-button" type="button" data-goto="${flat[i - 1].id}">‹ ${esc(flat[i - 1].name)}</button>` : '<span></span>'}${i < flat.length - 1 ? `<button class="btn text-button" type="button" data-goto="${flat[i + 1].id}">${esc(flat[i + 1].name)} ›</button>` : ''}</nav>`);
    wireTabs();
    app.view.querySelector('[data-back]').addEventListener('click', () => { state.view = 'list'; state.open.add(chapter.name); void render(); });
    app.view.querySelector('#kpMaskToggle')?.addEventListener('click', () => { reciteMaskOn = !reciteMaskOn; drawPoint(idx, data); });
    app.view.querySelector('#kpRevealAll')?.addEventListener('click', () => {
      app.view.querySelectorAll('[data-kp-blank]').forEach(btn => { btn.classList.add('revealed'); btn.setAttribute('aria-pressed', 'true'); });
    });
    app.view.querySelector('#kpHideAll')?.addEventListener('click', () => {
      app.view.querySelectorAll('[data-kp-blank]').forEach(btn => { btn.classList.remove('revealed'); btn.setAttribute('aria-pressed', 'false'); });
    });
    app.view.querySelectorAll('[data-kp-blank]').forEach(btn => btn.addEventListener('click', () => {
      const on = btn.classList.toggle('revealed');
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }));
    app.view.querySelectorAll('[data-step-ex]').forEach(wrap => {
      wrap.querySelectorAll('[data-rev-step]').forEach(btn => btn.addEventListener('click', () => {
        const n = btn.dataset.revStep;
        const box = wrap.querySelector(`[data-rev-box="${n}"]`);
        if (!box) return;
        const nextHidden = !box.hidden;
        box.hidden = nextHidden;
        btn.classList.toggle('primary', !nextHidden);
      }));
    });
    app.view.querySelector('[data-start="s1"]')?.addEventListener('click', () => startList(mastery.s1.list));
    app.view.querySelector('[data-start="s2"]')?.addEventListener('click', () => startList(mastery.s2.list));
    app.view.querySelector('[data-start="s3"]')?.addEventListener('click', () => startList(mastery.s3.list));
    app.view.querySelector('[data-start="all"]').addEventListener('click', () => startList(all));
    app.view.querySelector('[data-start="essay"]')?.addEventListener('click', () => startList(essays));
    app.view.querySelector('[data-start="undone"]').addEventListener('click', () => startList(undone));
    app.view.querySelector('[data-start="print-one"]').addEventListener('click', () => openPrintSheet(data, [point], `${data.label} · ${point.name}（通关专练卷）`));
    app.view.querySelector('[data-mark-one]').addEventListener('change', e => { const set = readMarked(); if (e.target.checked) set.add(point.id); else set.delete(point.id); saveMarked(set); });
    app.view.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => { state.point = b.dataset.goto; void render(); }));
  }

  function semesterForStage(idx, stage) {
    const subj = idx.subjects.find(s => s.key === state.subject) || idx.subjects[0];
    return (subj.semesters.find(s => s.stage === stage && s.ready) || subj.semesters.find(s => s.ready) || subj.semesters[0]).key;
  }

  async function open(opts = {}) {
    const idx = await loadIndex().catch(() => null);
    if (!idx) { app.toast('知识点资料加载失败，请检查网络后重试。'); return; }
    if (opts.point && (!opts.subject || !opts.semester)) {
      outer: for (const s of idx.subjects || []) {
        for (const sem of s.semesters || []) {
          for (const ch of sem.chapters || []) {
            if ((ch.points || []).some(p => p.id === opts.point)) {
              opts = { ...opts, subject: s.key, semester: sem.key };
              break outer;
            }
          }
        }
      }
    }
    if (opts.subject) state.subject = opts.subject;
    if (opts.semester) state.semester = opts.semester;
    else if (opts.stage) state.semester = semesterForStage(idx, opts.stage);
    else if (!state.semester) state.semester = semesterForStage(idx, app.stage());
    if (opts.point) { state.point = opts.point; state.view = 'point'; } else if (opts.action || opts.stage || opts.semester) state.view = 'list';
    if (typeof opts.mask === 'boolean') reciteMaskOn = opts.mask;
    state.selecting = opts.action === 'mark';
    if (location.hash !== '#knowledge') history.replaceState(null, '', '#knowledge');
    const subjObj = idx.subjects.find(s => s.key === state.subject) || idx.subjects[0];
    if (!subjObj.semesters.some(s => s.key === state.semester)) state.semester = semesterForStage(idx, app.stage());
    const sem = subjObj.semesters.find(s => s.key === state.semester);
    if ((opts.action === 'quick' || opts.action === 'diag' || opts.action === 'weak') && sem?.ready) {
      try {
        const data = await loadSemester(state.subject, state.semester);
        if (opts.action === 'quick') { app.track?.('kp_quick_diag_start'); startList(quickDiagQuestions(data)); return; }
        if (opts.action === 'diag') { startList(diagQuestions(data)); return; }
        startList(weakQueue(data, weakPoints(data)), '薄弱知识点的题都做对了，可以再做一次快测检验。'); return;
      } catch (error) { app.toast(error.message); }
    }
    await render();
    app.view.querySelector('#kpTitle')?.focus({ preventScroll: true });
  }
  function leave() { renderRev++; if (location.hash === '#knowledge') history.replaceState(null, '', location.pathname + location.search); }

  // ---- 诊断交卷《孩子学情体检单》 ----
  function analyzeSession(queue, results) {
    const qMap = new Map((queue || []).map(q => [q.id, q]));
    const byKp = new Map();
    for (const [id, r] of results || []) {
      const q = qMap.get(id);
      if (!q?.kpId) continue;
      if (!byKp.has(q.kpId)) byKp.set(q.kpId, { id: q.kpId, name: q.kp || q.kpId, done: 0, right: 0, maxLevel: q.level || 1 });
      const item = byKp.get(q.kpId);
      item.done++;
      item.maxLevel = Math.max(item.maxLevel, q.level || 1);
      if (r?.correct) item.right++;
    }
    const tested = [...byKp.values()];
    const weak = tested.filter(x => x.right < x.done);
    const passed = tested.length - weak.length;
    const isQuick = (queue || []).some(q => q.kpQuickDiag);
    return { tested, weak, passed, isQuick };
  }
  function summaryRxHTML(queue, results) {
    const { tested, weak, passed, isQuick } = analyzeSession(queue, results);
    if (!tested.length) return '';
    const pct = Math.round((passed / tested.length) * 100);
    const barTone = pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'weak';
    const minGain = Math.min(35, weak.length * 4);
    const maxGain = Math.min(45, weak.length * 6);
    const rowsHtml = tested.slice(0, 8).map(x => {
      const ok = x.right === x.done;
      const badge = ok ? '<em class="kp-rx-tag ok">已过关</em>' : '<em class="kp-rx-tag weak">薄弱急补</em>';
      return `<div class="kp-rx-row ${ok ? 'is-ok' : 'is-weak'}">
        <span>${badge}<b>${esc(x.name)}</b><small>对 ${x.right}/${x.done}</small></span>
        <button class="btn" type="button" data-rx-point="${esc(x.id)}">${ok ? '看卡片' : '补漏洞 →'}</button>
      </div>`;
    }).join('');
    const planHtml = weak.length ? `
      <div class="kp-rx-plan">
        <h4>本周 3 天补缺清单</h4>
        <ol>
          <li><b>第 1 天：</b>点开标红的 ${Math.min(2, weak.length)} 个薄弱点，先读 2 分钟“易错红线卡片”，把基础+提高题全做对。</li>
          <li><b>第 2 天：</b>攻克同类拓展题与专题压轴解答大题，把每一步采分点练顺。</li>
          <li><b>第 3 天：</b>一键印出专属 A4 补缺卷在纸上限时验收，错题自动进入 1/3/7/14 天复习。</li>
        </ol>
      </div>` : '';
    const headline = weak.length
      ? `本次检测 <b>${tested.length}</b> 个知识点：掌握率 <b>${pct}%</b>，查出 <b>${weak.length}</b> 个薄弱漏洞（按下面 3 天清单补齐，预计可稳抓 <b>${minGain}～${maxGain} 分</b>）。`
      : `本次检测的 <b>${tested.length}</b> 个知识点全部过关（掌握率 100%）！建议直接挑战“专题与压轴”里的中考解答大题。`;
    const totals = totalSummaryCounts();
    const upsell = !app.hasAccess()
      ? `<div class="kp-rx-upsell"><span>已锁定薄弱点！完整版 <b>¥19.9 一次买断</b>（分享家长群可享 ¥14.9）：解锁${esc(totals.subjects)}全部 ${totals.pts} 个知识点与 59 大压轴模型、${totals.essays} 道解答大题＋无水印 A4 专属补缺卷无限打印（3 台设备共用）。</span><button class="btn primary" type="button" id="kpRxUnlock">开通完整版 ¥19.9</button></div>`
      : '';
    return `<div class="kp-rx">
      <div class="kp-rx-head"><span class="kp-badge">${isQuick ? '3 分钟快测报告' : '学情体检单'}</span><h3>孩子本次学情体检单</h3></div>
      <div class="kp-rx-meter" aria-label="本次知识点掌握率 ${pct}%">
        <div class="kp-rx-meter-bar"><i class="kp-rx-meter-fill ${barTone}" style="width:${Math.max(6, pct)}%"></i></div>
        <b>${pct}%</b><span>（过关 ${passed}/${tested.length}）</span>
      </div>
      <p class="kp-rx-lead">${headline}</p>
      <div class="kp-rx-list">${rowsHtml}</div>
      ${planHtml}
      <div class="kp-rx-actions">
        ${weak.length
          ? `<button class="btn primary" type="button" id="kpRxPractice">立即补这 ${weak.length} 个薄弱点</button><button class="btn" type="button" id="kpRxPrint">预览 / 打印专属 A4 补缺卷</button>`
          : '<button class="btn primary" type="button" id="kpRxSp">去挑战专题与压轴大题 →</button>'}
        <button class="btn" type="button" id="kpRxPoster">📸 保存《学情体检单》长图</button>
      </div>
      ${upsell}
    </div>`;
  }
  async function openRxPoster(queue, results) {
    const { tested, weak, passed } = analyzeSession(queue, results);
    if (!tested.length) return;
    app.track?.('kp_rx_poster');
    try {
      const qrFactory = await app.loadQrLib?.();
      const firstParts = (queue?.[0]?.kpId || '').split('-');
      const subjNames = { math: '数学', physics: '物理', chemistry: '化学' };
      const subjLabel = subjNames[firstParts[0]] || '数理化';
      const pct = Math.round((passed / tested.length) * 100);
      const url = new URL(location.pathname, location.origin);
      url.searchParams.set('from', 'rx-poster');
      const inv = document.querySelector('#referralPanel [data-ref-code]')?.textContent?.trim()
        || document.querySelector('#referralPanel code')?.textContent?.trim() || '';
      if (/^ALIX-[A-Z0-9]{8}$/i.test(inv)) url.searchParams.set('invite', inv.toUpperCase());

      const W = 750;
      const rows = tested.slice(0, 8);
      const H = 640 + rows.length * 56 + (weak.length ? 160 : 40);
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f4f2e8'; ctx.fillRect(0, 0, W, H);

      const grad = ctx.createLinearGradient(0, 0, W, 270);
      grad.addColorStop(0, '#0e352a'); grad.addColorStop(1, '#185443');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 270);
      ctx.fillStyle = '#b83b2a'; ctx.fillRect(0, 270, W, 6);

      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.font = '600 24px system-ui, -apple-system, sans-serif';
      ctx.fillText('爱丽克丝中考题库 · 孩子学情体检单', 46, 62);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '20px system-ui, -apple-system, sans-serif';
      ctx.fillText(new Date().toISOString().slice(0, 10), W - 165, 62);

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 34px system-ui, -apple-system, sans-serif';
      ctx.fillText(`${subjLabel}知识点摸底 · 掌握率 ${pct}%`, 46, 132);
      ctx.font = '500 23px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(`共测 ${tested.length} 个知识点 · 已过关 ${passed} 个 · 待补薄弱点 ${weak.length} 个`, 46, 178);

      // 掌握率进度条
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(46, 206, W - 92, 18);
      ctx.fillStyle = pct >= 80 ? '#4ade80' : pct >= 50 ? '#fbbf24' : '#f87171';
      ctx.fillRect(46, 206, Math.max(24, Math.round((W - 92) * pct / 100)), 18);

      // 逐点诊断卡片
      let y = 304;
      ctx.fillStyle = '#18362a';
      ctx.font = '700 24px system-ui, -apple-system, sans-serif';
      ctx.fillText('知识点诊断明细', 46, y);
      y += 22;
      for (const item of rows) {
        const ok = item.right === item.done;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(46, y, W - 92, 46);
        ctx.fillStyle = ok ? '#15803d' : '#b83b2a';
        ctx.fillRect(46, y, 6, 46);
        ctx.font = '700 18px system-ui, -apple-system, sans-serif';
        ctx.fillText(ok ? '过关' : '薄弱', 66, y + 30);
        ctx.fillStyle = '#1a2420';
        ctx.font = '500 21px system-ui, -apple-system, sans-serif';
        ctx.fillText(String(item.name).slice(0, 22), 126, y + 30);
        ctx.fillStyle = '#64748b';
        ctx.font = '20px system-ui, -apple-system, sans-serif';
        ctx.fillText(`${item.right}/${item.done}`, W - 110, y + 30);
        y += 56;
      }

      if (weak.length) {
        y += 10;
        ctx.fillStyle = '#fcfbf6';
        ctx.fillRect(46, y, W - 92, 134);
        ctx.strokeStyle = '#d5d3c8'; ctx.lineWidth = 2;
        ctx.strokeRect(46, y, W - 92, 134);
        ctx.fillStyle = '#18362a';
        ctx.font = '700 22px system-ui, -apple-system, sans-serif';
        ctx.fillText('本周 3 天补缺建议', 66, y + 34);
        ctx.fillStyle = '#334155';
        ctx.font = '20px system-ui, -apple-system, sans-serif';
        ctx.fillText(`Day 1：读标红薄弱点速记卡，把基础+提高题全做对`, 66, y + 68);
        ctx.fillText(`Day 2：攻克同类变式与中考压轴解答大题`, 66, y + 96);
        ctx.fillText(`Day 3：一键印出专属 A4 补缺卷在纸上限时验收`, 66, y + 122);
        y += 154;
      }

      // 底部二维码
      y += 24;
      if (qrFactory) {
        const qr = qrFactory(0, 'M');
        qr.addData(url.href); qr.make();
        const cnt = qr.getModuleCount();
        const qrSize = 156, cell = qrSize / cnt, qx = 54, qy = y;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(qx - 8, qy - 8, qrSize + 16, qrSize + 16);
        ctx.fillStyle = '#0f172a';
        for (let r = 0; r < cnt; r++) for (let c = 0; c < cnt; c++) {
          if (qr.isDark(r, c)) ctx.fillRect(qx + c * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
        }
      }
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 25px system-ui, -apple-system, sans-serif';
      ctx.fillText('长按识别二维码 · 3 分钟免费测弱项', 238, y + 48);
      ctx.fillStyle = '#475569';
      ctx.font = '21px system-ui, -apple-system, sans-serif';
      const totals = totalSummaryCounts();
      ctx.fillText(`数理化 ${totals.pts} 个知识点 · ${totals.essays} 道压轴大题`, 238, y + 88);
      ctx.fillText('一键打印教研风 A4 专属补缺卷', 238, y + 122);
      ctx.fillStyle = '#164e3f';
      ctx.font = '600 20px system-ui, -apple-system, sans-serif';
      ctx.fillText('网址：x4m.cc.cd', 238, y + 154);

      const dataUrl = canvas.toDataURL('image/png');
      const dlg = document.createElement('dialog');
      dlg.className = 'dialog kp-poster-dialog';
      dlg.innerHTML = `<div class="dialog-head"><h2>《孩子学情体检单》长图</h2><form method="dialog"><button class="btn text-button">关闭</button></form></div>
        <p class="muted" style="margin:0 0 10px">手机可长按图片直接保存发给家人或存相册，电脑可点下方按钮下载。</p>
        <img src="${dataUrl}" alt="孩子学情体检单长图" style="width:100%;height:auto;border-radius:10px;border:1px solid var(--line)" />
        <div class="dialog-actions" style="margin-top:12px"><a class="btn primary" href="${dataUrl}" download="学情体检单-${subjLabel}.png">下载长图 PNG</a></div>`;
      dlg.addEventListener('close', () => dlg.remove());
      document.body.appendChild(dlg);
      dlg.showModal();
    } catch {
      app.toast('生成体检单长图失败，请稍后重试。');
    }
  }
  function wireSummaryRx(root, queue, results) {
    const { weak, isQuick } = analyzeSession(queue, results);
    if (isQuick) app.track?.('kp_quick_diag_done');
    const firstParts = (queue?.[0]?.kpId || '').split('-');
    const subjKey = firstParts[0] || state.subject || 'math';
    const semKey = firstParts[1] || state.semester || '8a';
    root.querySelectorAll('[data-rx-point]').forEach(b => b.addEventListener('click', () => {
      const pid = b.dataset.rxPoint;
      const parts = pid.split('-');
      void open({ subject: parts[0] || subjKey, semester: parts[1] || semKey, point: pid });
    }));
    root.querySelector('#kpRxPractice')?.addEventListener('click', async () => {
      const data = await loadSemester(subjKey, semKey);
      const idSet = new Set(weak.map(x => x.id));
      const pts = [];
      for (const c of data.chapters) for (const p of c.points) if (idSet.has(p.id)) pts.push(p);
      startList(weakQueue(data, pts), '这些薄弱点的题目都已做对。');
    });
    root.querySelector('#kpRxPrint')?.addEventListener('click', async () => {
      const data = await loadSemester(subjKey, semKey);
      const idSet = new Set(weak.map(x => x.id));
      const pts = [];
      for (const c of data.chapters) for (const p of c.points) if (idSet.has(p.id)) pts.push(p);
      openPrintSheet(data, pts, `${data.label} · 本次诊断薄弱知识点补缺卷`);
    });
    root.querySelector('#kpRxSp')?.addEventListener('click', () => { void open({ subject: subjKey, semester: 'sp' }); });
    root.querySelector('#kpRxPoster')?.addEventListener('click', () => { void openRxPoster(queue, results); });
    root.querySelector('#kpRxUnlock')?.addEventListener('click', () => {
      const totals = totalSummaryCounts();
      app.unlock(`开通完整版（¥19.9 一次买断），解锁全部薄弱点分层题、${totals.essays} 道数理化解答大题与无水印 A4 补缺卷无限打印。`);
    });
  }

  // ---- 错题本「换一道同类变式题验证」：根据 kpId / kp-* ID 找出同知识点的另一道题 ----
  async function findVariantQuestions(q, progress = app.progress()) {
    let kpId = q?.kpId || '';
    if (!kpId && String(q?.id || '').startsWith('kp-')) {
      const parts = String(q.id).split('-');
      if (parts.length >= 4) kpId = `${parts[1]}-${parts[2]}-${parts[3]}`;
    }
    if (!kpId) return { candidates: [], kpName: '' };
    const parts = kpId.split('-');
    if (parts.length < 3) return { candidates: [], kpName: '' };
    const [subjKey, semKey] = parts;
    const data = await loadSemester(subjKey, semKey).catch(() => null);
    if (!data) return { candidates: [], kpName: '' };
    let point = null;
    for (const c of data.chapters || []) {
      for (const p of c.points || []) {
        if (p.id === kpId) { point = p; break; }
      }
      if (point) break;
    }
    if (!point) return { candidates: [], kpName: '' };
    const byId = new Map((data.questions || []).map(item => [item.id, item]));
    const others = [...(point.qids || []), ...(point.refs || [])]
      .map(id => byId.get(id))
      .filter(cand => cand && cand.id !== q.id && cand.stem !== q.stem);
    const scoreOf = cand => {
      const r = progress?.banks?.[cand.id];
      let s = 0;
      if (!r?.done) s += 30;
      else if (!r.correct) s += 16;
      if (q.type !== 'essay' && cand.type !== 'essay') s += 12;
      if (cand.type === q.type) s += 6;
      if (cand.level && q.level && cand.level === q.level) s += 5;
      return s + Math.random() * 4;
    };
    return {
      candidates: others.sort((a, b) => scoreOf(b) - scoreOf(a)),
      kpName: point.name,
    };
  }

  // ---- 🔥 「考前 7 天急救包」（每天 15 分钟 · 打卡独立存入 xiaosimen-sprint7-v1） ----
  const SPRINT7_KEY = 'xiaosimen-sprint7-v1';
  function readSprint7All() {
    try {
      const v = JSON.parse(localStorage.getItem(SPRINT7_KEY) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch { return {}; }
  }
  function readSprint7(stage) {
    const all = readSprint7All();
    const cur = all[stage];
    return cur && typeof cur === 'object' ? cur : {};
  }
  function saveSprint7(stage, map) {
    try {
      const all = readSprint7All();
      all[stage] = map;
      localStorage.setItem(SPRINT7_KEY, JSON.stringify(all));
    } catch { /* 隐私模式 */ }
  }
  async function openSprint7(stage) {
    const idx = await loadIndex().catch(() => null);
    if (!idx) { app.toast('知识点资料加载失败，请检查网络后重试。'); return; }
    app.track?.('x4m_sprint7_open');
    const progress = app.progress();
    const marked = readMarked();
    const stageLabel = app.stageLabel?.() || '当前学期';

    // 收集当前学期（跨数理化可用学科）的全部知识点，按薄弱度 + 高频度排序
    const pool = [];
    const essayPool = [];
    const spEssayPool = [];
    for (const subj of idx.subjects || []) {
      const sem = subj.semesters?.find(s => s.stage === stage && s.ready);
      if (sem) {
        for (const ch of sem.chapters || []) {
          for (const p of ch.points || []) {
            const st = pointStatus(p.ids || [], progress, marked, p.id);
            const hasWrong = (p.ids || []).some(id => progress.banks?.[id]?.wrong);
            const isWeak = hasWrong || st.key === 'weak' || st.key === 'shaky' || marked.has(p.id);
            let score = 0;
            if (hasWrong) score += 140;
            if (marked.has(p.id)) score += 110;
            if (st.key === 'weak') score += 90;
            else if (st.key === 'shaky') score += 60;
            if (String(p.tag || '').includes('★')) score += 30;
            if (p.hasEssay) score += 22;
            if (p.hasDeep) score += 12;
            const item = {
              subject: subj.key, subjectLabel: subj.label,
              semester: sem.key, semLabel: sem.label,
              chapter: ch.name, id: p.id, name: p.name,
              tag: p.tag || '', hasEssay: !!p.hasEssay, hasDeep: !!p.hasDeep,
              isWeak, score,
            };
            pool.push(item);
            if (p.hasEssay) essayPool.push(item);
          }
        }
      }
      const spSem = subj.semesters?.find(s => s.key === 'sp' && s.ready);
      if (spSem) {
        for (const ch of spSem.chapters || []) {
          for (const p of ch.points || []) {
            if (!p.hasEssay) continue;
            spEssayPool.push({
              subject: subj.key, subjectLabel: subj.label,
              semester: 'sp', semLabel: spSem.label,
              chapter: ch.name, id: p.id, name: p.name,
              tag: p.tag || '', hasEssay: true, hasDeep: !!p.hasDeep,
              isWeak: marked.has(p.id), score: (marked.has(p.id) ? 100 : 0) + (String(p.tag || '').includes('★') ? 20 : 0),
            });
          }
        }
      }
    }
    pool.sort((a, b) => b.score - a.score);
    essayPool.sort((a, b) => b.score - a.score);
    spEssayPool.sort((a, b) => b.score - a.score);

    // Day 2–4：每天 2 个核心点（共 6 个），优先薄弱/错题点，不足用高频核心点补齐
    const core6 = pool.slice(0, 6);
    const day2Pts = core6.slice(0, 2);
    const day3Pts = core6.slice(2, 4);
    const day4Pts = core6.slice(4, 6);
    const day6Essays = (essayPool.length >= 2 ? essayPool : [...essayPool, ...spEssayPool]).slice(0, 2);
    const day7Pt = core6[0] || pool[0] || null;
    const wrongCount = Object.values(progress.banks || {}).filter(r => r && r.wrong).length;

    const ptRowsHTML = (pts, btnText = '去学微课 →') => pts.length
      ? `<div class="kp-s7-pts">${pts.map(p => `
        <div class="kp-s7-pt">
          <span><em class="kp-s7-badge ${p.isWeak ? 'is-weak' : ''}">${p.isWeak ? '薄弱急补' : esc(p.subjectLabel + '核心')}</em><b>${esc(p.name)}</b><small>${esc(p.subjectLabel)} · ${esc(p.chapter)}</small></span>
          <button type="button" class="btn" data-s7-open="${esc(p.subject)}|${esc(p.semester)}|${esc(p.id)}">${btnText}</button>
        </div>`).join('')}</div>`
      : '<p class="muted" style="margin:6px 0 0;font-size:13px">本学期知识点已准备就绪，可点上方学科目录自由挑选。</p>';

    const days = [
      {
        key: 'd1', day: 'Day 1', title: '3 分钟快测摸底 + 锁定前 3 个薄弱点',
        desc: '先用 8 道阶梯题快速诊断，拿到《孩子学情体检单》，把最容易丢分的 3 个点标出来。',
        body: `<div class="kp-s7-actions"><button type="button" class="btn primary" data-s7-act="quick">开始 3 分钟快测 →</button></div>`,
      },
      {
        key: 'd2', day: 'Day 2', title: '攻克 2 个高频核心知识点（第 1 组）',
        desc: '读 2 分钟考点卡 + 刷通第 1、2 关，把基础分和拉分变式稳稳装进口袋。',
        body: ptRowsHTML(day2Pts),
      },
      {
        key: 'd3', day: 'Day 3', title: '攻克 2 个高频核心知识点（第 2 组）',
        desc: '重点看「防错红线」与母题拆解，做对后再换一道变式题防背答案。',
        body: ptRowsHTML(day3Pts),
      },
      {
        key: 'd4', day: 'Day 4', title: '攻克 2 个高频核心知识点（第 3 组）',
        desc: '补齐剩余高频考点，争取把 6 个核心点全部点亮三星。',
        body: ptRowsHTML(day4Pts),
      },
      {
        key: 'd5', day: 'Day 5', title: '集中清零错题本 + 一键印出《A4 错题重做卷》',
        desc: wrongCount
          ? `当前错题本还有 ${wrongCount} 道待清零，手机重做一遍或印成 A4 卷在纸上限时过关。`
          : '错题本目前很干净！可以印一份「全部曾错题」做考前二次防复发验收。',
        body: `<div class="kp-s7-actions"><button type="button" class="btn primary" data-s7-act="wrong">去清错题本</button><button type="button" class="btn" data-s7-act="wrong-print">🖨️ 印 A4 错题重做卷</button></div>`,
      },
      {
        key: 'd6', day: 'Day 6', title: '挑 2 道规范解答大题练分步采分点',
        desc: '考前不用题海，亲手写完 2 道规范大题、对照采分点自评，确保大题步骤分一分不丢。',
        body: ptRowsHTML(day6Essays, '练解答大题 →'),
      },
      {
        key: 'd7', day: 'Day 7', title: '考前防错红线速览（背诵遮罩过一遍）+ 轻松上考场',
        desc: '开启「背诵遮罩」把核心公式与易错红线默背一遍，早睡养足精神，稳稳发挥！',
        body: day7Pt
          ? `<div class="kp-s7-actions"><button type="button" class="btn primary" data-s7-mask="${esc(day7Pt.subject)}|${esc(day7Pt.semester)}|${esc(day7Pt.id)}">👁️ 开启遮罩速览红线 →</button></div>`
          : '',
      },
    ];

    const checks = readSprint7(stage);
    const old = document.getElementById('kpSprint7Dialog');
    if (old) old.remove();
    const dlg = document.createElement('dialog');
    dlg.id = 'kpSprint7Dialog';
    dlg.className = 'dialog kp-sprint-dialog';
    const doneCount = () => days.filter(d => checks[d.key]).length;
    const renderProgress = () => {
      const n = doneCount();
      const pct = Math.round((n / 7) * 100);
      const txt = dlg.querySelector('#s7ProgText');
      const bar = dlg.querySelector('#s7ProgFill');
      if (txt) txt.textContent = `已完成 ${n} / 7 天${n === 7 ? ' 🎉 考前急救全部通关！' : ''}`;
      if (bar) bar.style.width = `${pct}%`;
    };
    dlg.innerHTML = `
      <div class="dialog-head">
        <h2>🔥 考前 7 天急救包 · ${esc(stageLabel)}</h2>
        <form method="dialog"><button class="btn text-button">关闭</button></form>
      </div>
      <p class="muted" style="margin:0 0 10px">每天只需 15 分钟 · 已结合孩子当前的薄弱点与${esc(stageLabel)}高频考点自动排期，完成一天勾一天。</p>
      <div class="kp-s7-prog">
        <div class="kp-s7-prog-row"><b id="s7ProgText"></b><button type="button" class="btn text-button" id="s7ResetBtn">重置打卡</button></div>
        <div class="kp-s7-bar"><i id="s7ProgFill"></i></div>
      </div>
      <ol class="kp-s7-list">
        ${days.map(d => `
          <li class="kp-s7-item ${checks[d.key] ? 'is-done' : ''}" data-s7-row="${d.key}">
            <label class="kp-s7-check-head">
              <input type="checkbox" data-s7-day="${d.key}" ${checks[d.key] ? 'checked' : ''}>
              <span class="kp-s7-day-pill">${d.day}</span>
              <b>${esc(d.title)}</b>
            </label>
            <p class="kp-s7-desc">${esc(d.desc)}</p>
            ${d.body}
          </li>`).join('')}
      </ol>`;
    dlg.addEventListener('close', () => dlg.remove());
    document.body.appendChild(dlg);
    renderProgress();

    dlg.querySelectorAll('[data-s7-day]').forEach(box => box.addEventListener('change', () => {
      const k = box.dataset.s7Day;
      checks[k] = box.checked;
      saveSprint7(stage, checks);
      dlg.querySelector(`[data-s7-row="${k}"]`)?.classList.toggle('is-done', box.checked);
      renderProgress();
    }));
    dlg.querySelector('#s7ResetBtn')?.addEventListener('click', () => {
      for (const d of days) checks[d.key] = false;
      saveSprint7(stage, checks);
      dlg.querySelectorAll('[data-s7-day]').forEach(b => { b.checked = false; });
      dlg.querySelectorAll('[data-s7-row]').forEach(r => r.classList.remove('is-done'));
      renderProgress();
      app.toast('已重置 7 天急救包打卡。');
    });
    dlg.querySelectorAll('[data-s7-open]').forEach(btn => btn.addEventListener('click', () => {
      const [subjKey, semKey, ptId] = btn.dataset.s7Open.split('|');
      dlg.close();
      void open({ subject: subjKey, semester: semKey, point: ptId });
    }));
    dlg.querySelectorAll('[data-s7-mask]').forEach(btn => btn.addEventListener('click', () => {
      const [subjKey, semKey, ptId] = btn.dataset.s7Mask.split('|');
      dlg.close();
      void open({ subject: subjKey, semester: semKey, point: ptId, mask: true });
    }));
    dlg.querySelectorAll('[data-s7-act]').forEach(btn => btn.addEventListener('click', () => {
      const act = btn.dataset.s7Act;
      dlg.close();
      if (act === 'quick') void open({ stage, action: 'quick' });
      else if (act === 'wrong') void app.startWrongMode?.('wrong');
      else if (act === 'wrong-print') void app.openWrongPrint?.(wrongCount ? 'wrong' : 'everWrong');
    }));
    dlg.showModal();
  }

  function refresh() {
    if (location.hash === '#knowledge' && !document.body.classList.contains('practice')) void render();
  }
  window.KnowledgeHub = { attach: options => { app = options; }, open, leave, refresh, loadIndex, searchPoints, findVariantQuestions, openSprint7, homeCardHTML, wireHome, summaryRxHTML, wireSummaryRx, previewSampleSheet };
})();
