"""命令行入口。

    python run.py crawl                      增量采集（默认）
    python run.py crawl --mode full          全量采集
    python run.py crawl --limit 20 --no-screenshots
    python run.py retry-failed               只重跑上一轮失败的 URL
    python run.py export                     不联网，按现有 ndjson 重新导出 JSON
    python run.py stats                      打印当前数据概况
"""

from __future__ import annotations

import argparse
import json
import sys

from .config import load_config
from .logging_setup import setup_logging
from .pipeline import Crawler
from .store import Store


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="flingcrawler", description="风灵月影修改器站点结构化采集器"
    )
    parser.add_argument("-c", "--config", help="配置文件路径（默认 config/config.yaml）")
    parser.add_argument("-v", "--verbose", action="store_true", help="输出 DEBUG 级日志")
    sub = parser.add_subparsers(dest="command", required=True)

    crawl = sub.add_parser("crawl", help="执行采集")
    crawl.add_argument("--mode", choices=["smart", "full", "incremental"], help="覆盖配置中的模式")
    crawl.add_argument("--limit", type=int, help="只处理前 N 个页面（调试用）")
    crawl.add_argument("--since-days", type=float, help="距上次成功抓取 N 天内跳过")
    crawl.add_argument("--force", action="store_true", help="忽略缓存与跳过策略，强制重新抓取")
    crawl.add_argument("--no-screenshots", action="store_true", help="本次不下载截图")
    crawl.add_argument("--url", action="append", dest="urls", help="只抓指定详情页 URL，可重复")

    sub.add_parser("retry-failed", help="重跑 data/logs/failed.jsonl 中记录的失败 URL")

    sub.add_parser("export", help="按现有数据重新导出 JSON（不发起网络请求）")
    sub.add_parser("stats", help="打印当前数据概况")
    return parser


def _make_crawler(args) -> Crawler:
    cfg = load_config(getattr(args, "config", None))
    if getattr(args, "verbose", False):
        cfg.raw.setdefault("logging", {})["level"] = "DEBUG"
    logger = setup_logging(cfg)
    logger.info("配置来源：%s", cfg.source)
    return Crawler(cfg, logger)


def cmd_crawl(args) -> int:
    crawler = _make_crawler(args)
    summary = crawler.run(
        mode=args.mode,
        limit=args.limit,
        since_days=args.since_days,
        force=args.force,
        download_screenshots=(False if args.no_screenshots else None),
        urls=args.urls,
    )
    print("\n===== 采集汇总 =====")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


def cmd_retry_failed(args) -> int:
    cfg = load_config(getattr(args, "config", None))
    if getattr(args, "verbose", False):
        cfg.raw.setdefault("logging", {})["level"] = "DEBUG"
    logger = setup_logging(cfg)
    store = Store(cfg, logger)

    urls: list[str] = []
    if store.failed_path.is_file():
        for line in store.failed_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except Exception:
                continue
            # 列表页失败记录保留在 stage=listing，重跑只处理详情页
            if row.get("stage") in (None, "", "listing"):
                continue
            if row.get("url"):
                urls.append(row["url"])
    urls = list(dict.fromkeys(urls))
    if not urls:
        logger.info("没有需要重跑的失败 URL")
        return 0

    logger.info("准备重跑 %d 个失败 URL", len(urls))
    crawler = Crawler(cfg, logger)
    summary = crawler.run(mode="full", force=True, urls=urls)
    print("\n===== 重跑汇总 =====")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


def cmd_export(args) -> int:
    cfg = load_config(getattr(args, "config", None))
    logger = setup_logging(cfg)
    store = Store(cfg, logger)
    records = list(store.load_previous_records().values())
    store.export(records, {"mode": "export", "regenerated_at": ""})
    print(f"已重新导出 {len(records)} 条记录 -> {store.json_path}")
    return 0


def cmd_stats(args) -> int:
    cfg = load_config(getattr(args, "config", None))
    store = Store(cfg)
    if store.index_path.is_file():
        print(store.index_path.read_text(encoding="utf-8"))
        return 0
    print("尚无数据，请先执行 crawl")
    return 1


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    handlers = {
        "crawl": cmd_crawl,
        "retry-failed": cmd_retry_failed,
        "export": cmd_export,
        "stats": cmd_stats,
    }
    try:
        return handlers[args.command](args)
    except KeyboardInterrupt:
        print("\n已中断", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
