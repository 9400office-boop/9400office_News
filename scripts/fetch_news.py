#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
奇美醫院深耕計畫新聞抓取腳本
-----------------------------------
資料來源：Google News RSS（免費、穩定、不需 API key）
排程：GitHub Actions，每日 00:00 UTC / 14:00 UTC
     （= 台北 08:00 / 22:00）

每次執行流程：
1. 以多組關鍵字查 Google News RSS
2. 解析 RSS → 結構化 article
3. 雜訊過濾（股市/徵才/無關）
4. 與現有 data/news.json 去重合併
5. 寫回 data/news.json

依賴：feedparser, beautifulsoup4, requests
"""

import json
import hashlib
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import quote

import feedparser
import requests
from bs4 import BeautifulSoup

# ------------------- 設定 -------------------

# 台北時區
TPE = timezone(timedelta(hours=8))

# Google News RSS 查詢語法：以台灣中文為主
KEYWORD_QUERIES = [
    '奇美醫院 深耕計畫',
    '奇美醫院深耕計畫',
    '奇美 深耕台南',
    '奇美醫院 健康台灣 深耕',
    '健康臺灣深耕計畫 奇美',
    '奇美醫療 深耕',
]

# 若新聞同時不包含這些字詞就過濾掉（正向門檻）
REQUIRED_ANY = ['奇美']

# 命中這些字就丟掉（負向過濾 — 徵才 / 股票 / 無關）
NEGATIVE_TERMS = [
    '股價', '股東', '證券', '股票', '漲停', '跌停',
    '徵才', '求才', '職缺', '求職', '人力銀行',
    '股價表現', 'IPO',
]

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / 'data' / 'news.json'


# ------------------- 工具 -------------------

def google_news_rss_url(query: str, hl='zh-TW', gl='TW', ceid='TW:zh-Hant') -> str:
    return (
        f'https://news.google.com/rss/search?q={quote(query)}'
        f'&hl={hl}&gl={gl}&ceid={ceid}'
    )


def article_id(url: str, title: str) -> str:
    """根據 url+title 做穩定 hash，避免重複收錄"""
    base = (url or '') + '|' + (title or '')
    return hashlib.md5(base.encode('utf-8')).hexdigest()[:16]


def clean_title(title: str) -> str:
    """Google News 標題常帶 ' - 來源名' 後綴，移掉"""
    if not title:
        return ''
    # 移除結尾的 " - xxx"（視為來源名，會在另一個欄位回填）
    parts = re.split(r'\s[-–—]\s', title)
    if len(parts) > 1:
        return parts[0].strip()
    return title.strip()


def extract_source(entry) -> str:
    # feedparser 把 Google News 的 source 放在 entry.source.title
    try:
        if 'source' in entry and entry.source and entry.source.get('title'):
            return entry.source.title
    except Exception:
        pass
    # 備援：從標題尾巴抓
    title = entry.get('title', '')
    m = re.search(r'[-–—]\s*([^-–—]+)$', title)
    if m:
        return m.group(1).strip()
    return '未知來源'


def parse_pub_date(entry) -> str | None:
    """回傳 YYYY-MM-DD（台北時間）"""
    if entry.get('published_parsed'):
        dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        dt_tpe = dt.astimezone(TPE)
        return dt_tpe.strftime('%Y-%m-%d')
    if entry.get('published'):
        try:
            dt = datetime.strptime(entry.published, '%a, %d %b %Y %H:%M:%S %Z')
            return dt.astimezone(TPE).strftime('%Y-%m-%d')
        except Exception:
            pass
    return None


def extract_summary(entry) -> str:
    """從 RSS summary 抽 120 字左右摘要。Google News 的 summary 是 HTML 片段。"""
    raw = entry.get('summary', '') or entry.get('description', '')
    if not raw:
        return ''
    soup = BeautifulSoup(raw, 'html.parser')
    text = soup.get_text(' ', strip=True)
    # 清理多餘空白
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:160]


def passes_filters(title: str, summary: str) -> bool:
    blob = (title + ' ' + summary)
    if not any(tok in blob for tok in REQUIRED_ANY):
        return False
    if any(neg in blob for neg in NEGATIVE_TERMS):
        return False
    return True


# ------------------- 主流程 -------------------

def fetch_all() -> list[dict]:
    """查所有關鍵字，回傳去重後的新聞清單"""
    seen = {}
    for q in KEYWORD_QUERIES:
        url = google_news_rss_url(q)
        print(f'  → 查詢：{q}')
        try:
            feed = feedparser.parse(url)
        except Exception as e:
            print(f'    ✗ 失敗：{e}')
            continue

        for entry in feed.entries:
            title_raw = entry.get('title', '')
            title = clean_title(title_raw)
            link = entry.get('link', '')
            if not title or not link:
                continue

            summary = extract_summary(entry)

            if not passes_filters(title, summary):
                continue

            aid = article_id(link, title)
            if aid in seen:
                continue

            seen[aid] = {
                'id': aid,
                'title': title,
                'source': extract_source(entry),
                'url': link,
                'published_at': parse_pub_date(entry) or datetime.now(TPE).strftime('%Y-%m-%d'),
                'summary': summary,
                'image_url': None,
                'keywords': [q],
                'fetched_at': datetime.now(TPE).isoformat(timespec='seconds'),
            }

    return list(seen.values())


def load_existing() -> dict:
    if DATA_PATH.exists():
        try:
            with DATA_PATH.open('r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f'  ✗ 讀取現有 news.json 失敗：{e}，將重建')
    return {'updated_at': '', 'articles': []}


def merge(existing: dict, new_items: list[dict]) -> dict:
    existing_articles = existing.get('articles', [])
    by_id = {a['id']: a for a in existing_articles}

    added = 0
    for item in new_items:
        if item['id'] not in by_id:
            by_id[item['id']] = item
            added += 1

    merged = list(by_id.values())
    # 依日期新→舊
    merged.sort(key=lambda a: a.get('published_at', ''), reverse=True)

    return {
        'updated_at': datetime.now(TPE).isoformat(timespec='seconds'),
        'description': '奇美醫院深耕計畫新聞自動收錄。每日 08:00 與 22:00（台北時間）由 GitHub Actions 自動更新。',
        'articles': merged,
        '_stats': {
            'total': len(merged),
            'added_this_run': added,
        }
    }


def main():
    print(f'\n=== 奇美深耕新聞抓取 @ {datetime.now(TPE).isoformat()} ===')

    print('\n[1/3] 從 Google News 抓取新聞…')
    fetched = fetch_all()
    print(f'    抓到 {len(fetched)} 則符合條件的新聞')

    print('\n[2/3] 與現有資料合併去重…')
    existing = load_existing()
    merged = merge(existing, fetched)

    print('\n[3/3] 寫回 data/news.json…')
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    # 去掉 _stats 前先取出，避免寫進檔案（也可保留，但前端不用）
    stats = merged.pop('_stats', {})
    with DATA_PATH.open('w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    print(f'\n✓ 完成：總共 {stats.get("total", 0)} 則，本次新增 {stats.get("added_this_run", 0)} 則')
    return 0


if __name__ == '__main__':
    sys.exit(main())
