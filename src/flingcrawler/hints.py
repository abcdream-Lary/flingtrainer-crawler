"""廉价变更提示与增量目标规划。

设计目标：日常巡检不再全量重抓 757 个详情页，而是：

1. **列表页发现**（本就必需，代价低）→ 得到全站 slug 集合
2. **RSS/Atom feed**（1~2 个请求）→ 拿到最近更新的页面及其精确时间戳，
   只重抓「feed 时间 > 上次抓取时间」的页面
3. **新增 / 下架**：直接对 slug 集合做差集，无需抓取详情页即可判定
4. **轮询兜底**：feed 只覆盖最近 20 条；其余存量页面按
   「最久未抓优先」每天抽查固定预算，保证全站仍会被周期性覆盖

本模块只做解析与规划，不发起网络请求（feed 抓取由调用方传入 fetcher）。
"""

from __future__ import annotations

import logging
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from xml.etree import ElementTree as ET


def normalize_url(url: str) -> str:
    """归一化详情页 URL：去掉 utm 等跟踪参数、去掉锚点、统一以 / 结尾。"""
    p = urlsplit(url.strip())
    query = [(k, v) for k, v in parse_qsl(p.query) if not k.lower().startswith("utm_")]
    path = p.path.rstrip("/") + "/"
    return urlunsplit((p.scheme, p.netloc, path, urlencode(query), ""))


def _to_utc_iso(value: str) -> str:
    """把 RSS pubDate / Atom updated 归一为 UTC ISO 字符串（秒精度）。"""
    value = (value or "").strip()
    if not value:
        return ""
    try:  # RSS 2.0：RFC 822
        dt = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:  # Atom：ISO 8601
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def parse_feed(xml_text: str) -> dict[str, str]:
    """解析 RSS 2.0 / Atom feed，返回 {归一化 URL: UTC ISO 时间}。"""
    out: dict[str, str] = {}
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return out

    def localname(tag: str) -> str:
        return tag.rsplit("}", 1)[-1].lower()

    for node in root.iter():
        name = localname(node.tag)
        if name not in ("item", "entry"):
            continue
        link, when = "", ""
        for child in node:
            cname = localname(child.tag)
            if cname == "link":
                href = (child.get("href") or "").strip() or (child.text or "").strip()
                rel = (child.get("rel") or "alternate").lower()
                if href and (not link or rel == "alternate"):
                    link = href
            elif cname in ("pubdate", "published", "updated", "date"):
                when = (child.text or "").strip()
        if not link or not when:
            continue
        iso = _to_utc_iso(when)
        if not iso:
            continue
        url = normalize_url(link)
        if url:
            out[url] = iso
    return out


def fetch_feed_hints(fetcher, feed_urls: list[str], logger: logging.Logger) -> dict[str, str]:
    """抓取配置的 feed 并合并为 {URL: UTC ISO 时间}；单个 feed 失败不影响其余。"""
    hints: dict[str, str] = {}
    for url in feed_urls:
        try:
            resp = fetcher.get(url)
            if resp.status_code >= 400 or not resp.text:
                logger.warning("feed %s 返回 HTTP %s，跳过", url, resp.status_code)
                continue
            part = parse_feed(resp.text)
            logger.info("feed %s 提供 %d 条更新提示", url, len(part))
            for link, ts in part.items():
                prev = hints.get(link)
                if not prev or ts > prev:
                    hints[link] = ts
        except Exception as exc:  # noqa: BLE001 - feed 是可选增强，失败不应中断整轮
            logger.warning("feed %s 抓取失败：%s", url, exc)
    return hints


def plan_smart_targets(
    discovered: list[str],
    entries: dict,
    hints: dict[str, str],
    refresh_budget: int,
) -> dict:
    """规划本轮抓取目标（纯函数，便于测试）。

    返回 dict：
      new       —— 从未抓过 / 抓取未成功的新页面（全抓）
      hinted    —— feed 时间晚于上次抓取时间（内容有更新）
      refresh   —— 存量轮询兜底（最久未抓优先），数量 <= refresh_budget
      removed   —— 本轮发现集合中已消失的历史页面
      stats     —— 便于日志与运行摘要的计数
    """
    discovered_set = set(discovered)
    new_urls, hinted, refresh = [], [], []

    for url in discovered:
        meta = entries.get(url) or {}
        if meta.get("status") != "done":
            new_urls.append(url)
            continue
        hint_ts = hints.get(url)
        last_crawled = meta.get("last_crawled") or ""
        if hint_ts and hint_ts > last_crawled:
            hinted.append(url)
        else:
            refresh.append(url)

    refresh.sort(key=lambda u: (entries.get(u) or {}).get("last_crawled") or "")
    removed = [
        url for url, meta in entries.items()
        if (meta or {}).get("status") == "done" and url not in discovered_set
    ]

    budget = max(0, int(refresh_budget or 0))
    picked_refresh = refresh[:budget]
    return {
        "new": new_urls,
        "hinted": hinted,
        "refresh": picked_refresh,
        "removed": removed,
        "stats": {
            "new": len(new_urls),
            "hinted": len(hinted),
            "refresh": len(picked_refresh),
            "refresh_pending": max(0, len(refresh) - len(picked_refresh)),
            "removed": len(removed),
            "known": len(discovered) - len(new_urls),
        },
    }
