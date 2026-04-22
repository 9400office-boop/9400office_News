/* =========================================================
   奇美醫院深耕計畫新聞報 — 前端腳本
   功能：載入 news.json、依週分類、下拉選擇、卡片渲染、雙軸標籤篩選
   ========================================================= */

const state = {
  articles: [],
  weeks: [],
  currentWeekKey: null,
  searchQuery: '',
  taxonomy: { scope: [], category: [] },
  selectedTags: { scope: new Set(), category: new Set() }
};

// 預設分類表（若 news.json 未提供 taxonomy 時使用）
const DEFAULT_TAXONOMY = {
  scope: [
    '優化醫療工作條件',
    '規劃多元人才培訓',
    '導入智慧科技醫療',
    '社會責任醫療永續'
  ],
  category: [
    '智慧醫療',
    '兒童精神醫療／心理健康',
    '新興傳染病',
    '優化醫療、健保永續',
    '三高防治（糖尿病共同照護網）',
    '三高防治888計畫',
    '婦女醫療',
    '兒童健康',
    '優化營養、全齡健康',
    '社區營造',
    '全民運動健康促進'
  ]
};

// ------------------- 工具：週次計算 -------------------
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d, opts = {}) {
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  if (opts.yearless) return `${m}/${day}`;
  return `${y}/${m}/${day}`;
}

function weekLabel(start) {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const y = start.getFullYear();
  return `${y} · ${formatDate(start, { yearless: true })} – ${formatDate(end, { yearless: true })}`;
}

// ------------------- 載入資料 -------------------
async function loadNews() {
  try {
    const res = await fetch(`data/news.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.articles = (data.articles || [])
      .filter(a => a.published_at)
      .map(normalizeArticle)
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

    state.taxonomy = {
      scope: (data.taxonomy && data.taxonomy.scope) || DEFAULT_TAXONOMY.scope,
      category: (data.taxonomy && data.taxonomy.category) || DEFAULT_TAXONOMY.category
    };

    document.getElementById('last-updated').textContent =
      `最後更新：${formatDate(data.updated_at || new Date())}`;
    document.getElementById('article-count').textContent =
      `新聞數：${state.articles.length}`;

    groupByWeek();
    renderWeekSelector();
    renderFilterChips();
    if (state.weeks.length > 0) {
      selectWeek(state.weeks[0].key);
    } else {
      renderCards([]);
    }
  } catch (err) {
    console.error('載入新聞失敗', err);
    document.getElementById('cards').innerHTML =
      `<div class="loading" style="color: #c62828;">載入失敗：${err.message}</div>`;
  }
}

// ------------------- 文章格式正規化 -------------------
function normalizeArticle(a) {
  const tags = a.tags || {};
  return {
    ...a,
    tags: {
      scope: Array.isArray(tags.scope) ? tags.scope : [],
      category: Array.isArray(tags.category) ? tags.category : []
    }
  };
}

// ------------------- 篩選 chip 渲染 -------------------
function countTagOccurrences(axis) {
  const counts = new Map();
  state.articles.forEach(a => {
    (a.tags[axis] || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
  });
  return counts;
}

function renderFilterChips() {
  ['scope', 'category'].forEach(axis => {
    const container = document.getElementById(`${axis}-filters`);
    if (!container) return;
    const counts = countTagOccurrences(axis);
    const tags = state.taxonomy[axis] || [];

    container.innerHTML = tags.map(tag => {
      const c = counts.get(tag) || 0;
      const active = state.selectedTags[axis].has(tag) ? ' active' : '';
      const dimmed = c === 0 ? ' style="opacity:0.4;"' : '';
      return `<button type="button" class="chip${active}" data-axis="${axis}" data-tag="${escapeHtml(tag)}"${dimmed}>
        ${escapeHtml(tag)}<span class="chip-count">(${c})</span>
      </button>`;
    }).join('');

    container.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.tag;
        const set = state.selectedTags[axis];
        if (set.has(t)) set.delete(t); else set.add(t);
        renderFilterChips();
        refreshCurrentView();
      });
    });
  });
  updateFilterHint();
}

function updateFilterHint() {
  const s = state.selectedTags.scope.size;
  const c = state.selectedTags.category.size;
  const hint = document.getElementById('filter-hint');
  if (!hint) return;
  if (s === 0 && c === 0) {
    hint.textContent = '未套用篩選（顯示全部）';
    hint.classList.remove('active');
  } else {
    const parts = [];
    if (s > 0) parts.push(`範疇 ${s} 項`);
    if (c > 0) parts.push(`類別 ${c} 項`);
    hint.textContent = `已選：${parts.join('、')}（符合任一標籤即顯示）`;
    hint.classList.add('active');
  }
}

function clearAllFilters() {
  state.selectedTags.scope.clear();
  state.selectedTags.category.clear();
  renderFilterChips();
  refreshCurrentView();
}

function articleMatchesTags(article) {
  const sSel = state.selectedTags.scope;
  const cSel = state.selectedTags.category;
  const scopeOk = sSel.size === 0 ||
    (article.tags.scope || []).some(t => sSel.has(t));
  const catOk = cSel.size === 0 ||
    (article.tags.category || []).some(t => cSel.has(t));
  return scopeOk && catOk;
}

function refreshCurrentView() {
  const week = state.weeks.find(w => w.key === state.currentWeekKey);
  if (week) applyFilters(week.articles);
}

// ------------------- 依週分類 -------------------
function groupByWeek() {
  const map = new Map();
  state.articles.forEach(article => {
    const d = new Date(article.published_at);
    const start = getWeekStart(d);
    const key = formatDate(start).replace(/\//g, '-');
    if (!map.has(key)) {
      const end = new Date(start); end.setDate(end.getDate() + 6);
      map.set(key, { key, start, end, label: weekLabel(start), articles: [] });
    }
    map.get(key).articles.push(article);
  });

  state.weeks = Array.from(map.values()).sort((a, b) => b.start - a.start);
  state.weeks.forEach(w => {
    w.articles.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  });
}

// ------------------- 下拉選單 -------------------
function renderWeekSelector() {
  const sel = document.getElementById('week-select');
  if (state.weeks.length === 0) {
    sel.innerHTML = '<option value="">尚無資料</option>';
    return;
  }

  sel.innerHTML = state.weeks.map((w, i) => {
    const prefix = i === 0 ? '本週' : (i === 1 ? '上週' : `${i + 1} 週前`);
    return `<option value="${w.key}">${prefix}｜${w.label}（${w.articles.length} 則）</option>`;
  }).join('');

  sel.addEventListener('change', e => selectWeek(e.target.value));
}

// ------------------- 選擇週次 -------------------
function selectWeek(key) {
  state.currentWeekKey = key;
  const week = state.weeks.find(w => w.key === key);
  if (!week) { renderCards([]); return; }

  const summary = document.getElementById('week-summary');
  summary.innerHTML = `
    <strong>${week.label}</strong>
    <span class="badge">${week.articles.length} 則新聞</span>
    <span style="color: var(--text-muted); font-size: 13px;">
      （由新到舊排列，點擊卡片前往原始來源）
    </span>
  `;

  applyFilters(week.articles);
}

// ------------------- 搜尋 + 標籤過濾 -------------------
function applyFilters(baseArticles) {
  const q = state.searchQuery.trim().toLowerCase();
  let list = baseArticles.filter(articleMatchesTags);
  if (q) {
    list = list.filter(a =>
      (a.title || '').toLowerCase().includes(q) ||
      (a.source || '').toLowerCase().includes(q) ||
      (a.summary || '').toLowerCase().includes(q)
    );
  }
  renderCards(list);
}

// ------------------- 卡片渲染 -------------------
function renderCards(articles) {
  const container = document.getElementById('cards');
  const empty = document.getElementById('empty-state');

  if (articles.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    empty.classList.remove('hidden');
    return;
  }

  container.style.display = '';
  empty.classList.add('hidden');
  container.innerHTML = articles.map((a, idx) => cardHTML(a, idx)).join('');
}

function cardHTML(article, idx) {
  const variantNum = (hashStr(article.id || article.title) % 5) + 1;
  const title = escapeHtml(article.title || '未命名新聞');
  const source = escapeHtml(article.source || '未知來源');
  const date = formatDate(article.published_at);
  const summary = escapeHtml(article.summary || '（本則新聞暫無摘要）');
  const url = article.url || '#';

  const cover = article.image_url
    ? `<img src="${escapeHtml(article.image_url)}" alt="${title}" loading="lazy"
           onerror="this.parentElement.querySelector('.card-cover-fallback').style.display='grid';this.remove();">
       <div class="card-cover-fallback variant-${variantNum}" style="display:none;">
         <span>${shortenTitle(article.title)}</span>
       </div>
       <div class="card-cover-logo">奇美 · 深耕計畫</div>`
    : `<div class="card-cover-fallback variant-${variantNum}">
         <span>${shortenTitle(article.title)}</span>
       </div>
       <div class="card-cover-logo">奇美 · 深耕計畫</div>`;

  const scopeTags = (article.tags && article.tags.scope) || [];
  const catTags = (article.tags && article.tags.category) || [];
  const tagHTML = (scopeTags.length || catTags.length) ? `
    <div class="card-tags">
      ${scopeTags.map(t => `<span class="card-tag scope">${escapeHtml(t)}</span>`).join('')}
      ${catTags.map(t => `<span class="card-tag category">${escapeHtml(t)}</span>`).join('')}
    </div>` : '';

  return `
    <article class="card">
      <div class="card-cover">${cover}</div>
      <div class="card-body">
        <div class="card-meta">
          <span class="card-source">${source}</span>
          <span class="card-date">${date}</span>
        </div>
        <h3 class="card-title">${title}</h3>
        ${tagHTML}
        <p class="card-summary">${summary}</p>
        <a class="card-cta" href="${encodeURI(url)}" target="_blank" rel="noopener noreferrer">
          點擊前往觀看
        </a>
      </div>
    </article>
  `;
}

// ------------------- 小工具 -------------------
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function shortenTitle(t, n = 22) {
  if (!t) return '奇美醫院深耕計畫';
  if (t.length <= n) return escapeHtml(t);
  return escapeHtml(t.slice(0, n)) + '…';
}

// ------------------- 事件綁定 -------------------
document.getElementById('search-input').addEventListener('input', e => {
  state.searchQuery = e.target.value;
  refreshCurrentView();
});

const clearBtn = document.getElementById('clear-filters');
if (clearBtn) clearBtn.addEventListener('click', clearAllFilters);

// ------------------- 啟動 -------------------
loadNews();
