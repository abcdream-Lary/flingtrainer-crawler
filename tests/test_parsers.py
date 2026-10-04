"""基于真实页面快照的解析测试（tests/fixtures 下均为实际抓取的 HTML）。"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from flingcrawler.models import parse_version_from_filename, normalize_date  # noqa: E402
from flingcrawler.parsers.detail import parse_detail  # noqa: E402
from flingcrawler.parsers.listing import extract_detail_links  # noqa: E402
from flingcrawler.robots import RobotsPolicy, RobotsDisallowed  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
PATTERNS = [r"^https?://flingtrainer\.com/trainer/[A-Za-z0-9%\-_.]+/?$"]


def load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8", errors="replace")


# --------------------------------------------------------------------- 详情页
def test_black_myth_wukong_detail():
    html = load("detail.html")
    rec, missing = parse_detail(
        html, "https://flingtrainer.com/trainer/black-myth-wukong-trainer/", max_screenshots=5
    )
    assert rec.game_name == "Black Myth: Wukong Trainer"
    assert rec.slug == "black-myth-wukong-trainer"
    assert rec.game_version == "v1.0-v1.0.20+"
    assert rec.last_updated == "2025-10-17"
    assert rec.options_count == 44
    assert rec.published_date == "2024-08-19"
    assert "Trainer" in rec.categories

    # 选项：完整提取且保留原始文本（含 en dash）
    assert rec.options_extracted >= 40, f"只提取到 {rec.options_extracted} 条选项"
    assert rec.options[0].text.startswith("Num 1")
    assert "God Mode" in rec.options[0].text
    assert rec.options[0].note, "首条选项应带 tooltip 注释"

    # 封面图：来自 og:image（游戏标题图，非正文截图）
    assert rec.cover_image == "https://flingtrainer.com/wp-content/uploads/2024/08/header_schinese.jpg"
    assert "cover_image" not in missing
    assert rec.cover_image not in [s.original_url for s in rec.screenshots]

    # 截图：保留原图 URL
    assert len(rec.screenshots) >= 1
    shot = rec.screenshots[0]
    assert shot.original_url.startswith("https://flingtrainer.com/wp-content/uploads/")
    assert "tooltip-icon" not in shot.original_url

    # 下载：当前版本 + 全部历史版本
    assert len(rec.downloads) == 5
    assert rec.downloads[0].is_latest is True
    assert rec.downloads[0].version == "v1.0-v1.0.20"
    assert rec.downloads[0].file_name == "Black.Myth.Wukong.v1.0-v1.0.20.Plus.44.Trainer-FLiNG"
    assert rec.downloads[0].date_added == "2025-10-17 10:38"
    assert rec.downloads[0].download_count == 1321470
    # 历史版本同样要收录
    assert {d.version for d in rec.downloads} >= {"v1.0-v1.0.20", "v1.0-v1.0.9", "v1.0"}
    assert all(d.url for d in rec.downloads)
    # 下载链接全部位于 robots.txt 禁止的 /downloads/ 下 —— 只采集不请求
    assert all("/downloads/" in d.url for d in rec.downloads)

    assert rec.content_hash and len(rec.content_hash) == 64
    assert "game_name" not in missing


def test_all_fixture_pages_parse():
    """每个样本页都必须抽出标题与下载链接，且不得抛异常。"""
    cases = {
        "d_valheim-trainer.html": "https://flingtrainer.com/trainer/valheim-trainer/",
        "d_total-war-warhammer-iii-trainer.html": "https://flingtrainer.com/trainer/total-war-warhammer-iii-trainer/",
        "d_sunkenland-trainer.html": "https://flingtrainer.com/trainer/sunkenland-trainer/",
        "d_ace-combat-8-wings-of-theve-trainer.html": "https://flingtrainer.com/trainer/ace-combat-8-wings-of-theve-trainer/",
    }
    for name, url in cases.items():
        rec, missing = parse_detail(load(name), url, max_screenshots=5)
        assert rec.game_name, f"{name} 未提取到游戏名"
        assert rec.game_version, f"{name} 未提取到游戏版本"
        assert rec.last_updated, f"{name} 未提取到最后更新日期"
        assert rec.options_extracted > 0, f"{name} 未提取到选项"
        assert len(rec.downloads) >= 1, f"{name} 未提取到下载链接"
        assert rec.downloads[0].is_latest is True
        assert len(rec.screenshots) >= 1, f"{name} 未提取到截图"
        assert isinstance(missing, list)


def test_legacy_layout_page():
    """2022 年前的旧版式：选项是普通 <p>，且其后另有 Notes 区块。"""
    html = load("d_ace-combat-7-skies-unknown-trainer.html")
    rec, missing = parse_detail(
        html, "https://flingtrainer.com/trainer/ace-combat-7-skies-unknown-trainer/", max_screenshots=5
    )
    assert rec.options_count == 11
    assert rec.options_extracted == 11, f"旧版式应提取到 11 条，实际 {rec.options_extracted}"
    assert rec.options[0].text == "Num 1 – Invincible"
    assert "Ctrl+Num 1 – MRP Multiplier" in [o.text for o in rec.options]
    # Notes 区块必须单独存放，不能被当成选项
    assert rec.notes and any("takes effect when you gain score" in n for n in rec.notes)
    assert all("takes effect when you gain score" not in o.text for o in rec.options)
    # 元信息行不能被误当成选项
    assert all("Game Version" not in o.text for o in rec.options)


def test_missing_fields_are_reported_not_fabricated():
    """空页面不得编造任何字段，只记录缺失。"""
    rec, missing = parse_detail("<html><body></body></html>", "https://flingtrainer.com/trainer/x/")
    assert rec.game_name == ""
    assert rec.game_version == ""
    assert rec.last_updated == ""
    assert rec.options == []
    assert rec.downloads == []
    assert set(missing) >= {"game_name", "game_version", "last_updated", "options", "downloads"}


# --------------------------------------------------------------------- 列表页
def test_extract_detail_links_from_all_trainers():
    links = extract_detail_links(load("all.html"), PATTERNS, "https://flingtrainer.com")
    assert len(links) > 500, f"全量列表页应解析出大量详情页，实际 {len(links)}"
    assert all(l.startswith("https://flingtrainer.com/trainer/") for l in links)
    assert len(set(links)) == len(links), "链接必须去重"
    assert all("#" not in l for l in links), "链接必须去掉锚点"


def test_extract_detail_links_from_paginated_home():
    links = extract_detail_links(load("home.html"), PATTERNS, "https://flingtrainer.com")
    assert len(links) >= 10
    links2 = extract_detail_links(load("p2.html"), PATTERNS, "https://flingtrainer.com")
    assert len(links2) >= 10


# --------------------------------------------------------------------- 版本号
@pytest.mark.parametrize(
    "filename,expected",
    [
        ("Black.Myth.Wukong.v1.0-v1.0.20.Plus.44.Trainer-FLiNG", "v1.0-v1.0.20"),
        ("Black.Myth.Wukong.v1.0.Plus.42.Trainer-FLiNG", "v1.0"),
        ("Sunkenland.v1.0.7.Plus.21.Trainer-FLiNG", "v1.0.7"),
        ("SomeGame.v1.2.3.50.Trainer-FLiNG", "v1.2.3"),
        # 数字-字母数字混合的版本片段，不能被截断成 v1
        ("Age.of.Empires.II.Definitive.Edition.v1.0-Build.169652.Plus.12.Trainer-FLiNG",
         "v1.0-Build.169652"),
        ("Ace.Combat.7.Skies.Unknown.v1.0-v20211019.Plus.11.Trainer-FLiNG", "v1.0-v20211019"),
        ("NoVersion.Trainer-FLiNG", ""),
    ],
)
def test_version_parsing(filename, expected):
    assert parse_version_from_filename(filename) == expected


@pytest.mark.parametrize(
    "raw,expected",
    [("2025.10.17", "2025-10-17"), ("2025-10-17", "2025-10-17"), ("17.10.2025", "2025-10-17"), ("", "")],
)
def test_normalize_date(raw, expected):
    assert normalize_date(raw) == expected


# --------------------------------------------------------------------- robots
def test_downloads_paths_are_never_fetchable():
    policy = RobotsPolicy(
        base_url="https://flingtrainer.com",
        fetch_text=lambda u: (200, "User-agent: *\nDisallow: /downloads/\n"),
        respect=True,
        never_fetch_paths=["/downloads/", "/attachments/"],
    )
    policy.load()
    allowed, reason = policy.can_fetch("https://flingtrainer.com/downloads/abc,,")
    assert allowed is False and reason == "never_fetch_path"
    # 详情页与截图目录应当放行
    assert policy.can_fetch("https://flingtrainer.com/trainer/valheim-trainer/")[0] is True
    assert policy.can_fetch("https://flingtrainer.com/wp-content/uploads/2024/08/1-16.png")[0] is True


def test_robots_fetch_error_is_conservative():
    def boom(url):
        raise RuntimeError("network down")

    policy = RobotsPolicy(
        base_url="https://flingtrainer.com",
        fetch_text=boom,
        respect=True,
        on_fetch_error="disallow",
    )
    policy.load()
    assert policy.can_fetch("https://flingtrainer.com/trainer/x/")[0] is False


def test_robots_404_is_allowed_by_default():
    policy = RobotsPolicy(
        base_url="https://flingtrainer.com", fetch_text=lambda u: (404, ""), respect=True
    )
    policy.load()
    assert policy.can_fetch("https://flingtrainer.com/trainer/x/")[0] is True
