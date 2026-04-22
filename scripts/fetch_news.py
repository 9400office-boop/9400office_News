#\!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""奇美醫院深耕計畫新聞抓取 — 含自動標籤（4 範疇 ）"""
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

TPE = timezone(timedelta(hours=8))

KEYWORD_QUERIES = [
    '奇美醫院 深耕計畫',
    '奇美醫院深耕計畫',
    '奇美 深耕台南',
    '奇美醫院 健康台灣 深耕',
    '健康臺灣深耕計畫 奇美',
    '奇美醫療 深耕',
]

REQUIRED_ANY = ['奇美']
NEGATIVE_TERMS = ['股價', '股東', '證券', '股票', '漲停', '跌停',
                  '徵才', '求才', '職缺', '求職', '人力銀行', 'IPO']

# --- 4 大範疇（健康臺灣深耕計畫） ---
SCOPE_RULES = {
    '優化醫療工作條件': ['醫事人員', '工作條件', '護病比', '調薪', '薪資',
                          '勞動', '加班', '過勞', '人力短缺', '待遇', '退休金',
                          '招募', '尊嚴', '醫護'],
    '規劃多元人才培訓': ['培訓', '訓練', '研討會', '講座', '課程', '實習',
                          '進修', '國際交流', '聯盟共訓', '學術交流', '跨領域',
                          '聯合授課', '教學', '人才培育', '師資'],
    '導入智慧科技醫療': ['AI', '人工智慧', '智慧醫療', '智能', '機器人', '演算法',
                          '數位', '大數據', 'AIoT', '遠距醫療', '遠距',
                          '數位轉型', 'A+助理', '科技醫療', '雲端'],
    '社會責任醫療永續': ['ESG', '永續', '淨零', '碳排', '減碳', '綠色', '偏鄉',
                          '無牆', '深耕', '捐助', '公益', '環境', '社會責任',
                          '健康促進', '在地', '社區', 'SDGs', '醫療可近性'],
}

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / 'data' / 'news.json'


def google_news_rss_url(query, hl='zh-TW', gl='TW', ceid='TW:zh-Hant'):
    return f'https://news.google.com/rss/search?q={quote(query)}&hl={hl}&gl={gl}&ceid={ceid}'


def article_id(url, title):
    base = (url or '') + '|' + (title or '')
    return hashlib.md5(base.encode('utf-8')).hexdigest()[:16]


def clean_title(title):
    if not title:
        return ''
    parts = re.split(r'\s[-–—]\s', title)
    return parts[0].strip() if len(parts) > 1 else title.strip()


def extract_source(entry):
    try:
        if 'source' in entry and entry.source and entry.source.get('title'):
            return entry.source.title
    except Exception:
        pass
    m = re.search(r'[-–—]\s*([^-–—]+)$', entry.get('title', ''))
    return m.group(1).strip() if m else '未知來源'


def parse_pub_date(entry):
    if entry.get('published_parsed'):
        dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        return dt.astimezone(TPE).strftime('%Y-%m-%d')
    return None


def extract_summary(entry):
    raw = entry.get('summary', '') or entry.get('description', '')
    if not raw:
        return ''
    text = BeautifulSoup(raw, 'html.parser').get_text(' ', strip=True)
    return re.sub(r'\s+', ' ', text).strip()[:160]


def passes_filters(title, summary):
    blob = title + ' ' + summary
    if not any(tok in blob for tok in REQUIRED_ANY):
        return False
    if any(neg in blob for neg in NEGATIVE_TERMS):
        return False
    return True


def match_tags(text, rules):
    blob = text.lower()
    hit = []
    for tag, kws in rules.items():
        for kw in kws:
            if kw.lower() in blob:
                hit.append(tag)
                break
    return hit


def auto_tag(title, summary, manual_keywords=None):
    # 只匹配標題，避免 summary 裡順便提到的關鍵字被誤標
    # 例如企業捐款新聞在 summary 順便提了「智慧醫療」，不應被標為「導入智慧科技醫療」
    text = title or ''
    return {
        'scope': match_tags(text, SCOPE_RULES),
    }


def fetch_all():
    seen = {}
    for q in KEYWORD_QUERIES:
        print(f'  → 查詢：{q}')
        try:
            feed = feedparser.parse(google_news_rss_url(q))
        except Exception as e:
            print(f'    ✗ 失敗：{e}')
            continue

        for entry in feed.entries:
            title = clean_title(entry.get('title', ''))
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
                'id': aid, 'title': title, 'source': extract_source(entry),
                'url': link,
                'published_at': parse_pub_date(entry) or datetime.now(TPE).strftime('%Y-%m-%d'),
                'summary': summary, 'image_url': None, 'keywords': [q],
                'tags': auto_tag(title, summary, manual_keywords=[q]),
                'fetched_at': datetime.now(TPE).isoformat(timespec='seconds'),
            }
    return list(seen.values())


def load_existing():
    if DATA_PATH.exists():
        try:
            return json.load(DATA_PATH.open(encoding='utf-8'))
        except Exception:
            pass
    return {'updated_at': '', 'articles': []}


def ensure_tags(article):
    if 'tags' not in article or not isinstance(article.get('tags'), dict):
        article['tags'] = auto_tag(
            article.get('title', ''), article.get('summary', ''),
            manual_keywords=article.get('keywords') or []
        )
    return article


def merge(existing, new_items):
    existing_articles = [ensure_tags(a) for a in existing.get('articles', [])]
    by_id = {a['id']: a for a in existing_articles}
    added = 0
    for item in new_items:
        if item['id'] not in by_id:
            by_id[item['id']] = item
            added += 1
        elif not by_id[item['id']].get('tags'):
            by_id[item['id']]['tags'] = item['tags']
    merged = sorted(by_id.values(), key=lambda a: a.get('published_at', ''), reverse=True)
    return {
        'updated_at': datetime.now(TPE).isoformat(timespec='seconds'),
        'description': '奇美醫院深耕計畫新聞自動收錄。每日 08:00 與 22:00（台北時間）由 GitHub Actions 自動更新。',
        'taxonomy': {
            'scope': list(SCOPE_RULES.keys()),
        },
        'articles': merged,
        '_stats': {'total': len(merged), 'added_this_run': added},
    }


def main():
    print(f'\n=== 奇美深耕新聞抓取 @ {datetime.now(TPE).isoformat()} ===')
    print('\n[1/3] 從 Google News 抓取新聞…')
    fetched = fetch_all()
    print(f'    抓到 {len(fetched)} 則符合條件的新聞')

    print('\n[2/3] 合併並回填標籤…')
    merged = merge(load_existing(), fetched)

    print('\n[3/3] 寫回 data/news.json…')
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with DATA_PATH.open('w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    print(f'\n✓ 完成：{stats.get("total", 0)} 則，新增 {stats.get("added_this_run", 0)} 則')
    return 0


if __name__ == '__main__':
    sys.exit(main())
