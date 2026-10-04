"""智能增量模块的解析与规划测试（不发起网络请求）。"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from flingcrawler.hints import normalize_url, parse_feed, plan_smart_targets  # noqa: E402

RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title>Ace Combat 8</title>
    <link>https://flingtrainer.com/trainer/ace-combat-8-wings-of-theve-trainer/?utm_source=rss&amp;utm_medium=rss</link>
    <pubDate>Sat, 03 Oct 2026 15:17:44 -0500</pubDate>
  </item>
  <item>
    <title>Dynasty Warriors 3</title>
    <link>https://flingtrainer.com/trainer/dynasty-warriors-3-complete-edition-remastered-trainer/</link>
    <pubDate>Thu, 01 Oct 2026 07:17:15 -0500</pubDate>
  </item>
</channel></rss>
"""

ATOM = """<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Some Game</title>
    <link rel="alternate" href="https://flingtrainer.com/trainer/some-game-trainer/"/>
    <updated>2026-10-02T12:00:00Z</updated>
  </entry>
</feed>
"""


def test_normalize_url_strips_utm_and_anchor():
    raw = "https://flingtrainer.com/trainer/x-trainer/?utm_source=rss&utm_campaign=x#frag"
    assert normalize_url(raw) == "https://flingtrainer.com/trainer/x-trainer/"


def test_parse_feed_rss_timezone_to_utc():
    hints = parse_feed(RSS)
    assert set(hints) == {
        "https://flingtrainer.com/trainer/ace-combat-8-wings-of-theve-trainer/",
        "https://flingtrainer.com/trainer/dynasty-warriors-3-complete-edition-remastered-trainer/",
    }
    # -0500 的 15:17:44 应归一为 UTC 20:17:44
    assert hints["https://flingtrainer.com/trainer/ace-combat-8-wings-of-theve-trainer/"] == \
        "2026-10-03T20:17:44+00:00"


def test_parse_feed_atom():
    hints = parse_feed(ATOM)
    assert hints == {"https://flingtrainer.com/trainer/some-game-trainer/": "2026-10-02T12:00:00+00:00"}


def test_parse_feed_broken_xml_returns_empty():
    assert parse_feed("<rss><channel><item>") == {}


def test_plan_smart_targets_classifies_and_budgets():
    discovered = [f"https://flingtrainer.com/trainer/g{i}-trainer/" for i in range(5)]
    entries = {
        discovered[0]: {"status": "done", "last_crawled": "2026-09-01T00:00:00+00:00"},  # feed 更新 → hinted
        discovered[1]: {"status": "done", "last_crawled": "2026-10-04T00:00:00+00:00"},  # 最新 → 不进 refresh
        discovered[2]: {"status": "done", "last_crawled": "2026-09-20T00:00:00+00:00"},  # 轮询候选
        discovered[3]: {"status": "error", "last_crawled": ""},                          # 未成功 → new
        # discovered[4] 从未出现在 state → new
    }
    hints = {discovered[0]: "2026-09-30T00:00:00+00:00"}
    plan = plan_smart_targets(discovered, entries, hints, refresh_budget=1)

    assert plan["new"] == [discovered[3], discovered[4]]
    assert plan["hinted"] == [discovered[0]]
    assert plan["refresh"] == [discovered[2]]  # 预算 1，取最久未抓
    # discovered[1] 也是轮询候选但排在后面，预算用尽 → 计入积压
    assert plan["stats"]["refresh_pending"] == 1
    assert plan["stats"]["new"] == 2 and plan["stats"]["hinted"] == 1


def test_plan_smart_targets_detects_removed_and_budget_backlog():
    discovered = ["https://flingtrainer.com/trainer/a-trainer/"]
    entries = {
        discovered[0]: {"status": "done", "last_crawled": "2026-09-10T00:00:00+00:00"},
        "https://flingtrainer.com/trainer/gone-trainer/": {"status": "done"},
        "https://flingtrainer.com/trainer/b-trainer/": {"status": "done"},  # 不在发现结果中 → removed
    }
    plan = plan_smart_targets(discovered, entries, {}, refresh_budget=0)
    # 两个历史页面都不在本轮发现集合中 → 均判定下架
    assert plan["removed"] == [
        "https://flingtrainer.com/trainer/gone-trainer/",
        "https://flingtrainer.com/trainer/b-trainer/",
    ]
    assert plan["refresh"] == [] and plan["stats"]["refresh_pending"] == 1
