#!/usr/bin/env python
"""通过 Git Trees/Blobs API 把远端 main 的指定目录同步到本地（覆盖）。
用法：python scripts/sync_remote_dir.py [remote_dir]
默认同步 data/。用于 git 协议不可达时，推送前先对齐远端数据，避免覆盖。
"""
from __future__ import annotations

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
        print("取不到 token：请 gh auth login 或设置 GITHUB_TOKEN", file=sys.stderr)
        sys.exit(1)


def main() -> int:
    remote_dir = (sys.argv[1] if len(sys.argv) > 1 else "data").strip("/").rstrip("/") + "/"
    url = subprocess.check_output(["git", "remote", "get-url", "origin"], cwd=ROOT, text=True).strip()
    repo = url.split("github.com", 1)[1].strip("/").removesuffix(".git")

    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {get_token()}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "flingtrainer-sync",
    })

    ref = session.get(f"{API}/repos/{repo}/git/ref/heads/main", timeout=60).json()
    commit_sha = ref["object"]["sha"]
    commit = session.get(f"{API}/repos/{repo}/git/commits/{commit_sha}", timeout=60).json()
    tree_sha = commit["tree"]["sha"]
    tree = session.get(f"{API}/repos/{repo}/git/trees/{tree_sha}?recursive=1", timeout=120).json()

    n = 0
    for item in tree.get("tree", []):
        path = item["path"]
        if item["type"] != "blob" or not path.startswith(remote_dir):
            continue
        blob = session.get(f"{API}/repos/{repo}/git/blobs/{item['sha']}", timeout=60).json()
        content = base64.b64decode(blob["content"])
        dest = ROOT / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)
        n += 1
        print(f"  ↓ {path} ({len(content)} bytes)")
    print(f"同步完成：{n} 个文件来自远端 main（{commit_sha[:7]}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
