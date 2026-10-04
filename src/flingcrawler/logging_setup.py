"""日志初始化：控制台 + 文件双输出。"""

from __future__ import annotations

import logging
from pathlib import Path

_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"


def setup_logging(cfg) -> logging.Logger:
    level = getattr(logging, str(cfg.get("logging.level", "INFO")).upper(), logging.INFO)
    logger = logging.getLogger("flingcrawler")
    logger.setLevel(level)
    logger.handlers.clear()
    logger.propagate = False

    console = logging.StreamHandler()
    console.setFormatter(logging.Formatter(_FORMAT))
    logger.addHandler(console)

    if cfg.get("logging.to_file", True):
        log_dir = cfg.as_path("output.logs_dir", "data/logs")
        log_dir.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(
            log_dir / str(cfg.get("logging.log_filename", "crawler.log")), encoding="utf-8"
        )
        file_handler.setFormatter(logging.Formatter(_FORMAT))
        logger.addHandler(file_handler)

    # 屏蔽第三方库的噪音
    for noisy in ("urllib3", "requests"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    return logger
