"""配置加载：YAML + 内置默认值 + 环境变量覆盖，代码里不出现硬编码站点参数。"""

from __future__ import annotations

import copy
import os
from pathlib import Path
from typing import Any

import yaml

DEFAULT_CONFIG: dict[str, Any] = {
    "site": {
        "base_url": "https://flingtrainer.com",
        "detail_url_patterns": [r"^https?://flingtrainer\.com/trainer/[A-Za-z0-9%\-_.]+/?$"],
        "listing": {
            "mode": "both",
            "all_trainers_url": "https://flingtrainer.com/all-trainers/",
            "paginated_url": "https://flingtrainer.com/page/{page}/",
            "start_page": 1,
            "max_pages": 0,
            "stop_after_empty_pages": 2,
        },
        "robots": {
            "respect": True,
            "user_agent_token": "*",
            "on_fetch_error": "disallow",
            "on_missing": "allow",
            "never_fetch_paths": ["/downloads/", "/attachments/"],
        },
    },
    "http": {
        "timeout": 30,
        "min_interval_seconds": 1.5,
        "max_interval_seconds": 3.0,
        "max_retries": 3,
        "backoff_factor": 2.0,
        "backoff_max_seconds": 60,
        "retry_statuses": [429, 500, 502, 503, 504],
        "honor_retry_after": True,
        "conditional_get": True,
        "user_agent": "flingtrainer-crawler/1.0",
        "headers": {},
    },
    "crawl": {
        "mode": "incremental",
        "skip_if_crawled_within_days": 0,
        "limit": 0,
        "only_slugs": [],
    },
    "media": {
        # 默认只采集图片 URL，不下载文件
        "download_screenshots": False,
        "max_screenshots_per_page": 5,
        "skip_existing_screenshots": True,
    },
    "output": {
        "root": "data",
        "json_dir": "data/json",
        "screenshots_dir": "data/screenshots",
        "logs_dir": "data/logs",
        "changelog_dir": "data/changelog",
        "state_dir": "data/state",
        "json_filename": "trainers",
    },
    "logging": {"level": "INFO", "to_file": True, "log_filename": "crawler.log"},
}


def _deep_merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


class Config:
    """带点号路径取值的配置容器，如 cfg.get("http.min_interval_seconds", 1.5)。"""

    def __init__(self, data: dict, source: str = ""):
        self._data = data
        self.source = source

    @property
    def raw(self) -> dict:
        return self._data

    def get(self, dotted: str, default: Any = None) -> Any:
        node: Any = self._data
        for part in dotted.split("."):
            if not isinstance(node, dict) or part not in node:
                return default
            node = node[part]
        return node

    def as_path(self, dotted: str, default: str = "") -> Path:
        return Path(self.get(dotted, default))

    # 常用片段的快捷访问
    @property
    def site(self) -> dict:
        return self.get("site", {})

    @property
    def http(self) -> dict:
        return self.get("http", {})

    @property
    def crawl(self) -> dict:
        return self.get("crawl", {})

    @property
    def media(self) -> dict:
        return self.get("media", {})

    @property
    def output(self) -> dict:
        return self.get("output", {})


def load_config(path: str | Path | None = None) -> Config:
    """加载配置。未指定路径时依次尝试 config/config.yaml、./config.yaml。"""
    candidates: list[Path] = []
    if path:
        candidates.append(Path(path))
    else:
        env_path = os.environ.get("FLINGCRAWLER_CONFIG")
        if env_path:
            candidates.append(Path(env_path))
        here = Path(__file__).resolve().parents[2]
        candidates += [here / "config" / "config.yaml", Path("config/config.yaml")]

    chosen = next((p for p in candidates if p.is_file()), None)
    if chosen is None:
        return Config(copy.deepcopy(DEFAULT_CONFIG), source="<defaults>")

    with chosen.open("r", encoding="utf-8") as fh:
        user_cfg = yaml.safe_load(fh) or {}
    merged = _deep_merge(DEFAULT_CONFIG, user_cfg)
    merged = _apply_env_overrides(merged)
    return Config(merged, source=str(chosen))


def _apply_env_overrides(data: dict) -> dict:
    """支持用环境变量覆盖少量高频参数，方便 CI 里不改动文件直接调参。"""
    mapping = {
        "FLING_CRAWL_MODE": "crawl.mode",
        "FLING_CRAWL_LIMIT": "crawl.limit",
        "FLING_MIN_INTERVAL": "http.min_interval_seconds",
        "FLING_USER_AGENT": "http.user_agent",
    }
    for env_key, dotted in mapping.items():
        value = os.environ.get(env_key)
        if value is None:
            continue
        parts = dotted.split(".")
        node = data
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        current = node.get(parts[-1])
        if isinstance(current, int):
            try:
                value = int(value)
            except ValueError:
                continue
        elif isinstance(current, float):
            try:
                value = float(value)
            except ValueError:
                continue
        node[parts[-1]] = value
    return data
