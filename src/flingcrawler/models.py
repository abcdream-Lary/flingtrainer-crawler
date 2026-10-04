"""数据模型：纯 dataclass，负责结构定义与序列化，不含任何抓取逻辑。

约定：所有字段缺失时留空（"" / None / []），并记入 missing_fields，绝不臆造。
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field, asdict
from typing import Any

SCHEMA_VERSION = "1.0"

# 版本片段形态：起始 vN；延续片段支持纯数字 N、连字符区间 0-v1、以及 0-Build.169652 这类
# "数字-字母数字" 组合（真实样本：...v1.0-Build.169652.Plus.12.Trainer-FLiNG）。
# 纯字母片段（Plus / Trainer）不匹配，正好作为版本区间的终止边界。
_TOKEN_VERSION_HEAD = re.compile(r"^v\d+$", re.IGNORECASE)
_TOKEN_VERSION_TAIL = re.compile(r"^(?:v?\d+|\d+-[A-Za-z]+\d*)\+?$", re.IGNORECASE)
_TOKEN_BARE_INT = re.compile(r"^\d+$")


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").replace("\u00a0", " ").strip()


def parse_version_from_filename(file_name: str) -> str:
    """从下载文件名里解析游戏版本号，解析不出则返回空串。

    真实样本：
      Black.Myth.Wukong.v1.0-v1.0.20.Plus.44.Trainer-FLiNG -> v1.0-v1.0.20
      Black.Myth.Wukong.v1.0.Plus.42.Trainer-FLiNG         -> v1.0
      Sunkenland.v1.0.7.Plus.21.Trainer-FLiNG              -> v1.0.7
    策略：以 '.' 切分后，找到首个形如 vN 的片段，向后吞掉连续的版本片段。
    """
    if not file_name:
        return ""
    stem = re.sub(r"\.(zip|rar|7z|exe)$", "", file_name, flags=re.IGNORECASE)
    tokens = stem.split(".")
    for i, tok in enumerate(tokens):
        if not _TOKEN_VERSION_HEAD.match(tok):
            continue
        collected = [tok]
        for nxt in tokens[i + 1 :]:
            if _TOKEN_VERSION_TAIL.match(nxt):
                collected.append(nxt)
            else:
                break
        # 形如 "...v1.2.3.50.Trainer-FLiNG" 的尾段是选项数量而非版本号，剥掉
        after_idx = i + len(collected)
        if (
            len(collected) > 1
            and _TOKEN_BARE_INT.match(collected[-1])
            and after_idx < len(tokens)
            and tokens[after_idx].lower().startswith("trainer")
        ):
            collected.pop()
        version = ".".join(collected).rstrip(".").strip()
        if version:
            return version
    return ""


def normalize_date(value: str) -> str:
    """把 2025.10.17 / 2025-10-17 / 17.10.2025 归一成 YYYY-MM-DD；无法识别则原样返回。"""
    if not value:
        return ""
    value = value.strip()
    m = re.match(r"^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$", value)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.match(r"^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$", value)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return value


@dataclass
class DownloadItem:
    """一个可下载文件（当前版本或归档中的历史版本）。"""

    file_name: str = ""
    version: str = ""
    url: str = ""
    date_added: str = ""
    file_size: str = ""
    download_count: int | None = None
    is_latest: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Screenshot:
    """一张截图。original_url 永远保留；local_path 为相对仓库根目录的路径。"""

    original_url: str = ""
    local_path: str = ""
    alt: str = ""
    downloaded: bool = False
    bytes: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class OptionItem:
    """一条选项/功能。text 为原始条目文本，note 为页面 tooltip 中的补充说明。"""

    index: int = 0
    text: str = ""
    note: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class TrainerRecord:
    url: str = ""
    slug: str = ""
    game_name: str = ""
    game_version: str = ""
    options_count: int | None = None  # 页面声明的选项数量
    options_extracted: int = 0  # 实际提取到的条目数量
    last_updated: str = ""  # YYYY-MM-DD
    last_updated_raw: str = ""
    published_date: str = ""
    categories: list[str] = field(default_factory=list)
    options: list[OptionItem] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)  # 页面 "Notes" 区块的补充说明
    screenshots: list[Screenshot] = field(default_factory=list)
    downloads: list[DownloadItem] = field(default_factory=list)
    missing_fields: list[str] = field(default_factory=list)
    content_hash: str = ""
    first_seen: str = ""
    last_crawled: str = ""
    http_status: int | None = None
    error: str = ""

    def to_dict(self) -> dict:
        return {
            "url": self.url,
            "slug": self.slug,
            "game_name": self.game_name,
            "game_version": self.game_version,
            "options_count": self.options_count,
            "options_extracted": self.options_extracted,
            "last_updated": self.last_updated,
            "last_updated_raw": self.last_updated_raw,
            "published_date": self.published_date,
            "categories": self.categories,
            "options": [o.to_dict() for o in self.options],
            "notes": self.notes,
            "screenshots": [s.to_dict() for s in self.screenshots],
            "downloads": [d.to_dict() for d in self.downloads],
            "missing_fields": self.missing_fields,
            "content_hash": self.content_hash,
            "first_seen": self.first_seen,
            "last_crawled": self.last_crawled,
            "http_status": self.http_status,
            "error": self.error,
        }

    def compute_content_hash(self) -> str:
        """基于已提取字段计算内容指纹，用于增量判断是否需要落库/写变更日志。

        注意：不含 last_crawled / local_path 这类与内容无关的运行态字段。
        """
        payload = {
            "game_name": self.game_name,
            "game_version": self.game_version,
            "options_count": self.options_count,
            "last_updated": self.last_updated,
            "published_date": self.published_date,
            "categories": self.categories,
            "options": [{"t": o.text, "n": o.note} for o in self.options],
            "notes": self.notes,
            "screenshots": [s.original_url for s in self.screenshots],
            "downloads": [
                {
                    "f": d.file_name,
                    "v": d.version,
                    "u": d.url,
                    "d": d.date_added,
                    "s": d.file_size,
                }
                for d in self.downloads
            ],
        }
        blob = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(blob.encode("utf-8")).hexdigest()

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TrainerRecord":
        rec = cls()
        rec.url = data.get("url", "")
        rec.slug = data.get("slug", "")
        rec.game_name = data.get("game_name", "")
        rec.game_version = data.get("game_version", "")
        rec.options_count = data.get("options_count")
        rec.options_extracted = data.get("options_extracted", 0)
        rec.last_updated = data.get("last_updated", "")
        rec.last_updated_raw = data.get("last_updated_raw", "")
        rec.published_date = data.get("published_date", "")
        rec.categories = list(data.get("categories") or [])
        rec.notes = list(data.get("notes") or [])
        rec.options = [
            OptionItem(index=o.get("index", i + 1), text=o.get("text", ""), note=o.get("note", ""))
            for i, o in enumerate(data.get("options") or [])
        ]
        rec.screenshots = [
            Screenshot(
                original_url=s.get("original_url", ""),
                local_path=s.get("local_path", ""),
                alt=s.get("alt", ""),
                downloaded=bool(s.get("downloaded", False)),
                bytes=s.get("bytes", 0),
            )
            for s in (data.get("screenshots") or [])
        ]
        rec.downloads = [
            DownloadItem(
                file_name=d.get("file_name", ""),
                version=d.get("version", ""),
                url=d.get("url", ""),
                date_added=d.get("date_added", ""),
                file_size=d.get("file_size", ""),
                download_count=d.get("download_count"),
                is_latest=bool(d.get("is_latest", False)),
            )
            for d in (data.get("downloads") or [])
        ]
        rec.missing_fields = list(data.get("missing_fields") or [])
        rec.content_hash = data.get("content_hash", "")
        rec.first_seen = data.get("first_seen", "")
        rec.last_crawled = data.get("last_crawled", "")
        rec.http_status = data.get("http_status")
        rec.error = data.get("error", "")
        return rec
