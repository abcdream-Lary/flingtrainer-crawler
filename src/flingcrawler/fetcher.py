"""HTTP 抓取层：限速、失败重试、条件请求、robots 前置校验。

设计要点：
1. 每次请求前先过 robots 策略，被拦截抛 RobotsDisallowed（不计入重试/失败）。
2. 限速器在 [min, max] 区间随机抖动；若 robots.txt 给出更大的 Crawl-delay 则以其为准。
3. 重试采用指数退避，并优先遵循响应头 Retry-After。
4. 条件请求（If-None-Match / If-Modified-Since）命中 304 时返回 not_modified，
   这是日常增量任务省流量的关键。
"""

from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass, field
from typing import Any

import requests

from .robots import RobotsDisallowed, RobotsPolicy


class FetchError(Exception):
    """重试耗尽后仍失败。"""

    def __init__(self, url: str, message: str, status: int | None = None, attempts: int = 0):
        super().__init__(f"{url}: {message}")
        self.url = url
        self.status = status
        self.attempts = attempts


@dataclass
class FetchResponse:
    url: str
    status_code: int = 0
    text: str = ""
    content: bytes = b""
    headers: dict[str, str] = field(default_factory=dict)
    not_modified: bool = False
    from_cache: bool = False
    attempts: int = 0
    final_url: str = ""

    @property
    def ok(self) -> bool:
        return self.status_code == 200 or self.not_modified


class RateLimiter:
    """简单的串行限速器：保证相邻两次请求间隔不小于下限。"""

    def __init__(self, min_interval: float, max_interval: float, jitter: bool = True):
        self.min_interval = max(0.0, float(min_interval))
        self.max_interval = max(self.min_interval, float(max_interval))
        self.jitter = jitter
        self._last = 0.0

    def wait(self) -> float:
        target = self.min_interval
        if self.jitter and self.max_interval > self.min_interval:
            target = random.uniform(self.min_interval, self.max_interval)
        now = time.monotonic()
        elapsed = now - self._last
        if self._last and elapsed < target:
            time.sleep(target - elapsed)
        self._last = time.monotonic()
        return target

    def bump_min(self, value: float) -> None:
        """robots.txt 的 Crawl-delay 更大时提高下限。"""
        if value and value > self.min_interval:
            self.min_interval = float(value)
            self.max_interval = max(self.max_interval, self.min_interval)


class Fetcher:
    def __init__(self, cfg, robots: RobotsPolicy, logger: logging.Logger | None = None):
        self.cfg = cfg
        self.robots = robots
        self.log = logger or logging.getLogger("flingcrawler")

        http = cfg.http
        self.timeout = float(http.get("timeout", 30))
        self.max_retries = int(http.get("max_retries", 3))
        self.backoff_factor = float(http.get("backoff_factor", 2.0))
        self.backoff_max = float(http.get("backoff_max_seconds", 60))
        self.retry_statuses = set(http.get("retry_statuses", [429, 500, 502, 503, 504]))
        self.honor_retry_after = bool(http.get("honor_retry_after", True))
        self.conditional_get = bool(http.get("conditional_get", True))

        self.limiter = RateLimiter(
            http.get("min_interval_seconds", 1.5), http.get("max_interval_seconds", 3.0)
        )
        crawl_delay = robots.crawl_delay()
        if crawl_delay:
            self.limiter.bump_min(crawl_delay)
            self.log.info("遵循 robots.txt Crawl-delay: %.1fs", crawl_delay)

        self.session = requests.Session()
        headers = {"User-Agent": http.get("user_agent", "flingtrainer-crawler/1.0")}
        headers.update(http.get("headers") or {})
        self.session.headers.update(headers)

        self.stats = {"requests": 0, "retries": 0, "not_modified": 0, "robots_blocked": 0,
                      "bytes": 0, "failures": 0}

    # ------------------------------------------------------------------ 核心
    def get(
        self,
        url: str,
        etag: str | None = None,
        last_modified: str | None = None,
        allow_conditional: bool | None = None,
    ) -> FetchResponse:
        """抓取文本页面。命中 304 时返回 not_modified=True 且 text 为空。"""
        allowed, reason = self.robots.can_fetch(url)
        if not allowed:
            self.stats["robots_blocked"] += 1
            raise RobotsDisallowed(url, reason)

        use_conditional = self.conditional_get if allow_conditional is None else allow_conditional
        headers: dict[str, str] = {}
        if use_conditional:
            if etag:
                headers["If-None-Match"] = etag
            if last_modified:
                headers["If-Modified-Since"] = last_modified

        last_exc: Exception | None = None
        for attempt in range(self.max_retries + 1):
            self.limiter.wait()
            try:
                resp = self.session.get(
                    url, timeout=self.timeout, headers=headers, allow_redirects=True
                )
            except requests.RequestException as exc:
                last_exc = exc
                self.stats["retries"] += 1
                if not self._sleep_before_retry(attempt, None):
                    break
                continue

            self.stats["requests"] += 1
            status = resp.status_code

            if status == 304:
                self.stats["not_modified"] += 1
                return FetchResponse(
                    url=url, status_code=304, headers=dict(resp.headers),
                    not_modified=True, attempts=attempt + 1, final_url=resp.url,
                )
            if status == 404:
                return FetchResponse(
                    url=url, status_code=404, headers=dict(resp.headers),
                    attempts=attempt + 1, final_url=resp.url,
                )
            if status in self.retry_statuses:
                self.stats["retries"] += 1
                if not self._sleep_before_retry(attempt, resp):
                    return FetchResponse(
                        url=url, status_code=status, headers=dict(resp.headers),
                        attempts=attempt + 1, final_url=resp.url,
                    )
                continue

            if status >= 400:
                return FetchResponse(
                    url=url, status_code=status, headers=dict(resp.headers),
                    attempts=attempt + 1, final_url=resp.url,
                )

            body: Any = resp.content
            self.stats["bytes"] += len(body)
            return FetchResponse(
                url=url,
                status_code=status,
                text=resp.text,
                content=body,
                headers=dict(resp.headers),
                attempts=attempt + 1,
                final_url=resp.url,
            )

        self.stats["failures"] += 1
        detail = f"{type(last_exc).__name__}: {last_exc}" if last_exc else "重试耗尽"
        raise FetchError(url, detail, attempts=self.max_retries + 1)

    def get_binary(self, url: str) -> FetchResponse:
        """抓取二进制资源（截图）。同样受 robots 与限速约束。"""
        allowed, reason = self.robots.can_fetch(url)
        if not allowed:
            self.stats["robots_blocked"] += 1
            raise RobotsDisallowed(url, reason)

        last_exc: Exception | None = None
        for attempt in range(self.max_retries + 1):
            self.limiter.wait()
            try:
                resp = self.session.get(url, timeout=self.timeout, allow_redirects=True, stream=True)
            except requests.RequestException as exc:
                last_exc = exc
                self.stats["retries"] += 1
                if not self._sleep_before_retry(attempt, None):
                    break
                continue
            self.stats["requests"] += 1
            status = resp.status_code
            if status in self.retry_statuses:
                self.stats["retries"] += 1
                if not self._sleep_before_retry(attempt, resp):
                    break
                continue
            if status >= 400:
                return FetchResponse(url=url, status_code=status, headers=dict(resp.headers),
                                     attempts=attempt + 1, final_url=resp.url)
            data = resp.content
            self.stats["bytes"] += len(data)
            return FetchResponse(
                url=url, status_code=status, content=data, headers=dict(resp.headers),
                attempts=attempt + 1, final_url=resp.url,
            )
        self.stats["failures"] += 1
        detail = f"{type(last_exc).__name__}: {last_exc}" if last_exc else "重试耗尽"
        raise FetchError(url, detail, attempts=self.max_retries + 1)

    # ------------------------------------------------------------------ 退避
    def _sleep_before_retry(self, attempt: int, resp) -> bool:
        """返回 True 表示应继续重试。"""
        if attempt >= self.max_retries:
            return False
        delay = None
        if self.honor_retry_after and resp is not None:
            raw = resp.headers.get("Retry-After")
            if raw:
                try:
                    delay = float(raw)
                except (TypeError, ValueError):
                    delay = None
        if delay is None:
            delay = min(self.backoff_factor ** (attempt + 1), self.backoff_max)
        delay = min(delay + random.uniform(0, 0.5), self.backoff_max)
        self.log.warning("第 %d 次失败，%.1fs 后重试", attempt + 1, delay)
        time.sleep(delay)
        return True
