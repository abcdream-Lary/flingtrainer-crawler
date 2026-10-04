#!/usr/bin/env python
"""备用推送通道：通过 GitHub Git Data API 提交代码，绕过 git 协议。

为什么需要这个脚本：
    部分网络环境下 github.com（git 协议端点）不可达，直连超时、走代理报
    502 CONNECT tunnel failed，git push 会失败：
        fatal: unable to access 'https://github.com/...':
        schannel: server closed abruptly (missing close_notify)
    但 api.github.com 通常是通的，所以可以改走 REST API 完成推送。

    注意：这只影响**本地**推送。GitHub Actions runner 运行在 GitHub 内部网络，
    crawl.yml 里的 git push 不受影响，定时采集与自动提交照常工作。

用法：
    python scripts/push_via_api.py
    python scripts/push_via_api.py -m "fix: 修正解析规则"
    python scripts/push_via_api.py --repo your-name/your-repo

依赖：gh CLI（用于取 token）、requests
"""

from __future__ import annotations

import argparse
import base64
import subprocess
import sys
from pathlib import Path

import requests

API = "https://api.github.com"
ROOT = Path(__file__).resolve().parents[1]


def get_token() -> str:
    try:
        return subprocess.check_output(["gh", "auth", "token"], text=True).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("取不到 token：请先安装 gh 并执行 `gh auth login`，"
              "或设置环境变量 GITHUB_TOKEN", file=sys.stderr)
        sys.exit(1)


def detect_repo() -> str:
    try:
        url = subprocess.check_output(
            ["git", "remote", "get-url", "origin"], cwd=ROOT, text=True
        ).strip()
    except subprocess.CalledProcessError:
        return ""
    if "github.com" not in url:
        return ""
    tail = url.split("github.com", 1)[1].strip("/").removesuffix(".git")
    return tail.replace("/", "/", 1)


def main() -> int:
    parser = argparse.ArgumentParser(description="通过 Git Data API 推送（绕过 git 协议）")
    parser.add_argument("--repo", help="owner/name，默认取 git remote origin")
    parser.add_argument("-m", "--message", help="提交信息")
    parser.add_argument("--force", action="store_true", help="允许非快进（会覆盖远端历史）")
    args = parser.parse_args()

    repo = args.repo or detect_repo()
    if not repo:
        print("未指定仓库，且无法从 git remote origin 推断，请用 --repo 指定", file=sys.stderr)
        return 1

    dirty = subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip()
    if dirty:
        print("注意：工作区有未提交改动，以下推送的是工作区当前内容：")
        print("\n".join(f"  {line}" for line in dirty.splitlines()[:10]))

    files = [f for f in subprocess.check_output(
        ["git", "ls-files"], cwd=ROOT, text=True).splitlines() if f]

    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {get_token()}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "flingtrainer-push",
    })

    def call(method: str, path: str, payload: dict | None = None, allow_404: bool = False):
        resp = session.request(method, f"{API}{path}", json=payload, timeout=180)
        if resp.status_code == 404 and allow_404:
            return None
        if resp.status_code >= 300:
            print(f"ERR {resp.status_code} {method} {path}\n{resp.text[:800]}", file=sys.stderr)
            sys.exit(1)
        return resp.json()

    # 以远端当前 main 为基线，保证是快进推送，不覆盖别人（含 Actions）的提交
    base = call("GET", f"/repos/{repo}/git/ref/heads/main", allow_404=True)
    if base is None:
        init = call("PUT", f"/repos/{repo}/contents/README.md", {
            "message": "chore: 初始化仓库",
            "content": base64.b64encode((ROOT / "README.md").read_bytes()).decode(),
            "branch": "main",
        })
        base_commit, base_tree = init["commit"]["sha"], init["commit"]["tree"]["sha"]
        print("远端为空，已初始化仓库", base_commit)
    else:
        base_commit = base["object"]["sha"]
        base_commit_obj = call("GET", f"/repos/{repo}/git/commits/{base_commit}")
        base_tree = base_commit_obj["tree"]["sha"]
        print(f"基线 commit {base_commit[:7]}")

    print(f"推送 {len(files)} 个文件到 {repo}")
    entries = []
    for rel in files:
        data = (ROOT / rel).read_bytes()
        try:
            payload = {"content": data.decode("utf-8")}
        except UnicodeDecodeError:
            payload = {"content": base64.b64encode(data).decode(), "encoding": "base64"}
        blob = call("POST", f"/repos/{repo}/git/blobs", payload)
        entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})

    tree = call("POST", f"/repos/{repo}/git/trees", {"base_tree": base_tree, "tree": entries})
    message = args.message or f"chore: 同步本地改动 {len(files)} 个文件"
    commit = call("POST", f"/repos/{repo}/git/commits",
                  {"message": message, "tree": tree["sha"], "parents": [base_commit]})
    ref = call("PATCH", f"/repos/{repo}/git/refs/heads/main",
               {"sha": commit["sha"], "force": bool(args.force)})

    print(f"完成 commit {commit['sha'][:7]}  ->  {ref['object']['sha'][:7]}")
    print(f"https://github.com/{repo}/commit/{commit['sha']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
