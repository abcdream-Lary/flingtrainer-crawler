"""采集编排：全量 / 增量、断点续跑、变更检测、失败与缺失字段记录。

增量判定采用三层组合，逐层降低开销：
  1. 时间窗   —— 距上次成功抓取 N 天内直接跳过（crawl.skip_if_crawled_within_days）
  2. 条件请求 —— 携带 If-None-Match / If-Modified-Since，命中 304 时连解析都省掉
  3. 内容哈希 —— 解析后比对 content_hash，只有真正变化才写变更日志、重下截图
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from .config import Config
from .fetcher import FetchError, Fetcher
from .logging_setup import setup_logging
from .models import TrainerRecord
from .parsers import discover_detail_urls, parse_detail
from .robots import RobotsDisallowed, RobotsPolicy
from .store import Store

CHECKPOINT_EVERY = 20
COMPARE_FIELDS = [
    "game_name",
    "game_version",
    "options_count",
    "last_updated",
    "published_date",
    "categories",
    "notes",
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _diff_fields(prev: TrainerRecord, cur: TrainerRecord) -> list[str]:
    changed: list[str] = []
    a, b = prev.to_dict(), cur.to_dict()
    for field in COMPARE_FIELDS:
        if a.get(field) != b.get(field):
            changed.append(field)
    if [o.text for o in prev.options] != [o.text for o in cur.options]:
        changed.append("options")
    if [d.url for d in prev.downloads] != [d.url for d in cur.downloads]:
        changed.append("downloads")
    if [s.original_url for s in prev.screenshots] != [s.original_url for s in cur.screenshots]:
        changed.append("screenshots")
    return changed


class Crawler:
    def __init__(self, cfg: Config, logger: logging.Logger | None = None):
        self.cfg = cfg
        self.log = logger or setup_logging(cfg)
        self.store = Store(cfg, self.log)
        self.base_url = cfg.get("site.base_url", "").rstrip("/")
        self.robots = self._build_robots()
        self.fetcher = Fetcher(cfg, self.robots, self.log)
        self._interrupted = False

    # ------------------------------------------------------------------ 初始化
    def _build_robots(self) -> RobotsPolicy:
        http = self.cfg.http
        headers = {"User-Agent": http.get("user_agent", "flingtrainer-crawler/1.0")}
        timeout = float(http.get("timeout", 30))

        def raw_fetch(url: str) -> tuple[int, str]:
            # robots.txt 本身不受 robots 约束，直接用裸请求
            resp = requests.get(url, timeout=timeout, headers=headers)
            return resp.status_code, resp.text

        robots_cfg = self.cfg.get("site.robots", {})
        policy = RobotsPolicy(
            base_url=self.base_url,
            fetch_text=raw_fetch,
            user_agent_token=robots_cfg.get("user_agent_token", "*"),
            respect=bool(robots_cfg.get("respect", True)),
            on_fetch_error=robots_cfg.get("on_fetch_error", "disallow"),
            on_missing=robots_cfg.get("on_missing", "allow"),
            never_fetch_paths=robots_cfg.get("never_fetch_paths", []) or [],
            logger=self.log,
        )
        policy.load()
        return policy

    # ------------------------------------------------------------------ 主流程
    def run(
        self,
        mode: str | None = None,
        limit: int | None = None,
        since_days: float | None = None,
        force: bool = False,
        download_screenshots: bool | None = None,
        urls: list[str] | None = None,
    ) -> dict[str, Any]:
        started = time.time()
        run_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        mode = (mode or self.cfg.get("crawl.mode", "incremental") or "incremental").lower()
        limit = int(limit if limit is not None else self.cfg.get("crawl.limit", 0) or 0)
        since_days = (
            float(since_days)
            if since_days is not None
            else float(self.cfg.get("crawl.skip_if_crawled_within_days", 0) or 0)
        )
        if mode in ("full", "smart"):
            since_days = 0.0  # 全量 / 智能增量：目标已由模式自身决定，不再套时间窗
        if download_screenshots is None:
            download_screenshots = bool(self.cfg.get("media.download_screenshots", True))

        state = self.store.load_state()
        entries: dict[str, Any] = state.setdefault("entries", {})
        prev_records = self.store.load_previous_records()
        results: dict[str, TrainerRecord] = dict(prev_records)
        failures: list[dict] = []
        missing_rows: list[dict] = []
        changes: list[dict] = []

        counters = {
            "discovered": 0, "fetched": 0, "parsed": 0, "skipped_recent": 0,
            "not_modified": 0, "new": 0, "updated": 0, "unchanged": 0,
            "removed": 0, "failed": 0, "robots_blocked": 0,
            "targets": 0, "targets_new": 0, "targets_hinted": 0,
            "targets_refresh": 0, "refresh_pending": 0,
        }

        # ---------- 确定待抓 URL ----------
        # all_discovered：完整的发现结果（用于下架判定，智能模式的目标是其子集）
        all_discovered: list[str] = []
        if urls is not None:
            all_discovered = list(dict.fromkeys(urls))
            target_urls = list(all_discovered)
            self.log.info("重跑模式：指定 %d 个 URL", len(target_urls))
        else:
            all_discovered, listing_failures = discover_detail_urls(self.fetcher, self.cfg, self.log)
            failures.extend(listing_failures)
            counters["failed"] += len(listing_failures)
            target_urls = list(all_discovered)

        only_slugs = self.cfg.get("crawl.only_slugs") or []
        if only_slugs:
            wanted = set(only_slugs)
            all_discovered = [u for u in all_discovered if u.rstrip("/").rsplit("/", 1)[-1] in wanted]
            target_urls = list(all_discovered)
            self.log.info("仅抓取指定 slug：%d 个", len(target_urls))
        if limit:
            target_urls = target_urls[:limit]
            all_discovered = target_urls

        # ---------- 智能增量：feed 提示 + 新增/下架差集 + 轮询预算 ----------
        if mode == "smart" and urls is None and not only_slugs and not limit:
            from .hints import fetch_feed_hints, plan_smart_targets

            feed_urls = list(self.cfg.get("crawl.smart.feed_urls", []) or [])
            budget = int(self.cfg.get("crawl.smart.refresh_budget_per_run", 0) or 0)
            hints = fetch_feed_hints(self.fetcher, feed_urls, self.log) if feed_urls else {}
            plan = plan_smart_targets(all_discovered, entries, hints, budget)
            target_urls = list(dict.fromkeys(plan["new"] + plan["hinted"] + plan["refresh"]))
            counters["targets_new"] = plan["stats"]["new"]
            counters["targets_hinted"] = plan["stats"]["hinted"]
            counters["targets_refresh"] = plan["stats"]["refresh"]
            counters["refresh_pending"] = plan["stats"]["refresh_pending"]
            self.log.info(
                "智能增量：发现 %d 页；新增 %d、feed 提示有更新 %d、轮询抽查 %d（积压 %d）→ 本轮抓取 %d 页",
                len(all_discovered), plan["stats"]["new"], plan["stats"]["hinted"],
                plan["stats"]["refresh"], plan["stats"]["refresh_pending"], len(target_urls),
            )
            if plan["removed"]:
                self.log.info("发现 %d 个已下架页面，将在本轮标记 removed", len(plan["removed"]))

        counters["discovered"] = len(all_discovered)
        counters["targets"] = len(target_urls)

        # ---------- 逐页处理 ----------
        cutoff = (
            datetime.now(timezone.utc) - timedelta(days=since_days) if since_days > 0 else None
        )
        try:
            for i, url in enumerate(target_urls, 1):
                if self._interrupted:
                    break
                meta = entries.setdefault(url, {})
                if cutoff and not force and meta.get("status") == "done" and meta.get("last_crawled"):
                    try:
                        if datetime.fromisoformat(meta["last_crawled"]) > cutoff:
                            counters["skipped_recent"] += 1
                            if i % 200 == 0:
                                self.log.info("进度 %d/%d", i, len(target_urls))
                            continue
                    except (ValueError, TypeError):
                        pass

                self.log.info("[%d/%d] %s", i, len(target_urls), url)
                self._process_one(
                    url, meta, prev_records, results, failures, missing_rows, changes,
                    counters, download_screenshots, force,
                )

                if i % CHECKPOINT_EVERY == 0:
                    self.store.save_state(state)
                    self.log.info("进度 %d/%d，已保存断点", i, len(target_urls))
        except KeyboardInterrupt:
            self._interrupted = True
            self.log.warning("收到中断信号，保存断点后退出（可再次运行自动续跑）")

        # ---------- 移除检测 ----------
        # 判定依据必须是「完整发现结果」all_discovered（智能增量下 target_urls 只是其子集），
        # 且仅在完整遍历全站时生效；带 --limit / only_slugs 的部分运行绝不误删。
        full_scan = urls is None and limit == 0 and not only_slugs
        if full_scan and not self._interrupted:
            discovered_set = set(all_discovered)
            for url in list(results.keys()):
                if url in discovered_set:
                    continue
                prev = prev_records.get(url)
                if prev is None:
                    continue
                results.pop(url, None)
                entries[url] = {**entries.get(url, {}), "status": "removed", "removed_at": _now()}
                changes.append({
                    "timestamp": _now(), "url": url, "slug": prev.slug,
                    "change_type": "removed", "fields_changed": [],
                    "before": {"game_name": prev.game_name, "content_hash": prev.content_hash},
                    "after": None,
                })
                counters["removed"] += 1

        # ---------- 落库 ----------
        self.store.save_state(state)
        self.store.reset_jsonl(self.store.failed_path)
        self.store.append_jsonl(self.store.failed_path, failures)
        if failures:
            self.store.append_jsonl(
                self.store.failed_history_path,
                [{**f, "run_at": _now()} for f in failures],
            )
        # 缺失字段日志按"本轮"覆盖，避免长期累积；历史失败另存 failed_history.jsonl
        self.store.reset_jsonl(self.store.missing_path)
        self.store.append_jsonl(self.store.missing_path, missing_rows)
        changelog_file = self.store.write_changelog(changes, run_date)

        summary = {
            "mode": mode,
            "started_at": datetime.fromtimestamp(started, timezone.utc).isoformat(timespec="seconds"),
            "duration_seconds": round(time.time() - started, 1),
            "interrupted": self._interrupted,
            "site": self.base_url,
            "robots_respected": self.cfg.get("site.robots.respect", True),
            "http_stats": self.fetcher.stats,
            "changelog_file": changelog_file.name if changelog_file else None,
            "failed_log": str(self.store.failed_path),
        }
        summary.update(counters)
        self.store.export(list(results.values()), summary)
        return summary

    # ------------------------------------------------------------------ 单页
    def _process_one(self, url, meta, prev_records, results, failures, missing_rows,
                     changes: list[dict], counters, download_screenshots, force) -> None:
        now = _now()
        try:
            resp = self.fetcher.get(
                url,
                etag=meta.get("etag"),
                last_modified=meta.get("last_modified"),
                # force 时禁用条件请求，确保拿到完整正文
                allow_conditional=(not force),
            )
        except RobotsDisallowed as exc:
            self.log.warning("被 robots 拦截，跳过：%s", exc)
            counters["robots_blocked"] += 1
            meta.update({"status": "skipped_robots", "error": str(exc), "updated": now})
            return
        except FetchError as exc:
            self.log.error("抓取失败：%s", exc)
            counters["failed"] += 1
            failures.append({
                "url": url, "stage": "detail_fetch", "error": str(exc), "timestamp": now,
            })
            meta.update({"status": "failed", "error": str(exc), "updated": now,
                         "attempts": int(meta.get("attempts", 0)) + 1})
            return

        counters["fetched"] += 1

        if resp.status_code == 404:
            counters["failed"] += 1
            failures.append({"url": url, "stage": "http_404", "error": "HTTP 404", "timestamp": now})
            meta.update({"status": "failed", "error": "HTTP 404", "updated": now})
            return

        # 条件请求命中 304：页面没变，直接沿用上次的记录
        if resp.not_modified:
            counters["not_modified"] += 1
            meta.update({"status": "done", "last_crawled": now, "error": ""})
            if url in prev_records:
                results[url] = prev_records[url]
            counters["unchanged"] += 1
            return

        rec, missing = parse_detail(
            resp.text, url, self.base_url,
            int(self.cfg.get("media.max_screenshots_per_page", 5) or 0),
        )
        rec.http_status = resp.status_code
        counters["parsed"] += 1

        meta["etag"] = resp.headers.get("ETag", meta.get("etag", ""))
        meta["last_modified"] = resp.headers.get("Last-Modified", meta.get("last_modified", ""))

        prev = prev_records.get(url)
        if prev is None:
            change_type = "new"
            rec.first_seen = now
        elif prev.content_hash != rec.content_hash:
            change_type = "updated"
            rec.first_seen = prev.first_seen or now
        else:
            change_type = "unchanged"
            rec.first_seen = prev.first_seen or now
        rec.last_crawled = now

        if missing:
            missing_rows.append({"url": url, "slug": rec.slug, "missing_fields": missing,
                                 "timestamp": now, "http_status": resp.status_code})

        if download_screenshots:
            self._download_screenshots(rec, force)

        if change_type == "new":
            counters["new"] += 1
            change_detail: dict | None = {
                "fields_changed": ["*"], "before": None, "after": self._snapshot(rec),
            }
        elif change_type == "updated":
            counters["updated"] += 1
            change_detail = {
                "fields_changed": _diff_fields(prev, rec),
                "before": self._snapshot(prev),
                "after": self._snapshot(rec),
            }
        else:
            counters["unchanged"] += 1
            change_detail = None

        if change_detail is not None:
            changes.append({
                "timestamp": now, "url": url, "slug": rec.slug,
                "change_type": change_type, **change_detail,
            })

        results[url] = rec
        meta.update({"status": "done", "last_crawled": now, "error": "",
                     "content_hash": rec.content_hash, "last_updated": rec.last_updated})

    # ------------------------------------------------------------------ 截图
    def _download_screenshots(self, rec: TrainerRecord, force: bool) -> None:
        skip_existing = bool(self.cfg.get("media.skip_existing_screenshots", True))
        for shot in rec.screenshots:
            target = self.store.screenshot_target(rec.slug, shot.original_url)
            if skip_existing and not force and self.store.screenshot_exists(target):
                shot.local_path = self.store.relative(target)
                shot.downloaded = True
                shot.bytes = target.stat().st_size
                continue
            try:
                resp = self.fetcher.get_binary(shot.original_url)
            except RobotsDisallowed as exc:
                self.log.warning("截图被 robots 拦截，仅保留 URL：%s (%s)", shot.original_url, exc)
                continue
            except FetchError as exc:
                self.log.warning("截图下载失败：%s", exc)
                continue
            if not resp.content:
                continue
            size = self.store.save_screenshot(target, resp.content)
            shot.local_path = self.store.relative(target)
            shot.downloaded = True
            shot.bytes = size

    @staticmethod
    def _snapshot(rec: TrainerRecord) -> dict:
        return {
            "game_name": rec.game_name,
            "game_version": rec.game_version,
            "options_count": rec.options_count,
            "options_extracted": rec.options_extracted,
            "last_updated": rec.last_updated,
            "downloads": [{"file_name": d.file_name, "version": d.version, "url": d.url}
                          for d in rec.downloads],
            "content_hash": rec.content_hash,
        }
