"""列表页/分页遍历，产出全部修改器详情页 URL。"""

from __future__ import annotations

import logging
import re
from typing import Iterable
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from ..fetcher import Fetcher


def _soup(html: str) -> BeautifulSoup:
    try:
        return BeautifulSoup(html, "lxml")
    except Exception:
        return BeautifulSoup(html, "html.parser")


def extract_detail_links(html: str, patterns: Iterable[str], base_url: str = "") -> list[str]:
    """从任意页面 HTML 中筛出详情页链接（去重、去锚点、保持出现顺序）。"""
    regexes = [re.compile(p) for p in patterns]
    soup = _soup(html)
    out: list[str] = []
    seen: set[str] = set()
    for tag in soup.find_all("a", href=True):
        href = tag["href"].split("#", 1)[0].strip()
        if not href:
            continue
        if base_url and not href.startswith("http"):
            href = urljoin(base_url, href)
        if not any(rx.match(href) for rx in regexes):
            continue
        # 归一化：统一以 / 结尾，避免同一页面出现两种形态
        parsed = urlparse(href)
        normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}/"
        if normalized in seen:
            continue
        seen.add(normalized)
        out.append(normalized)
    return out


def _fetch_listing(fetcher: Fetcher, url: str, logger: logging.Logger) -> tuple[int, str]:
    resp = fetcher.get(url)
    if resp.status_code == 404:
        return 404, ""
    if resp.status_code >= 400:
        logger.warning("列表页 %s 返回 HTTP %s", url, resp.status_code)
        return resp.status_code, ""
    return resp.status_code, resp.text or ""


def discover_detail_urls(fetcher: Fetcher, cfg, logger: logging.Logger) -> tuple[list[str], list[dict]]:
    """按配置模式遍历列表页。返回 (详情页 URL 列表, 列表页失败记录)。"""
    site = cfg.site
    listing = site.get("listing", {})
    patterns = site.get("detail_url_patterns", [])
    base_url = site.get("base_url", "").rstrip("/")
    mode = str(listing.get("mode", "both")).lower()

    urls: list[str] = []
    seen: set[str] = set()
    failures: list[dict] = []

    def merge(new_urls: list[str]) -> int:
        added = 0
        for u in new_urls:
            if u not in seen:
                seen.add(u)
                urls.append(u)
                added += 1
        return added

    # ---------- 来源一：/all-trainers/ 单页全量 ----------
    if mode in ("all_trainers", "both"):
        url = listing.get("all_trainers_url")
        if url:
            try:
                status, html = _fetch_listing(fetcher, url, logger)
                if html:
                    added = merge(extract_detail_links(html, patterns, base_url))
                    logger.info("来源 all-trainers：新增 %d 个详情页（累计 %d）", added, len(urls))
                else:
                    failures.append({"url": url, "stage": "listing", "error": f"HTTP {status}"})
            except Exception as exc:
                logger.error("来源 all-trainers 失败：%s", exc)
                failures.append({"url": url, "stage": "listing", "error": str(exc)})

    # ---------- 来源二：首页 /page/N/ 逐页翻 ----------
    if mode in ("paginated", "both"):
        tpl = listing.get("paginated_url", "")
        start = int(listing.get("start_page", 1) or 1)
        max_pages = int(listing.get("max_pages", 0) or 0)
        stop_after = int(listing.get("stop_after_empty_pages", 2) or 2)
        empty_streak = 0
        page = start
        while True:
            if max_pages and page > max_pages:
                break
            url = base_url + "/" if page <= 1 else tpl.format(page=page)
            try:
                status, html = _fetch_listing(fetcher, url, logger)
            except Exception as exc:
                logger.error("列表页 %s 抓取失败：%s", url, exc)
                failures.append({"url": url, "stage": "listing", "error": str(exc)})
                empty_streak += 1
                if empty_streak >= stop_after:
                    break
                page += 1
                continue

            if status == 404 or not html:
                logger.info("列表页 %s 无内容（HTTP %s），停止翻页", url, status)
                break
            added = merge(extract_detail_links(html, patterns, base_url))
            logger.info("列表页 %s：新增 %d（累计 %d）", url, added, len(urls))
            empty_streak = empty_streak + 1 if added == 0 else 0
            if empty_streak >= stop_after:
                logger.info("连续 %d 页无新链接，停止翻页", empty_streak)
                break
            page += 1

    logger.info("共发现 %d 个修改器详情页", len(urls))
    return urls, failures
