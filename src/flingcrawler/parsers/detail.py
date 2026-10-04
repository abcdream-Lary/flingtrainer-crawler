"""详情页解析：游戏名 / 版本 / 更新日期 / 选项 / 截图 / 全部下载版本。

解析规则全部来自对真实页面的核对（2026-10）：
  * 标题        h1.post-title
  * 元信息行     正文首行文本： "44 Options · Game Version: v1.0-v1.0.20+ · Last Updated: 2025.10.17"
                （分隔符为 U+00B7）
  * 发布日期     div.post-details-day / -month / -year
  * 选项        <p style="padding-left: 40px;"> 内以 <br> 分隔；tooltip 注释在同段 <script> 中
  * 截图        div.entry 内 img[src*="/wp-content/uploads/"]（取 srcset 中最大尺寸）
  * 下载        div.download-attachments table.da-attachments-table 的每一行 = 一个历史版本

字段缺失一律留空并记入 missing_fields，绝不用推测值填充。
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup, NavigableString

from ..models import (
    DownloadItem,
    OptionItem,
    Screenshot,
    TrainerRecord,
    normalize_date,
    normalize_whitespace,
    parse_version_from_filename,
)

SEP = "\u00b7"  # 元信息行使用的分隔符 "·"

RE_OPTIONS_COUNT = re.compile(r"(\d+)\s*Options?\b", re.IGNORECASE)
RE_GAME_VERSION = re.compile(r"Game\s*Version\s*:\s*([^\n" + SEP + r"]+)", re.IGNORECASE)
RE_LAST_UPDATED = re.compile(
    r"Last\s*Updated\s*:\s*([0-9]{4}[.\-/][0-9]{1,2}[.\-/][0-9]{1,2}|[^\s\n" + SEP + r"]+)",
    re.IGNORECASE,
)
RE_TOOLTIP = re.compile(
    r"toolTips\(\s*['\"]\.(tooltip_post_id_custom_[A-Za-z0-9_]+)['\"]\s*,\s*'((?:[^'\\]|\\.)*)'",
    re.IGNORECASE,
)
# 区块划分用到的标题关键字与停止词
HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "strong", "b"]
OPTIONS_HEADINGS = {"options", "option", "options:", "trainer options", "cheat options", "options list"}
NOTES_HEADINGS = {"notes", "note", "note:", "instructions", "instruction", "how to use", "usage"}
RE_BAD_IMAGE = re.compile(r"(/plugins/|/images/ext/|tooltip-icon|avatar|logo|icon)", re.IGNORECASE)

MONTHS = {
    m: i
    for i, m in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1
    )
}


def _soup(html: str) -> BeautifulSoup:
    try:
        return BeautifulSoup(html, "lxml")
    except Exception:
        return BeautifulSoup(html, "html.parser")


def _slug_from_url(url: str) -> str:
    path = urlparse(url).path.strip("/")
    parts = [p for p in path.split("/") if p]
    return parts[-1] if parts else ""


def _build_tooltip_map(html: str) -> dict[str, str]:
    """把 tooltip 的补充说明抽出来，键为页面里的 custom id。"""
    notes: dict[str, str] = {}
    for tid, raw in RE_TOOLTIP.findall(html or ""):
        # JS 字符串里的转义统一还原（\. -> . 、\' -> ' 、\\ -> \）
        text = re.sub(r"\\(.)", r"\1", raw)
        text = re.sub(r"<br\s*/?>", " ", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", "", text)
        notes[tid] = normalize_whitespace(text)
    return notes


def _pick_image_url(img, base_url: str) -> str:
    """在 src / srcset 中挑最大尺寸，尽量拿原图。"""
    srcset = img.get("srcset") or ""
    best_url, best_w = "", -1
    for part in srcset.split(","):
        part = part.strip()
        if not part:
            continue
        bits = part.split()
        if not bits:
            continue
        candidate = bits[0]
        width = 0
        for token in bits[1:]:
            m = re.match(r"^(\d+)w$", token)
            if m:
                width = int(m.group(1))
        if width > best_w:
            best_w, best_url = width, candidate
    src = img.get("src") or img.get("data-src") or ""
    if not srcset or best_w < 0:
        return urljoin(base_url, src) if src else ""
    # srcset 里若没有比 src 更大的，就用 src（它通常就是原图）
    src_w = 0
    for part in srcset.split(","):
        bits = part.strip().split()
        if len(bits) >= 2 and bits[0] == src:
            m = re.match(r"^(\d+)w$", bits[1])
            if m:
                src_w = int(m.group(1))
    chosen = best_url if best_w > src_w else (src or best_url)
    return urljoin(base_url, chosen) if chosen else ""


def _walk_option_items(container, notes: dict[str, str]) -> list[OptionItem]:
    """按 <br> 切分条目，并把同段 tooltip 注释挂到对应条目上。"""
    raw: list[tuple[str, str]] = []
    buf: list[str] = []
    pending: list[str] = []

    def flush() -> None:
        text = normalize_whitespace(" ".join(buf))
        if text:
            note = ""
            for tid in pending:
                if notes.get(tid):
                    note = notes[tid]
                    break
            raw.append((text, note))
        buf.clear()
        pending.clear()

    def walk(node) -> None:
        for child in node.children:
            if isinstance(child, NavigableString):
                buf.append(str(child))
            elif getattr(child, "name", "") == "br":
                flush()
            elif getattr(child, "name", "") in ("script", "style"):
                continue
            else:
                for cls in child.get("class") or []:
                    if cls.startswith("tooltip_post_id_custom_"):
                        pending.append(cls)
                walk(child)

    walk(container)
    flush()
    return [OptionItem(index=i + 1, text=t, note=n) for i, (t, n) in enumerate(raw)]


def _find_heading(entry, keywords: set[str]):
    for tag in entry.find_all(HEADING_TAGS):
        text = normalize_whitespace(tag.get_text()).lower().strip()
        if text in keywords:
            return tag
    return None


def _is_leaf_container(el) -> bool:
    """只处理"叶子容器"，避免父 div 与子 p 重复计入。"""
    if el.name in ("ul", "ol"):
        return True
    if el.find(["p", "ul", "ol"]):  # 内部还有段落/列表，交给子元素处理
        return False
    if el.name == "div":
        return bool(el.find("br"))
    return True


def _is_download_region(el) -> bool:
    classes = el.get("class") or []
    if "download-attachments" in classes:
        return True
    return el.find_parent(class_="download-attachments") is not None


def _split_regions(entry) -> tuple[list, list, bool]:
    """把正文切成「选项区」和「说明区」。

    站点存在两种版式：
      * 新版：选项在 <p style="padding-left: 40px;"> 中，正文里有 <h6>Options</h6>
      * 旧版：选项就是普通 <p>，同样带 <h6>Options</h6>，其后还有 <h6>Notes</h6>
    返回 (选项区元素, 说明区元素, 是否命中 Options 标题)。
    """
    opt_heading = _find_heading(entry, OPTIONS_HEADINGS)
    note_heading = _find_heading(entry, NOTES_HEADINGS)

    option_els: list = []
    note_els: list = []
    started = False
    mode = "options"
    stopped = False

    for el in entry.find_all(["p", "div", "ul", "ol"] + HEADING_TAGS):
        if _is_download_region(el):
            stopped = True
            break
        if el is opt_heading:
            started = True
            mode = "options"
            continue
        if el is note_heading:
            mode = "notes"
            continue
        if el.name in HEADING_TAGS:
            text = normalize_whitespace(el.get_text()).lower()
            if any(w in text for w in NOTES_HEADINGS):
                mode = "notes"
            elif any(w in text for w in ("download", "update", "changelog", "troubleshoot")):
                stopped = True
            continue
        if not started or stopped or not _is_leaf_container(el):
            continue
        # 元信息行（含 Game Version / Last Updated）不是选项
        raw = normalize_whitespace(el.get_text(" "))
        if "Game Version" in raw or "Last Updated" in raw:
            continue
        (option_els if mode == "options" else note_els).append(el)

    return option_els, note_els, opt_heading is not None


def _legacy_option_containers(entry) -> list:
    """兜底（无 Options 标题的页面）：取带缩进的段落与列表项。"""
    containers: list = []
    for el in entry.find_all(["p", "div"]):
        if _is_download_region(el):
            continue
        style = (el.get("style") or "").replace(" ", "").lower()
        if "padding-left" in style and _is_leaf_container(el):
            if any(el is other or other in el.parents for other in containers):
                continue
            containers.append(el)
    for lst in entry.find_all(["ul", "ol"]):
        if not _is_download_region(lst):
            containers.append(lst)
    return containers


def _items_from_element(el, notes: dict[str, str]) -> list[OptionItem]:
    if el.name in ("ul", "ol"):
        items: list[OptionItem] = []
        for li in el.find_all("li", recursive=False):
            for bad in li.find_all(["script", "style"]):
                bad.decompose()
            text = normalize_whitespace(li.get_text(" "))
            if text:
                items.append(OptionItem(index=len(items) + 1, text=text, note=""))
        return items
    return _walk_option_items(el, notes)


def _extract_options(entry, notes: dict[str, str]) -> tuple[list[OptionItem], list[str]]:
    """返回 (选项条目, 说明文字)。"""
    option_els, note_els, has_heading = _split_regions(entry)
    if has_heading:
        containers = option_els
    else:
        containers = _legacy_option_containers(entry)
        note_els = []

    items: list[OptionItem] = []
    for container in containers:
        for item in _items_from_element(container, notes):
            item.index = len(items) + 1
            items.append(item)

    section_notes: list[str] = []
    for container in note_els:
        for item in _items_from_element(container, notes):
            if item.text:
                section_notes.append(item.text)
    return items, section_notes


def _extract_downloads(soup, entry, base_url: str) -> list[DownloadItem]:
    items: list[DownloadItem] = []
    table = soup.select_one("div.download-attachments table.da-attachments-table") or (
        entry.select_one("table.da-attachments-table") if entry else None
    )
    if table is not None:
        for idx, row in enumerate(table.select("tbody tr")):
            link = row.select_one("td.attachment-title a.attachment-link") or row.find("a", href=True)
            if link is None:
                continue
            file_name = (link.get("title") or "").strip() or link.get_text(strip=True)
            href = urljoin(base_url, link.get("href", ""))

            def cell(cls: str) -> str:
                node = row.select_one(f"td.{cls}")
                return normalize_whitespace(node.get_text()) if node else ""

            count_text = cell("attachment-downloads").replace(",", "")
            count = int(count_text) if count_text.isdigit() else None
            items.append(
                DownloadItem(
                    file_name=file_name,
                    version=parse_version_from_filename(file_name),
                    url=href,
                    date_added=cell("attachment-date"),
                    file_size=cell("attachment-size"),
                    download_count=count,
                    is_latest=(idx == 0),
                )
            )
    if not items and entry is not None:
        # 插件结构变化时的兜底：直接找 /downloads/ 链接
        for idx, link in enumerate(entry.find_all("a", href=True)):
            href = link["href"]
            if "/downloads/" not in href:
                continue
            name = (link.get("title") or "").strip() or link.get_text(strip=True)
            items.append(
                DownloadItem(
                    file_name=name,
                    version=parse_version_from_filename(name),
                    url=urljoin(base_url, href),
                    is_latest=(idx == 0),
                )
            )
    return items


def _extract_screenshots(entry, base_url: str, limit: int) -> list[Screenshot]:
    found: list[Screenshot] = []
    seen: set[str] = set()
    if entry is None:
        return found
    for img in entry.find_all("img"):
        if img.find_parent(class_="download-attachments"):
            continue
        url = _pick_image_url(img, base_url)
        if not url or url in seen:
            continue
        if "/wp-content/uploads/" not in url:
            continue
        if RE_BAD_IMAGE.search(url):
            continue
        seen.add(url)
        found.append(
            Screenshot(
                original_url=url,
                local_path="",
                alt=normalize_whitespace(img.get("alt") or ""),
                downloaded=False,
                bytes=0,
            )
        )
        if limit and len(found) >= limit:
            break
    return found


def parse_detail(html: str, url: str, base_url: str = "", max_screenshots: int = 0) -> tuple[TrainerRecord, list[str]]:
    """解析详情页。返回 (记录, 缺失字段列表)。"""
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    soup = _soup(html)
    base_url = base_url or f"{urlparse(url).scheme}://{urlparse(url).netloc}"

    rec = TrainerRecord(url=url, slug=_slug_from_url(url), last_crawled=now)
    missing: list[str] = []

    article = soup.select_one("article") or soup
    entry = soup.select_one("div.entry") or article

    # ---------------- 标题 ----------------
    title_node = soup.select_one("h1.post-title") or soup.find("h1")
    if title_node:
        rec.game_name = normalize_whitespace(title_node.get_text())
    if not rec.game_name:
        missing.append("game_name")

    # ---------------- 元信息行 ----------------
    for bad in entry.find_all(["script", "style", "noscript"]):
        bad.decompose()
    meta_text = entry.get_text("\n")

    m = RE_OPTIONS_COUNT.search(meta_text)
    if m:
        rec.options_count = int(m.group(1))
    else:
        missing.append("options_count")

    m = RE_GAME_VERSION.search(meta_text)
    if m:
        # 保留尾部 "+"（形如 v1.0-v1.0.20+ 表示"及以上"），它是原始文本的一部分
        rec.game_version = normalize_whitespace(m.group(1))
    else:
        missing.append("game_version")

    m = RE_LAST_UPDATED.search(meta_text)
    if m:
        rec.last_updated_raw = normalize_whitespace(m.group(1))
        rec.last_updated = normalize_date(rec.last_updated_raw)
    else:
        missing.append("last_updated")

    # ---------------- 发布日期 ----------------
    day = soup.select_one("div.post-details-day")
    month = soup.select_one("div.post-details-month")
    year = soup.select_one("div.post-details-year")
    if day and month and year:
        d, mo, y = (
            normalize_whitespace(day.get_text()),
            normalize_whitespace(month.get_text())[:3].lower(),
            normalize_whitespace(year.get_text()),
        )
        if d.isdigit() and y.isdigit() and mo in MONTHS:
            try:
                rec.published_date = datetime(int(y), MONTHS[mo], int(d)).date().isoformat()
            except ValueError:
                pass
    if not rec.published_date:
        missing.append("published_date")

    # ---------------- 分类 ----------------
    cats = [normalize_whitespace(a.get_text()) for a in soup.select("ul.post-meta li.post-category a")]
    rec.categories = [c for c in cats if c]

    # ---------------- 选项 / 说明 ----------------
    tooltip_notes = _build_tooltip_map(html)
    rec.options, rec.notes = _extract_options(entry, tooltip_notes)
    rec.options_extracted = len(rec.options)
    if not rec.options:
        missing.append("options")
    elif rec.options_count and rec.options_extracted != rec.options_count:
        # 提取数与页面声明数不一致（可能少，也可能混入小标题等非选项文本）。
        # 只做标记交由日志追踪，绝不裁剪或补全。
        missing.append("options_mismatch")

    # ---------------- 截图 ----------------
    rec.screenshots = _extract_screenshots(entry, base_url, max_screenshots)
    if not rec.screenshots:
        missing.append("screenshots")

    # ---------------- 下载（当前版本 + 全部历史版本） ----------------
    rec.downloads = _extract_downloads(soup, entry, base_url)
    if not rec.downloads:
        missing.append("downloads")

    rec.missing_fields = sorted(set(missing))
    rec.content_hash = rec.compute_content_hash()
    return rec, missing
