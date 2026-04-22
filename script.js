/* =========================================================
   奇美醫院深耕計畫新聞報 — 前端腳本
   功能：載入 news.json、依週分類、下拉選擇、卡片渲染
   ========================================================= */

const state = {
  articles: [],
  weeks: [],            // [{ key, label, start, end, articles: [] }]
  currentWeekKey: null,
  searchQuery: ''
};

// ------------------- 工具：週次計算 -------------------
// 以「週一」為一週起始（ISO 週）
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();                  // 0=Sun, 1=Mon, ... 6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // 移到週一
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

function weekKey(date) {
  const start = getWeekStart(date);
  return formatDate(start).replace(/\//g, '-'); // YYYY-MM-DD of Monday
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
    // cache busting：避免 CDN 抓到舊 JSON
    const res = await fetch(`data/news.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.articles = (data.articles || [])
      .filter(a => a.published_at)
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

    document.getElementById('last-updated').textContent =
      `最後更新：${formatDate(data.updated_at || new Date())}`;
    document.getElementById('article-count').textContent =
      `新聞數：${state.articles.length}`;

    groupByWeek();
    renderWeekSelector();
    if (state.weeks.length > 0) {
      selectWeek(state.weeks[0].key); // 預設最新週
    } else {
      renderCards([]);
    }
  } catch (err) {
    console.error('載入新聞失敗', err);
    document.getElementById('cards').innerHTML =
      `<div class="loading" style="color: #c62828;">載入失敗：${err.message}</div>`;
  }
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
      map.set(key, {
        key, start, end,
        label: weekLabel(start),
        articles: []
      });
    }
    map.get(key).articles.push(article);
  });

  state.weeks = Array.from(map.values())
    .sort((a, b) => b.start - a.start);

  // 每週內再依發佈日期新→舊
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

// ------------------- 搜尋過濾 -------------------
function applyFilters(baseArticles) {
  const q = state.searchQuery.trim().toLowerCase();
  let list = baseArticles;
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

  return `
    <article class="card">
      <div class="card-cover">${cover}</div>
      <div class="card-body">
        <div class="card-meta">
          <span class="card-source">${source}</span>
          <span class="card-date">${date}</span>
        </div>
        <h3 class="card-title">${title}</h3>
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
  const week = state.weeks.find(w => w.key === state.currentWeekKey);
  if (week) applyFilters(week.articles);
});

// ------------------- 啟動 -------------------
loadNews();
