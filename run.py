#!/usr/bin/env python
"""便捷入口：python run.py crawl --mode full"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from flingcrawler.cli import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
