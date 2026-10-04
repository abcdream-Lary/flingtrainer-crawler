# flingtrainer-crawler

长期跟踪采集 [风灵月影修改器站点](https://flingtrainer.com/) 全部修改器页面的结构化采集器。
Python + requests + BeautifulSoup，配置与代码分离，GitHub Actions 定时运行并自动提交数据。

---

## 一、它采集什么

遍历列表页拿到全部修改器详情页 URL（当前全站 **757** 个），逐页抓取并提取：

| 字段 | 说明 | 真实来源 |
| --- | --- | --- |
| `game_name` | 游戏名称（标题） | `h1.post-title` |
| `game_version` | 游戏版本 | 元信息行 `Game Version: v1.0-v1.0.20+` |
| `last_updated` | 最后更新日期（归一为 `YYYY-MM-DD`） | 元信息行 `Last Updated: 2025.10.17` |
| `options` | 选项/功能条目，**保留原始文本** | `Options` 区块内以 `<br>` 分隔的条目 |
| `options[].note` | 条目补充说明 | 页面 tooltip 脚本 |
| `notes` | 页面 Notes 区块 | 与选项区分存放 |
| `screenshots` | 截图**原图 URL**（不下载文件，见「截图与图床」一节） | 正文 `/wp-content/uploads/` 图片，取 `srcset` 最大尺寸 |
| `cover_image` | **封面图 URL**（游戏标题图/横幅，用于列表卡片与详情大图） | 页面 `og:image`（缺省回退 `twitter:image`） |
| `downloads` | **当前版本 + 全部归档历史版本**，含版本号与文件名 | `table.da-attachments-table` 每一行 |

另有 `options_count`、`options_extracted`、`published_date`、`categories`、`content_hash`、
`first_seen`、`last_crawled`、`missing_fields` 等辅助字段。

一条记录长这样（节选）：

```json
{
  "url": "https://flingtrainer.com/trainer/black-myth-wukong-trainer/",
  "slug": "black-myth-wukong-trainer",
  "game_name": "Black Myth: Wukong Trainer",
  "game_version": "v1.0-v1.0.20+",
  "options_count": 44,
  "options_extracted": 44,
  "last_updated": "2025-10-17",
  "options": [
    { "index": 1, "text": "Num 1 – God Mode/Ignore Hits",
      "note": "When activated, enemies won't be able to damage you, but you may still receive status damage." }
  ],
  "screenshots": [
    { "original_url": "https://flingtrainer.com/wp-content/uploads/2024/08/1-16.png",
      "alt": "Black Myth: Wukong Trainer/Cheat",
      "local_path": "", "downloaded": false, "bytes": 0 }
  ],
  "downloads": [
    { "file_name": "Black.Myth.Wukong.v1.0-v1.0.20.Plus.44.Trainer-FLiNG",
      "version": "v1.0-v1.0.20", "url": "https://flingtrainer.com/downloads/J0ZX9_hiI3QYHi9EG5A7vw,,",
      "date_added": "2025-10-17 10:38", "file_size": "922 KB", "download_count": 1321470, "is_latest": true },
    { "file_name": "Black.Myth.Wukong.v1.0-v1.0.13.Plus.44.Trainer-FLiNG",
      "version": "v1.0-v1.0.13", "url": "https://flingtrainer.com/downloads/09FVUQoWfXiHQVRrOTOHFw,,",
      "date_added": "2024-12-14 05:15", "file_size": "937 KB", "download_count": 2157811, "is_latest": false }
  ],
  "missing_fields": []
}
```

> **字段缺失一律留空，并写入 `data/logs/missing_fields.jsonl`，不做任何推测填充。**
> 例如页面若没有 `Game Version` 行，`game_version` 就是 `""`，同时在 `missing_fields` 里记一笔。
> 若实际提取的选项数与页面声明数不一致（少，或混入了小标题等非选项文本），
> 会记 `options_mismatch` 供人工排查——同样不裁剪、不补全。

---

## 二、合规策略（重要）

站点 `https://flingtrainer.com/robots.txt` 明确声明：

```
User-agent: *
Disallow: /downloads/
Disallow: /attachments/
Disallow: /cn/community/
Disallow: /wp-admin/
Disallow: /?s=
```

因此本项目：

1. **下载链接只采集、不请求。** 所有 `/downloads/...` 链接仅作为元数据（URL、文件名、版本号、
   日期、下载次数）入库，`RobotsPolicy` 里用 `never_fetch_paths` 硬拦截，请求链路根本发不出去。
   这既是遵守 robots.txt，也规避了修改器二进制的分发与版权风险。
2. **每次请求前校验 robots**，被拦截的 URL 记为 `skipped_robots`，不计入失败重试。
3. **尊重 `Crawl-delay`**：若 robots.txt 给出比配置更大的间隔，自动以其为准。
4. **robots.txt 抓取失败时保守处理**（默认 `on_fetch_error: disallow`，即全部禁止），
   `404` 则按 RFC 9309 视为放行——两者都可在配置里改。

> 数据仅供个人研究/归档。若要公开分发或商用，请先自行取得站点授权并复核目标站点的服务条款。

---

## 三、快速开始

```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python run.py crawl                       # 增量采集（默认）
python run.py crawl --mode full           # 全量采集
python run.py crawl --limit 20 --no-screenshots   # 小样本调试
python run.py retry-failed                # 只重跑上一轮失败的 URL
python run.py stats                       # 查看当前数据概况
python run.py export                      # 不联网，按现有数据重新导出 JSON

python -m pytest tests -q                 # 解析测试（基于真实页面快照，无需联网）

python examples/query_demo.py --search wukong   # 查询已采集的数据（详见第四节）
```

也可以用模块方式：`python -m flingcrawler crawl --mode full`（需 `PYTHONPATH=src`）。

---

## 四、如何调用这些数据

### 4.1 数据文件与体积

| 文件 | 内容 | 全站 757 条约 |
| --- | --- | --- |
| `data/json/trainers.json` | 全量数组，含 `meta` 本轮运行信息 | 4.4 MB |
| `data/json/trainers.ndjson` | 每行一条记录，流式友好 | 3.1 MB |
| `data/json/index.json` | 只有统计元信息，不含记录体 | < 1 KB |
| `data/changelog/YYYY-MM-DD.jsonl` | 当天变更明细 | 视变化量 |

先读 `index.json` 探一眼（本轮新增/更新/删除数、耗时、HTTP 统计），
再决定要不要拉全量。

### 4.2 不开仓库，直接远程读

推送到 GitHub 后就是静态文件，可以纯 HTTP 取，不用 clone：

```text
# jsDelivr CDN：国内通常更快，单文件上限 20 MB（当前 3~4 MB，够用）
https://cdn.jsdelivr.net/gh/abcdream-Lary/flingtrainer-crawler@main/data/json/trainers.ndjson

# GitHub raw：兜底方案
https://raw.githubusercontent.com/abcdream-Lary/flingtrainer-crawler/main/data/json/trainers.ndjson
```

上面就是本仓库的真实地址，可以直接用。fork 之后请换成你自己的。

```python
import json
import requests

url = "https://cdn.jsdelivr.net/gh/abcdream-Lary/flingtrainer-crawler@main/data/json/trainers.ndjson"
with requests.get(url, stream=True, timeout=60) as resp:
    resp.raise_for_status()
    for line in resp.iter_lines(decode_unicode=True):
        if line:
            rec = json.loads(line)          # 边下边解析，不用等整个文件
            print(rec["game_name"], rec["game_version"])
```

### 4.3 本地读取

```python
import json

with open("data/json/trainers.json", encoding="utf-8") as fh:
    records = json.load(fh)["records"]

by_slug = {r["slug"]: r for r in records}
rec = by_slug["black-myth-wukong-trainer"]

print(rec["game_version"])                       # v1.0-v1.0.20+
print(rec["options"][0]["text"])                 # Num 1 – God Mode/Ignore Hits
print(rec["screenshots"][0]["original_url"])     # 截图原图 URL
print(rec["downloads"][0]["file_name"])          # 当前版本文件名
```

全量 4 MB 一次读入没有压力；想省内存就改读 `trainers.ndjson` 逐行处理。

### 4.4 常用查询：`examples/query_demo.py`

仓库里带了一个可直接运行的示例脚本（只依赖 `requests`，不依赖本项目源码，可单独拷走）：

```bash
python examples/query_demo.py --slug black-myth-wukong-trainer  # 按 slug 取单条
python examples/query_demo.py --search wukong                   # 按游戏名搜索
python examples/query_demo.py --days 7                          # 最近 7 天更新过
python examples/query_demo.py --updated-since 2026-10-01        # 指定日期之后
python examples/query_demo.py --remote                          # 从 CDN 读
python examples/query_demo.py --file path/to/trainers.ndjson    # 指定文件
```

里面的函数也可以直接 import 复用：

```python
from examples.query_demo import (
    load_all, iter_records, load_remote, index_by_slug, search,
    updated_since, latest_download, all_versions, is_changed,
    option_texts, hotkey_options,
)

records = load_all()
latest_download(rec)   # 当前版本的下载项（is_latest=True 那条）
all_versions(rec)      # ["v1.0-v1.0.20", "v1.0-v1.0.13", ...] 含全部归档历史版本
option_texts(rec)      # 选项纯文本列表
hotkey_options(rec)    # 只保留带热键的选项（见下方说明）
is_changed(old, new)   # 比 content_hash，判断是否变化
```

**关于选项里的分组小标题**：部分页面会在选项区夹带分组标题或说明文字
（如 `Character Editor`、`Edit Player Stats`、`Special Notes`、反作弊说明），它们不是
真正的热键选项。解析器按"保留原始文本、不臆造"的原则**照单全收**，
所以这类页面的 `options_extracted` 会比 `options_count` 多，并记 `options_mismatch`。

调用方想要干净的选项列表，用 `hotkey_options(rec)` 滤一遍即可 ——
实测 15 个样本页过滤后**条数与页面声明数全部精确一致**（15/15）。

> **注意**：`downloads[].url` 是 `/downloads/...` 链接，站点 robots.txt 明确禁止抓取，
> 本项目也从未请求过它们，只记录 URL 与文件名。
> 调用方若要实际访问这些链接，请自行判断合规性与风险。

### 4.5 用变更日志做下游触发

`data/changelog/YYYY-MM-DD.jsonl` 每行一条变更：

```json
{"timestamp":"2026-10-04T05:41:30+00:00","url":"...","slug":"...",
 "change_type":"updated","fields_changed":["downloads","game_version"],
 "before":{...},"after":{...}}
```

- `change_type = new` —— 新出现的修改器
- `change_type = updated` 且 `fields_changed` 含 `downloads` —— 有新版本发布
- `data/changelog/latest.json` —— 当天汇总计数，适合做健康检查

筛出"今天有新版本"的修改器：

```python
import json

with open("data/changelog/2026-10-04.jsonl", encoding="utf-8") as fh:
    for line in fh:
        e = json.loads(line)
        if e["change_type"] in ("new", "updated") and "downloads" in e["fields_changed"]:
            print(e["slug"], e["after"]["game_version"])
```

### 4.6 命令行：jq

```bash
# 按更新时间倒序看游戏名
jq -r '.records[] | "\(.last_updated)\t\(.game_name)"' data/json/trainers.json | sort -r | head

# 按名字搜
jq '.records[] | select(.game_name | test("Wukong"; "i"))' data/json/trainers.json

# NDJSON：筛出某日期之后更新的 slug
jq -r 'select(.last_updated >= "2026-09-27") | .slug' data/json/trainers.ndjson
```

### 4.7 规模提醒

jsDelivr 单文件上限 20 MB，目前全站 3~4 MB 安全。
若数据长期增长超限，改用 GitHub raw 或 `git clone`；也可以只取
`data/changelog/` 做增量消费，不必每次拉全量。

---

## 五、目录结构

```
flingtrainer-crawler/
├── config/config.yaml         # 唯一配置入口：站点、限速、重试、模式、输出路径
├── src/flingcrawler/
│   ├── config.py              # 配置加载（YAML + 默认值 + 环境变量覆盖）
│   ├── models.py              # 数据模型、版本号解析、内容哈希
│   ├── robots.py              # robots.txt 合规层
│   ├── fetcher.py             # 限速 / 重试 / 条件请求
│   ├── parsers/
│   │   ├── listing.py         # 列表页与分页遍历
│   │   └── detail.py          # 详情页字段抽取
│   ├── store.py               # JSON 导出、截图落盘、状态与日志
│   ├── pipeline.py            # 采集编排（全量/增量、断点续跑、变更检测）
│   ├── logging_setup.py
│   └── cli.py
├── scripts/
│   └── push_via_api.py       # 备用推送通道：git 协议不通时走 Git Data API
├── examples/
│   └── query_demo.py          # 数据调用示例：读取、搜索、筛选、远程直连
├── tests/
│   ├── fixtures/*.html        # 真实页面快照（含新旧两种版式）
│   └── test_parsers.py
├── data/
│   ├── json/                  # trainers.json / trainers.ndjson / index.json
│   ├── screenshots/<slug>/    # 图片落盘位置（当前不下载，接图床后启用）
│   ├── logs/                  # failed.jsonl / failed_history.jsonl / missing_fields.jsonl / crawler.log
│   ├── changelog/             # YYYY-MM-DD.jsonl + latest.json
│   └── state/state.json       # 断点续跑 + 条件请求缓存
├── .github/workflows/         # crawl.yml（定时采集+提交）、ci.yml（测试）
└── README.md
```

---

## 六、增量策略

三种模式（`--mode`，默认取 `config.crawl.mode`）：

| 模式 | 用途 | 每轮代价 |
| --- | --- | --- |
| `smart` | **日常巡检（默认）** | 列表页发现 + 1 个 feed + 新增页 + 约 80 个存量页 ≈ 100 请求 |
| `full` | 首次建库、周度校对、解析器变更后回填 | 757 页 ≈ 28 分钟 |
| `incremental` | 旧式实现（靠时间窗轮询），保留兼容 | 视 `skip_if_crawled_within_days` 而定 |

### smart 模式怎么做到"自动增删改"

1. **列表页发现**（本就必需，代价低）→ 得到全站 slug 集合；
   与 `state.entries` 做差集：
   - 发现集合里有、状态里没有 → **新增**（全抓）
   - 状态里是 `done`、发现集合里没有 → **下架**（标记 `removed`，无需抓取详情页）
2. **RSS/Atom 变更提示**：抓 `crawl.smart.feed_urls`（默认 `/feed/`，1 个请求返回
   最近 20 条更新及其精确时间）。凡 `feed 时间 > 该页 last_crawled` 的页面 → 重抓。
3. **轮询兜底**：feed 只覆盖最近 20 条，其余存量页面按「**最久未抓优先**」
   每轮抽查 `crawl.smart.refresh_budget_per_run`（默认 80）个。
   757 / 80 ≈ **每 10 天全站兜底覆盖一遍**，积压数会打印在日志里。

因此日常每天只需 **~100 个请求**（约 3 分钟）就能覆盖新增、下架与更新；
周一的全量用于兜底校对。三级内容过滤（条件请求 + 内容哈希）在 smart 模式下仍然生效。

4. **时间窗**（仅 `incremental`）：`crawl.skip_if_crawled_within_days`，
   距上次成功抓取 N 天内直接跳过。
5. **条件请求**：携带 `If-None-Match` / `If-Modified-Since`（ETag 与 Last-Modified 存于
   `data/state/state.json`）。命中 **304** 时连解析都跳过，直接沿用上次记录。
6. **内容哈希**：解析后计算 `content_hash`（覆盖标题/版本/更新日期/选项/截图 URL/下载列表，
   不含抓取时间等运行态字段）。只有哈希真正变化才判定为 `updated`、
   才重写变更日志、才重新下载截图。

`--mode full` 忽略时间窗（但仍享受条件请求与内容哈希）；
`--force` 连条件请求也禁用，强制拿完整正文。删除判定只在「完整发现」时生效，
带 `--limit` / `only_slugs` 的部分运行绝不会误删数据。

---

## 七、稳健性

| 能力 | 实现 |
| --- | --- |
| 限速 | 请求间隔在 `[min_interval_seconds, max_interval_seconds]` 随机抖动，默认 1.5–3.0s |
| 失败重试 | 默认 3 次指数退避；对 429/500/502/503/504 重试；**优先遵循 `Retry-After`** |
| 断点续跑 | 每 20 个页面存一次 `data/state/state.json`；`Ctrl+C` 优雅退出并保存，下次运行自动续跑 |
| 失败可重跑 | 失败 URL 写入 `data/logs/failed.jsonl`，`python run.py retry-failed` 单独重跑，**成功即从列表移除**；全部失败还会累积进 `failed_history.jsonl` |
| 列表页容错 | `/all-trainers/` 与 `/page/N/` 双来源取并集；任一来源失败不影响另一个 |
| 幂等导出 | JSON 写入采用临时文件 + `os.replace` 原子替换，中断不会留下半截文件 |

被 robots 拦截 与 真实抓取失败 是分开统计的：前者是合规行为，不算失败、不重试。

---

## 八、配置说明

全部集中在 `config/config.yaml`，常用项：

```yaml
site:
  listing:
    mode: "both"            # all_trainers | paginated | both
http:
  min_interval_seconds: 1.5
  max_retries: 3
  conditional_get: true
crawl:
  mode: "incremental"       # full | incremental
  skip_if_crawled_within_days: 0
media:
  download_screenshots: false   # 当前只采集图片 URL，不下载文件
  max_screenshots_per_page: 5
```

CI 里不想改文件，可用环境变量覆盖：`FLING_CRAWL_MODE`、`FLING_CRAWL_LIMIT`、
`FLING_MIN_INTERVAL`、`FLING_USER_AGENT`。

---

## 九、GitHub Actions

`crawl.yml`：

- **每天一次，北京时间 10:23（UTC 02:23）**
- **周一那次自动走全量**（脚本按 UTC 星期判断），其他天按时间窗轮询
- 只配了一条 cron。若再单加一条"周一全量"，周一当天会连跑两次全量，白费 30~40 分钟
- 支持 `workflow_dispatch` 手动指定 `mode` / `limit` / `screenshots`
- `concurrency.group` 保证同一时刻只有一个任务在跑，避免并发打站点
- 数据有变化才 `git commit && git push`；无变化跳过
- 截图与变更日志上传为 Artifact（分别保留 7 / 90 天）

### 「增量」的真实行为（别被名字误导）

站点详情页的 `last-modified` 响应头几乎每次请求都在变（CDN 缓存所致），
实测**条件请求 304 命中率接近 0**。所以"增量"并没有靠 HTTP 缓存省下流量，
真正的机制是**时间窗 + 内容哈希**：

| 阶段 | 行为 |
| --- | --- |
| 第 1 天 | 全量抓 757 页，每页记 `last_crawled` |
| 第 2~4 天 | 每天照常触发，但全部命中时间窗被跳过，几秒结束 |
| 第 5 天 | 时间窗过期，再全量抓一轮，比对哈希决定谁变了 |

也就是说 **`--since-days 3` 的实际效果是「约每 4 天全量轮询一次」**，
而不是"每天只抓变化的那几个页面"。这是这个规模下的务实取舍：
一轮全量约 30–40 分钟、消耗约 100 MB 流量，对站点压力可接受，
换来的是绝不漏抓（哈希比对保证只把真正变化的页面写进变更日志）。

想调整频率就改 `crawl.yml` 里的 `since` 值：

- `since=0` 或 `1` —— 真正的每日全量，变化发现延迟 ≤1 天，消耗约 1050 分钟/月
- `since=3`（当前）—— 约每 4 天全量，约 300 分钟/月
- `since=7` —— 约每 8 天全量

公开仓库每月有 2000 分钟免费 Actions 额度，上面几档都够用。

### 两个必须知道的坑

1. **GitHub 的定时任务不保证准时。** 定时任务在高峰期会被排队，实际启动时间
   可能比设定时间晚 5–30 分钟；负载高时还可能被延后更久。

2. **公开仓库连续 60 天无活动，GitHub 会自动禁用定时任务**（并给仓库所有者发邮件）。
   站点数据天天在变、仓库每月都有自动数据提交，一般不会触发；
   但如果你长期不登录 GitHub、仓库也没有任何活动，定时任务会悄悄停掉。
   收到 GitHub 的提醒邮件时，重新登录或随便推一次提交即可恢复。

`ci.yml`：PR 与 push 时跑解析测试 + 2 页冒烟抓取 + 导出校验。

首次使用请确认仓库 `Settings → Actions → General → Workflow permissions` 为
**Read and write permissions**（工作流需要提交数据）。若仓库是新建的，默认往往是
Read-only，需要改一次，否则「提交数据」步骤会因权限不足失败。

### 本地 git 推送不通时的备用方案

定时采集与自动提交发生在 GitHub Actions runner 上（GitHub 内部网络），**不受本地网络影响**，
照常工作。但你自己的机器若连不上 `github.com`（git 协议端点），会出现：

```text
fatal: unable to access 'https://github.com/<owner>/<repo>/':
schannel: server closed abruptly (missing close_notify)
```

这种情况通常是本地网络环境所致（`api.github.com` 往往仍然通）。可以用仓库里的备用脚本，
它改走 Git Data API 完成推送，且以远端当前 `main` 为基线，属快进推送，不会覆盖
Actions 的数据提交：

```bash
pip install requests && gh auth login     # 一次性
python scripts/push_via_api.py -m "chore: 同步本地数据"
python scripts/push_via_api.py --repo <owner>/<repo>
```

---

## 十、截图与图床

**当前策略：只采集并保存原图 URL，不下载任何图片文件。**

- 配置 `media.download_screenshots: false`（默认值），因此 `data/screenshots/` 目录
  **根本不会被创建**，产出里只有纯 JSON。
- 每条记录的 `screenshots[].original_url` 保存的是**原图直链**——解析时会在 `src`
  与 `srcset` 之间挑最大尺寸，拿到的是 `1926w` 这类全分辨率地址，不是缩略图。
- `local_path` / `downloaded` / `bytes` 三个字段保留在数据模型里，当前恒为
  `"" / false / 0`，不臆造内容。

好处很明显：不下载图片后，一次全量采集的请求数与流量大约降一半（实测 15 页从
30 个请求降到 18 个，且不再有 MB 级的图片传输），跑得更快，对站点也更友好。

### 以后接图床怎么改

1. 把 `config.yaml` 的 `media.download_screenshots` 改回 `true`，图片会落到
   `data/screenshots/<slug>/`（该目录只在真正保存时才创建）。
2. 若要改为**上传图床**：替换 `src/flingcrawler/store.py` 里的 `save_screenshot()`，
   改成上传到图床并把返回的 URL 回填到 `Screenshot.local_path`，同时置
   `downloaded = true`。采集编排层 `pipeline._download_screenshots()` 无需改动。
3. 若要把图片提交进 Git，用 Git LFS（不要让仓库直接堆二进制）：
   ```bash
   git lfs install
   git lfs track "data/screenshots/**"
   ```
   并把 `.gitignore` 里的 `data/screenshots/` 删掉。

反向操作：`python run.py crawl --no-screenshots` 可在单次运行里临时关闭下载。

---

## 十一、展示网站

`site/` 内是一个**零依赖纯静态**的修改器展示站（双击 `index.html` 即可打开，
无需服务器、无需构建、无任何 npm 依赖）。视觉为「夜航机库」HUD 语言：
深色优先的深空蓝档案库（蓝图网格 + 颗粒噪点 + HUD 角标取景框 + 扫光），
克莱因蓝 `#0047E1` 主体、青 `#34CDFE` 电流点缀，数字代号使用 Chakra Petch 展示字体；
浅色主题对应「蓝图图纸」质感。首页「数据更新」显示本站数据快照时间
（精确到秒），游戏自身更新日期源站仅提供日粒度。

功能：

- **双视图 Tab**：导航栏（主题按钮左侧）提供「图鉴 / 分类」切换——
  图鉴页只留搜索 + 排序 + 卡片流；统计信息（收录游戏/功能选项/历史版本/
  数据更新）与分类、标签筛选集中在「分类」页，支持 `?view=cats` 深链
- **双语界面**：默认中文，卡片主标题为中文游戏名、下方小字英文原名；
  点击右上角 `EN` 整体反转为主英文。语言记忆在 localStorage，也可用 `?lang=en`
- **汉化映射**：游戏名/分类/标签的中文来自人工维护的
  `site/assets/js/catalog.js`（键 = slug）。**只收录有把握的译名**，
  没有官方译名的游戏回退显示英文原名，绝不机器翻译或猜测。
  当前 757 款中 **700 款有中文名（92.5%）**、分类覆盖 700 款（仅 57 款未分类）
- **汉化缺口分析工具**：`node scripts/analyze_i18n.js` 会基于当前数据统计
  选项命中率、未命中短语频次榜与缺译游戏清单，用于持续补词库
- **搜索**：中英文任一语言均可命中（中文查 `catalog` 译名，英文查原名/slug），
  快捷键 `/` 聚焦搜索框
- **筛选**：分类 + 标签双层 chips，计数实时；排序支持最近更新/选项最多/版本最多/名称
- **详情子页面**：点击卡片进入 `#/t/<slug>` 子页面（支持深链/浏览器前进后退，
  返回列表自动恢复滚动位置）。重要信息放大展示（大标题 + 最新版本/最近更新/
  选项数/版本数四宫格 + 「下载最新版」直达按钮），功能选项为紧凑双列布局
- **选项描述汉化**：`site/assets/js/translator.js` 内置热键拆分 + 短语/模式/名词
  三层规则词库，中文界面下 85% 以上的选项描述自动翻译（如
  `Num 2 – Infinite Machine Gun Ammo` → 无限机枪弹药），每条保留英文原注；
  **未命中的短语保留英文原文，绝不臆造**
- **下载链接直达**：详情页「下载最新版」与每个历史版本均可一键下载。
  源站自 2026/10 起对新版文件做了 Referer 子串校验（Referer 需含
  `flingtrainer.com`），本站在页面 URL 常驻 `?ref=flingtrainer.com` 并用
  `unsafe-url` 策略发送完整 Referer 以通过校验；若环境无法发送 Referer
  （如 file:// 本地打开），可改用「到源站页面」在源站内下载。
  仅使用源站链接，不代理、不镜像文件（遵循 robots.txt 不对文件发起爬取请求）
- **预览图放大**：详情页大图与预览图墙均可点击进入 lightbox，**打开的一定是你点击的那张**
  （图集 = 封面 + 全部截图，按真实下标定位）。支持滚轮缩放（以光标为锚点，100%–800%）、
  按住拖动平移、双击放大/还原、`+/-/0` 快捷键、工具条（缩放百分比 / 适应窗口 / 1:1 原始尺寸）、
  `←/→` 或按钮切换图片、Esc 或点击空白处关闭；图片按窗口自适应，任何尺寸都完整可见
- **图片加载兜底**：源站图片加载失败时自动切换 wsrv.nl 图片代理重试，
  仍失败则回退首字母占位图
- **精细化 UI**：全局统一无衬线字体、定制细圆角滚动条（含深浅色适配）、
  排序下拉框去系统样式并同步主题
- 无限滚动加载、搜索防抖、URL 参数同步（`?q=&cat=&tag=&sort=&lang=`）

数据流：爬虫产出 `data/json/trainers.json` →
`python scripts/build_web_data.py` 生成 `site/assets/js/data.js`（内联数据，
规避 file:// 的 CORS 限制）→ GitHub Actions 每次采集完成后自动重建并随数据一起提交。

> **静态资源缓存**：GitHub Pages 对静态资源返回 `Cache-Control: max-age=600`，
> 直接改 JS/CSS 后访客最长 10 分钟仍可能看到旧版。为此 `build_web_data.py` 构建时
> 会按**文件内容哈希**给 `index.html` 里的本地资源自动追加 `?v=<sha1>`：
> 内容变则 URL 变（浏览器立即拉新），内容没变则 URL 不变（不产生多余 diff）。
> 因此**本地改完前端资源后，先跑一次 `python scripts/build_web_data.py` 再提交**。

本地预览：

```bash
python scripts/build_web_data.py     # 数据变更后重建
cd site && python -m http.server 8123   # 或直接双击 index.html
```

部署 GitHub Pages：仓库 `Settings → Pages → Build and deployment →
Source: Deploy from a branch`，目录选 `/docs` 或根目录均可
（若选根目录，站点入口即 `https://<owner>.github.io/<repo>/site/`；
也可把 `site/` 内容复制到 `gh-pages` 分支根目录得到干净域名）。

---

## 十二、已知边界

- 版本号是从下载文件名里**按规则解析**的启发式结果（如 `v1.0-v1.0.20`、
  `v1.0-Build.169652`）；文件名不符合惯例时该字段为空，并计入 `missing_fields`，不做猜测。
- 选项条目按原始文本全量保留，可能夹带分组小标题，调用方用
  `hotkey_options()` 过滤（详见第四节）。
- `missing_fields.jsonl` 与 `failed.jsonl` 是**本轮**报告，每次运行覆盖；
  跨轮次的失败记录累积在 `failed_history.jsonl`。
- 站点若改版导致选择器失效，测试里的真实快照会第一时间报错，
  此时按新的 DOM 调整 `src/flingcrawler/parsers/detail.py` 即可。
