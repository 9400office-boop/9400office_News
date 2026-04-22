# 奇美醫院深耕計畫新聞報

自動收錄「奇美醫院深耕計畫」相關新聞，以卡片式網頁呈現，依週分類。

- 🌐 **前端**：靜態 HTML + JS，託管於 GitHub Pages
- 🤖 **排程**：GitHub Actions，每日 **08:00 / 22:00（台北時間）** 自動抓取
- 📰 **資料來源**：Google News RSS（6 組關鍵字交叉查詢）

---

## 🗂️ 專案結構

```
chimei-shengeng-news/
├── .github/workflows/fetch-news.yml   # 排程 workflow
├── scripts/fetch_news.py              # Python 抓新聞腳本
├── data/news.json                     # 新聞資料（自動更新）
├── index.html                         # 新聞牆首頁
├── style.css                          # 樣式
├── script.js                          # 前端邏輯
├── requirements.txt                   # Python 依賴
└── README.md
```

---

## 🚀 一次性部署（約 5 分鐘）

### 步驟 1：建立 GitHub repo

在 GitHub 建一個 **public** 的 repo，名稱建議：`chimei-shengeng-news`。

### 步驟 2：把本資料夾推上去

```bash
cd chimei-shengeng-news
git init
git add .
git commit -m "init: chimei shengeng news site"
git branch -M main
git remote add origin https://github.com/<你的帳號>/chimei-shengeng-news.git
git push -u origin main
```

### 步驟 3：開啟 GitHub Pages

1. Repo → **Settings** → 左側 **Pages**
2. **Branch**：`main`，**Folder**：`/ (root)`
3. 儲存。幾分鐘後網址 `https://<帳號>.github.io/chimei-shengeng-news/` 即上線

### 步驟 4：允許 Actions 寫入（重要！）

1. Repo → **Settings** → 左側 **Actions** → **General**
2. 最下方 **Workflow permissions**：選 **Read and write permissions**
3. 儲存

### 步驟 5：驗證排程

1. Repo → **Actions** 分頁
2. 左側選 **Fetch Chimei Shengeng News**
3. 右上 **Run workflow** → 手動觸發一次，確認能跑成功
4. 之後每天 08:00 / 22:00 自動執行

✅ **完成！**

---

## 📝 常用操作

### 想立刻抓一次新聞
Repo → Actions → 選 workflow → **Run workflow**

### 想手動補歷史新聞
直接編輯 `data/news.json` 的 `articles` 陣列，欄位：

```json
{
  "id": "唯一 id",
  "title": "新聞標題",
  "source": "新聞來源",
  "url": "原文網址",
  "published_at": "YYYY-MM-DD",
  "summary": "120-160 字摘要",
  "image_url": null,
  "keywords": ["深耕計畫"],
  "fetched_at": "YYYY-MM-DDTHH:MM:SS+08:00"
}
```

推上去即可，前端會自動依 `published_at` 分週、新→舊排序。

### 想改關鍵字
編輯 `scripts/fetch_news.py` 的 `KEYWORD_QUERIES` list，推上去。

### 想改排程時間
編輯 `.github/workflows/fetch-news.yml` 的 `cron`。
GitHub Actions 用 **UTC** — 換算：台北時間 - 8 小時。
例如台北 09:30 = UTC 01:30 = `'30 1 * * *'`。

---

## 🎨 前端特點

- **卡片式排版**：RWD、自動 2/3 欄切換
- **週次下拉選單**：本週 / 上週 / N 週前
- **即時搜尋**：搜標題、來源、摘要
- **無封面圖 fallback**：漸層色塊＋標題文字（奇美醫院色系，5 種變體輪替）
- **「點擊前往觀看」** CTA 按鈕

---

## 🐞 疑難排解

| 症狀 | 解法 |
|------|------|
| 網頁空白 | 檢查 `data/news.json`：`python -m json.tool data/news.json` |
| Actions 被停用（60 天無活動） | Actions 頁按 **Enable** |
| 抓不到新資料 | 放寬 `scripts/fetch_news.py` 的關鍵字 |
| Actions commit 失敗 | Settings → Actions → Workflow permissions → **Read and write** |

---

## 📜 授權與責任

本站僅彙整公開新聞的「標題、摘要片段、原文連結」，不抓取全文，使用者點擊「前往觀看」到原始來源。請勿用於商業轉載。
