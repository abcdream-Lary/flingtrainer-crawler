"""robots.txt 合规层。

站点 https://flingtrainer.com/robots.txt 实际内容（2026-10 核对）：
    User-agent: *
    Disallow: /downloads/
    Disallow: /attachments/
    Disallow: /cn/community/
    Disallow: /wp-admin/
    Disallow: /?s=
    Allow: /wp-admin/admin-ajax.php

结论：修改器下载链接位于 /downloads/ 下，**禁止抓取**。本项目因此只把下载链接
当作元数据（URL / 文件名 / 版本号 / 日期）采集，绝不发起请求；截图位于
/wp-content/uploads/ 下，属于允许范围。
"""

from __future__ import annotations

import urllib.robotparser
from urllib.parse import urlparse
from typing import Callable

ROBOTS_DISALLOWED = "robots_disallowed"
NEVER_FETCH_DISALLOWED = "never_fetch_path"


class RobotsDisallowed(Exception):
    """请求被 robots 策略拦截。这通常不是错误，不应计入失败重试。"""

    def __init__(self, url: str, reason: str):
        super().__init__(f"{url} 被禁止抓取（{reason}）")
        self.url = url
        self.reason = reason


class RobotsPolicy:
    def __init__(
        self,
        base_url: str,
        fetch_text: Callable[[str], tuple[int, str]],
        user_agent_token: str = "*",
        respect: bool = True,
        on_fetch_error: str = "disallow",
        on_missing: str = "allow",
        never_fetch_paths: list[str] | None = None,
        logger=None,
    ):
        self.base_url = base_url.rstrip("/")
        self._fetch_text = fetch_text
        self.user_agent_token = user_agent_token
        self.respect = respect
        self.on_fetch_error = on_fetch_error
        self.on_missing = on_missing
        self.never_fetch_paths = list(never_fetch_paths or [])
        self.logger = logger
        self._parser: urllib.robotparser.RobotFileParser | None = None
        self.loaded = False
        self.load_error = ""
        self.robots_text = ""

    # ------------------------------------------------------------------ 加载
    def load(self) -> None:
        if not self.respect:
            self.loaded = True
            return
        url = f"{self.base_url}/robots.txt"
        try:
            status, text = self._fetch_text(url)
        except Exception as exc:  # 网络异常按 on_fetch_error 处理
            self.load_error = f"{type(exc).__name__}: {exc}"
            self._apply_error_policy(url)
            return

        if status == 404:
            # RFC 9309：robots.txt 不存在即视为全部允许
            self.loaded = True
            self._log("info", "robots.txt 返回 404，按配置视为 %s", self.on_missing)
            if self.on_missing == "disallow":
                self._parser = self._disallow_all_parser()
            return
        if status >= 500 or status == 0:
            self.load_error = f"HTTP {status}"
            self._apply_error_policy(url)
            return
        if status >= 400:
            # 403/401 等：保守起见全部禁止
            self.load_error = f"HTTP {status}"
            self._apply_error_policy(url)
            return

        self.robots_text = text or ""
        parser = urllib.robotparser.RobotFileParser()
        parser.parse((text or "").splitlines())
        self._parser = parser
        self.loaded = True
        self._log("info", "robots.txt 已加载（%d 字节）", len(self.robots_text))

    def _apply_error_policy(self, url: str) -> None:
        self.loaded = True
        if self.on_fetch_error == "disallow":
            self._parser = self._disallow_all_parser()
            self._log("warning", "robots.txt 获取失败（%s），按保守策略禁止全部抓取", self.load_error)
        else:
            self._parser = None
            self._log("warning", "robots.txt 获取失败（%s），按配置放行", self.load_error)

    @staticmethod
    def _disallow_all_parser() -> urllib.robotparser.RobotFileParser:
        parser = urllib.robotparser.RobotFileParser()
        parser.parse(["User-agent: *", "Disallow: /"])
        return parser

    # ------------------------------------------------------------------ 判定
    def can_fetch(self, url: str) -> tuple[bool, str]:
        """返回 (是否允许, 拦截原因)。"""
        if not self.respect:
            return True, ""

        path = urlparse(url).path or "/"
        for blocked in self.never_fetch_paths:
            if blocked in url or path.startswith(blocked):
                return False, NEVER_FETCH_DISALLOWED

        if self._parser is None:
            return True, ""
        try:
            allowed = self._parser.can_fetch(self.user_agent_token, url)
        except Exception:
            # 解析异常时保守处理
            return False, "robots_parse_error"
        return (True, "") if allowed else (False, ROBOTS_DISALLOWED)

    def crawl_delay(self) -> float | None:
        if not self.respect or self._parser is None:
            return None
        try:
            delay = self._parser.crawl_delay(self.user_agent_token)
        except Exception:
            return None
        return float(delay) if delay else None

    def _log(self, level: str, msg: str, *args) -> None:
        if self.logger:
            getattr(self.logger, level)(msg, *args)
