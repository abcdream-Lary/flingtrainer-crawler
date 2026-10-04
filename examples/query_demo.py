#!/usr/bin/env python
"""采集数据的调用示例：本地读取、远程直连、常见查询。

运行：
    python examples/query_demo.py                      # 读本地数据做演示
    python examples/query_demo.py --remote             # 从 jsDelivr CDN 远程拉取
    python examples/query_demo.py --slug black-myth-wukong-trainer
    python examples/query_demo.py --search wukong
    python examples/query_demo.py --updated-since 2026-10-01

只依赖标准库 + requests，不依赖本项目源码，可单独拷走使用。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Iterator

try:
    import requests
except ImportError:  # 离线场景可不装 requests，只是 --remote 不可用
    requests = None

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_JSON = ROOT / "data" / "json" / "trainers.json"
DEFAULT_NDJSON = ROOT / "data" / "json" / "trainers.ndjson"

# 本项目仓库；fork 后请改成你自己的。jsDelivr 在国内通常比 raw.githubusercontent.com 快
REMOTE_JSON = "https://cdn.jsdelivr.net/gh/abcdream-Lary/flingtrainer-crawler@main/data/json/trainers.json"
REMOTE_NDJSON = "https://cdn.jsdelivr.net/gh/abcdream-Lary/flingtrainer-crawler@main/data/json/trainers.ndjson"


# --------------------------------------------------------------------- 加载
def load_all(path: str | Path | None = None) -> list[dict]:
    """一次性读入全量 JSON。数据不大（全站约 4 MB）时最简单。"""
    path = Path(path or DEFAULT_JSON)
    with path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    # 兼容顶层是 {records: [...]} 或直接是 [...]
    if isinstance(data, dict):
        return data.get("records", [])
    return data


def iter_records(path: str | Path | None = None) -> Iterator[dict]:
    """逐行流式读 NDJSON：内存占用恒定，适合全量扫描或边下边处理。"""
    path = Path(path or DEFAULT_NDJSON)
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def load_remote(url: str = REMOTE_NDJSON, timeout: int = 60) -> list[dict]:
    """不开仓库、不 clone，直接从 CDN 读。按行流式解析，边下边解。"""
    if requests is None:
        raise RuntimeError("需要 pip install requests 才能使用 --remote")
    resp = requests.get(url, timeout=timeout, stream=True)
    resp.raise_for_status()
    records = []
    for line in resp.iter_lines(decode_unicode=True):
        if line:
            records.append(json.loads(line))
    return records


# --------------------------------------------------------------------- 查询
def index_by_slug(records: list[dict]) -> dict[str, dict]:
    """按 slug 建索引，后续 O(1) 取单条。"""
    return {r.get("slug") or r["url"].rstrip("/").rsplit("/", 1)[-1]: r for r in records}


def search(records: list[dict], keyword: str) -> list[dict]:
    """按游戏名模糊搜索（忽略大小写）。"""
    kw = keyword.lower()
    return [r for r in records if kw in (r.get("game_name") or "").lower()]


def updated_since(records: list[dict], since: str) -> list[dict]:
    """取最后更新日期 >= since(YYYY-MM-DD) 的记录，按日期倒序。"""
    hits = [r for r in records if r.get("last_updated") and r["last_updated"] >= since]
    return sorted(hits, key=lambda r: r["last_updated"], reverse=True)


def latest_download(record: dict) -> dict | None:
    """取当前版本的下载项（is_latest=True）；没有就退回第一条。"""
    for item in record.get("downloads") or []:
        if item.get("is_latest"):
            return item
    return (record.get("downloads") or [None])[0]


def all_versions(record: dict) -> list[str]:
    """列出该修改器收录到的全部版本号（含归档历史版本）。"""
    return [d["version"] for d in (record.get("downloads") or []) if d.get("version")]


def is_changed(prev: dict, cur: dict) -> bool:
    """用 content_hash 判断是否发生变化，比逐字段比对省事。"""
    return prev.get("content_hash") != cur.get("content_hash")


def option_texts(record: dict) -> list[str]:
    """取纯文本形式的选项列表（丢掉 note 时用它）。"""
    return [o["text"] for o in (record.get("options") or [])]


# 站点部分页面会在选项区里夹带分组小标题（如 "Character Editor"、"Edit Player Stats"）
# 或说明文字（如 "Special Notes"），它们不是真正的热键选项。
# 解析器出于"保留原始文本"的原则照单全收，这里提供筛子给调用方按需过滤。
HOTKEY_PATTERN = re.compile(
    r"^(?:num|numpad|ctrl|alt|shift)\b|^(?:ctrl|alt|shift)\+|^f\d{1,2}\b",
    re.IGNORECASE,
)


def has_hotkey(text: str) -> bool:
    """判断条目是否带热键前缀，如 "Num 1 – ..."、"Ctrl+Num 1 – ..."、"F5 – ..."。"""
    return bool(HOTKEY_PATTERN.search(text or ""))


def hotkey_options(record: dict) -> list[dict]:
    """只保留带热键的选项条目，滤掉分组小标题与说明文字。

    过滤后的条数通常正好等于 options_count；若仍不一致，说明该页面版式特殊，
    可结合 record["missing_fields"] 里的 options_mismatch 一起排查。
    """
    return [o for o in (record.get("options") or []) if has_hotkey(o.get("text", ""))]


# --------------------------------------------------------------------- 演示
def _demo(records: list[dict]) -> None:
    if not records:
        print("没有数据，请先运行：python run.py crawl")
        return

    print(f"共 {len(records)} 条记录\n")

    print("— 最近 5 条记录的字段概览 —")
    for rec in records[:5]:
        latest = latest_download(rec)
        print(
            f"  {rec.get('last_updated') or '(无日期)'} | "
            f"{rec.get('game_name', '')[:38]:38s} | "
            f"{rec.get('game_version', '')[:16]:16s} | "
            f"选项 {rec.get('options_extracted')}/{rec.get('options_count')} | "
            f"版本数 {len(rec.get('downloads') or [])}"
        )
        if latest:
            print(f"      最新版: {latest.get('file_name')}")
    print()

    print("— 单条记录完整结构（第一条，节选） —")
    sample = dict(records[0])
    sample["options"] = (sample.get("options") or [])[:2]
    sample["downloads"] = (sample.get("downloads") or [])[:2]
    print(json.dumps(sample, ensure_ascii=False, indent=2)[:1200])
    print()

    missing = sum(1 for r in records if r.get("missing_fields"))
    print(f"— 数据完整度：{len(records) - missing}/{len(records)} 条无缺失字段")
    if missing:
        print(f"  有 {missing} 条存在缺失字段，详见 data/logs/missing_fields.jsonl")


def main() -> int:
    parser = argparse.ArgumentParser(description="采集数据调用示例")
    parser.add_argument("--remote", action="store_true", help="从 jsDelivr CDN 远程读取")
    parser.add_argument("--slug", help="按 slug 取单条")
    parser.add_argument("--search", help="按游戏名模糊搜索")
    parser.add_argument("--updated-since", help="筛选最后更新日期 >= YYYY-MM-DD")
    parser.add_argument("--days", type=int, help="筛选最近 N 天内更新过")
    parser.add_argument("--file", help="指定本地 JSON/NDJSON 文件路径")
    args = parser.parse_args()

    if args.remote:
        records = load_remote()
    elif args.file:
        p = Path(args.file)
        records = list(iter_records(p)) if p.suffix == ".ndjson" else load_all(p)
    else:
        records = load_all()

    if args.slug:
        idx = index_by_slug(records)
        rec = idx.get(args.slug)
        if not rec:
            print(f"未找到 slug={args.slug}")
            return 1
        print(json.dumps(rec, ensure_ascii=False, indent=2))
        return 0

    if args.search:
        hits = search(records, args.search)
        print(f"搜索 \"{args.search}\" 命中 {len(hits)} 条：")
        for r in hits:
            print(f"  {r['slug']}  |  {r.get('game_name')}")
        return 0

    if args.days:
        args.updated_since = (date.today() - timedelta(days=args.days)).isoformat()
    if args.updated_since:
        hits = updated_since(records, args.updated_since)
        print(f"{args.updated_since} 以来更新了 {len(hits)} 个修改器：")
        for r in hits[:30]:
            print(f"  {r['last_updated']}  {r['slug']}  ({r.get('game_version')})")
        return 0

    _demo(records)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
