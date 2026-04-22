/* =========================================================
   奇美醫院深耕計畫新聞報 — 前端腳本
   功能：載入 news.json、依週分類、標籤篩選、卡片渲染
   ========================================================= */

const state = {
  articles: [],
  weeks: [],
  currentWeekKey: null,
  searchQuery: '',
  selectedTags: [],
  allTags: new Map()
};

// 標籤預設清單 - 根據新聞內容自動分類
const TAG_KEYWORDS = {
  '醫療科技': ['AI', '人工智慧', '智慧', '機器學習', '科技', '系統', '軟體', '資訊'],
  '健康促進': ['健康', '預防', '檢查', '篩檢', '養生', '運動', '飲食', '衛生'],
  '社區服務': ['社區', '義診', '衛教', '講座', '門診', '服務', '宣導', '活動'],
  '醫學教育': ['醫學', '教育', '研究', '論文', '學術', '訓練', '進修', '發表'],
  '臨床醫療': ['手術', '治療', '疾病', '患者', '病人', '醫師', '醫護', '臨床'],
  '醫院動態': ['醫院', '榮譽', '獲獎', '表揚', '新聞', '宣布', '啟用', '開設'],
  '國際交流': ['國際', '合作', '交流', '簽約', '姊妹', '訪問', '協議', '友誼'],
  '其他': []
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

function weekKey(date) {
  const start = getWeekStart(date);
  return formatDate(start).replace(/\//g, '-');
}

function weekLabel(start) {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const y = start.getFullYear();
  return `${y} · ${formatDate(start, { yearless: true })} – ${formatDate(end, { yearless: true })}`;
}

// ------------------- 標籤分類 -------------------
function classifyArticle(article) {
  const text = `${article.title || ''} ${article.summary || ''}`.toLowerCase();
  const tags = [];
  
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      tags.push(tag);
    }
  }
  
  return tags.length > 0 ? tags : ['其他'];
}

function buildTagsMap(articles) {
  state.allTags.clear();
  articles.forEach(article => {
    const tags = classifyArticle(article);
    tags.forEach(tag => {
      state.allTags.set(tag, (state.allTags.get(tag) || 0) + 1);
    });
  });
}

// ------------------- 標籤渲染 -------------------
function renderTags(articles) {
  buildTagsMap(articles);
  const container = document.getElementById('tags-container');
  
  if (state.allTags.size === 0) {
    container.innerHTML = '<span class="tag-placeholder">無標籤數據</span>';
    return;
  }

  const tagsHtml = Array.from(state.allTags.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => {
      const isActive = state.selectedTags.includes(tag);
      return `
        <button class="tag ${isActive ? 'active' : ''}" data-tag="${escapeHtml(tag)}">
          <span>${escapeHtml(tag)}</span>
          <span class="tag-count">${count}</span>
        </button>
      `;
    })
    .join('');

  const clearBtn = state.selectedTags.length > 0 
    ? `<button class="clear-tags">清除標籤</button>`
    : `<button class="clear-tags hidden">清除標籤</button>`;

  container.innerHTML = tagsHtml + clearBtn;

  document.querySelectorAll('.tag').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const tag = btn.dataset.tag;
      toggleTag(tag);
    });
  });

  document.querySelector('.clear-tags').addEventListener('click', () => {
    state.selectedTags = [];
    renderTags(articles);
    const week = state.weeks.find(w => w.key === state.currentWeekKey);
    if (week) applyFilters(week.articles);
  });
}

function toggleTag(tag) {
  const idx = state.selectedTags.indexOf(tag);
  if (idx > -1) {
    state.selectedTags.splice(idx, 1);
  } else {
    state.selectedTags.push(tag);
  }
  
  const week = state.weeks.find(w => w.key === state.currentWeekKey);
  if (week) {
    renderTags(week.articles);
    applyFilters(week.articles);
  }
}

// ------------------- 載入資料 -------------------
async function loadNews() {
  try {
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

// ------------------- 依週分類 -------------------
function groupByWeek() {
  const map = new Map();
  state.articles.forEach(article => {
    const d = new Date(article.published_at);
    const start = getWeekStart(d);
    const key = formatDate(start).replace(/\//g, '-');
    if (!map.has(key)) {
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
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
  state.selectedTags = [];
  const week = state.weeks.find(w => w.key === key);
  if (!week) {
    renderCards([]);
    return;
  }

  const summary = document.getElementById('week-summary');
  summary.innerHTML = `
    <strong>${week.label}</strong>
    <span class="badge">${week.articles.length} 則新聞</span>
    <span style="color: var(--text-muted); font-size: 13px;">
      （由新到舊排列，點擊卡片前往原始來源）
    </span>
  `;

  renderTags(week.articles);
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

  if (state.selectedTags.length > 0) {
    list = list.filter(article => {
      const tags = classifyArticle(article);
      return state.selectedTags.some(tag => tags.includes(tag));
    });
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

  const tags = classifyArticle(article);
  const tagsHtml = `
    <div class="card-tags">
      ${tags.map(tag => `<span class="card-tag">${escapeHtml(tag)}</span>`).join('')}
    </div>
  `;

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
        ${tagsHtml}
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
