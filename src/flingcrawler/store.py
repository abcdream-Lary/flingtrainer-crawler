"""存储层：结构化 JSON 输出、截图落盘、状态与各类日志。

目录约定（全部可在 config.yaml 的 output 段调整）：
    data/json/          trainers.json / trainers.ndjson / index.json
    data/screenshots/   <slug>/<原文件名>
    data/logs/          failed.jsonl / failed_history.jsonl / missing_fields.jsonl / crawler.log
    data/changelog/     YYYY-MM-DD.jsonl + latest.json
    data/state/         state.json（断点续跑与条件请求缓存）
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from .models import SCHEMA_VERSION, TrainerRecord


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


class Store:
    def __init__(self, cfg, logger: logging.Logger | None = None):
        self.cfg = cfg
        self.log = logger or logging.getLogger("flingcrawler")
        self.root = Path.cwd()
        self.json_dir = cfg.as_path("output.json_dir", "data/json")
        self.shot_dir = cfg.as_path("output.screenshots_dir", "data/screenshots")
        self.log_dir = cfg.as_path("output.logs_dir", "data/logs")
        self.change_dir = cfg.as_path("output.changelog_dir", "data/changelog")
        self.state_dir = cfg.as_path("output.state_dir", "data/state")
        # 注意：截图目录不在初始化时创建 —— 只采集 URL 的模式下不应产生空目录，
        # 真正保存图片时由 save_screenshot() 按需创建。
        for d in (self.json_dir, self.log_dir, self.change_dir, self.state_dir):
            d.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ 路径
    @property
    def json_path(self) -> Path:
        return self.json_dir / f"{self.cfg.get('output.json_filename', 'trainers')}.json"

    @property
    def ndjson_path(self) -> Path:
        return self.json_dir / f"{self.cfg.get('output.json_filename', 'trainers')}.ndjson"

    @property
    def index_path(self) -> Path:
        return self.json_dir / "index.json"

    @property
    def state_path(self) -> Path:
        return self.state_dir / "state.json"

    @property
    def failed_path(self) -> Path:
        return self.log_dir / "failed.jsonl"

    @property
    def failed_history_path(self) -> Path:
        return self.log_dir / "failed_history.jsonl"

    @property
    def missing_path(self) -> Path:
        return self.log_dir / "missing_fields.jsonl"

    # ------------------------------------------------------------------ 读取
    def load_previous_records(self) -> dict[str, TrainerRecord]:
        prev: dict[str, TrainerRecord] = {}
        if self.ndjson_path.is_file():
            with self.ndjson_path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = TrainerRecord.from_dict(json.loads(line))
                    except Exception:
                        continue
                    if rec.url:
                        prev[rec.url] = rec
        elif self.json_path.is_file():
            try:
                data = json.loads(self.json_path.read_text(encoding="utf-8"))
                for item in data.get("records", data if isinstance(data, list) else []):
                    rec = TrainerRecord.from_dict(item)
                    if rec.url:
                        prev[rec.url] = rec
            except Exception as exc:
                self.log.warning("读取既有 JSON 失败：%s", exc)
        self.log.info("载入既有记录 %d 条", len(prev))
        return prev

    def load_state(self) -> dict[str, Any]:
        if not self.state_path.is_file():
            return {"schema": 1, "updated_at": "", "entries": {}}
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        except Exception as exc:
            self.log.warning("状态文件损坏，重新开始：%s", exc)
            return {"schema": 1, "updated_at": "", "entries": {}}

    # ------------------------------------------------------------------ 写入
    def save_state(self, state: dict[str, Any]) -> None:
        state["updated_at"] = _now()
        _atomic_write_text(self.state_path, json.dumps(state, ensure_ascii=False, indent=2))

    def export(self, records: list[TrainerRecord], meta: dict[str, Any]) -> None:
        records = sorted(records, key=lambda r: (r.game_name or r.slug or r.url).lower())
        payload = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": _now(),
            "count": len(records),
            "meta": meta,
            "records": [r.to_dict() for r in records],
        }
        _atomic_write_text(self.json_path, json.dumps(payload, ensure_ascii=False, indent=2))
        ndjson = "\n".join(json.dumps(r.to_dict(), ensure_ascii=False) for r in records)
        _atomic_write_text(self.ndjson_path, ndjson + ("\n" if ndjson else ""))
        index = dict(payload)
        index.pop("records", None)
        _atomic_write_text(self.index_path, json.dumps(index, ensure_ascii=False, indent=2))
        self.log.info("已导出 %d 条记录 -> %s", len(records), self.json_path)

    def append_jsonl(self, path: Path, rows: Iterable[dict]) -> int:
        rows = list(rows)
        if not rows:
            return 0
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            for row in rows:
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")
        return len(rows)

    def reset_jsonl(self, path: Path) -> None:
        if path.exists():
            path.unlink()

    # ------------------------------------------------------------------ 截图
    def screenshot_target(self, slug: str, url: str) -> Path:
        name = url.split("?")[0].rstrip("/").rsplit("/", 1)[-1] or "image"
        name = "".join(c for c in name if c not in '\\/:*?"<>|')[:120] or "image"
        return self.shot_dir / (slug or "_unknown") / name

    def screenshot_exists(self, path: Path) -> bool:
        return path.is_file() and path.stat().st_size > 0

    def save_screenshot(self, path: Path, content: bytes) -> int:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as fh:
            fh.write(content)
        return len(content)

    def relative(self, path: Path) -> str:
        try:
            return path.resolve().relative_to(self.root.resolve()).as_posix()
        except Exception:
            return path.as_posix()

    # ------------------------------------------------------------------ 变更
    def write_changelog(self, entries: list[dict], run_date: str) -> Path | None:
        if not entries:
            return None
        path = self.change_dir / f"{run_date}.jsonl"
        self.append_jsonl(path, entries)
        summary = {
            "generated_at": _now(),
            "total_changes": len(entries),
            "new": sum(1 for e in entries if e.get("change_type") == "new"),
            "updated": sum(1 for e in entries if e.get("change_type") == "updated"),
            "removed": sum(1 for e in entries if e.get("change_type") == "removed"),
            "file": path.name,
        }
        _atomic_write_text(
            self.change_dir / "latest.json", json.dumps(summary, ensure_ascii=False, indent=2)
        )
        return path
