#!/usr/bin/env python
"""把采集的 trainers.json 转成展示站可直接 <script> 加载的 data.js。

为什么内联成 JS 而不是让前端 fetch JSON：
    file:// 协议下浏览器的 fetch/XHR 会被 CORS 拦截，双击 index.html 打不开数据；
    内联成 window.FLING_DATA 后无需任何服务器即可运行。
    部署到 GitHub Pages 时同样适用。

用法：
    python scripts/build_web_data.py
    python scripts/build_web_data.py --input data/json/trainers.json --out site/assets/js/data.js
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def display_name(raw: str) -> str:
    """去掉标题尾部的 ' Trainer'，得到纯游戏名。"""
    return re.sub(r"\s*Trainer\s*$", "", raw or "").strip()


def slim(rec: dict) -> dict:
    return {
        "slug": rec.get("slug", ""),
        "name": display_name(rec.get("game_name", "")),
        "version": rec.get("game_version", ""),
        "options_count": rec.get("options_count"),
        "options_extracted": rec.get("options_extracted", 0),
        "last_updated": rec.get("last_updated", ""),
        "published_date": rec.get("published_date", ""),
        "options": [
            {"t": o.get("text", ""), "n": o.get("note", "")} for o in (rec.get("options") or [])
        ],
        "notes": rec.get("notes") or [],
        "cover": rec.get("cover_image", "") or "",
        "screenshots": [s.get("original_url", "") for s in (rec.get("screenshots") or []) if s.get("original_url")],
        "downloads": [
            {
                "file": d.get("file_name", ""),
                "version": d.get("version", ""),
                "url": d.get("url", ""),
                "date": d.get("date_added", ""),
                "size": d.get("file_size", ""),
                "count": d.get("download_count"),
                "latest": bool(d.get("is_latest")),
            }
            for d in (rec.get("downloads") or [])
        ],
        "missing": rec.get("missing_fields") or [],
        "url": rec.get("url", ""),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(ROOT / "data/json/trainers.json"))
    parser.add_argument("--out", default=str(ROOT / "site/assets/js/data.js"))
    args = parser.parse_args()

    src = Path(args.input)
    if not src.is_file():
        print(f"找不到数据文件：{src}", file=sys.stderr)
        return 1

    with src.open("r", encoding="utf-8") as fh:
        raw = json.load(fh)
    records = raw.get("records", raw if isinstance(raw, list) else [])
    slimmed = [slim(r) for r in records]
    slimmed.sort(key=lambda r: (r["name"] or r["slug"]).lower())

    stats = {
        "games": len(slimmed),
        "options": sum(r["options_extracted"] for r in slimmed),
        "downloads": sum(len(r["downloads"]) for r in slimmed),
        "last_updated": max((r["last_updated"] for r in slimmed if r["last_updated"]), default=""),
    }
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "stats": stats,
        "records": slimmed,
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    js = (
        "/* 自动生成：python scripts/build_web_data.py —— 不要手改 */\n"
        f'window.FLING_DATA = {body};\n'
    )
    out.write_text(js, encoding="utf-8")
    print(
        f"已生成 {out.relative_to(ROOT)}：{stats['games']} 款游戏、"
        f"{stats['options']} 条选项、{stats['downloads']} 个历史版本、"
        f"{out.stat().st_size / 1024:.0f} KB"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
