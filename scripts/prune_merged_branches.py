#!/usr/bin/env python3
"""Prune merged ForeCode branches safely. Requires gh CLI, logged in.

Default is a dry run; use --apply for deletion with interactive confirmation.
Checks PR status, tip SHAs, protection, and dependency branches.
"""
import argparse
import json
import subprocess
import sys
from urllib.parse import quote

REPOS = ("matthiasdruhl/ForeCode", "matthiasdruhl/AgentHarness-Planning")

def api(path, method="GET"):
    args = ["gh", "api", "-H", "Accept: application/vnd.github+json"]
    if method != "GET":
        args += ["--method", method]
    result = subprocess.run(args + [path], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"GitHub API failed for {path}: {result.stderr.strip()}")
    return json.loads(result.stdout) if result.stdout.strip() else None

def pages(path):
    result = []
    for n in range(1, 100):
        sep = "&" if "?" in path else "?"
        items = api(f"{path}{sep}per_page=100&page={n}")
        if not isinstance(items, list):
            raise RuntimeError(f"Expected list at {path}")
        result.extend(items)
        if len(items) < 100:
            return result
    raise RuntimeError("Pagination safety bound reached")

def classify(repo):
    default = api(f"repos/{repo}")["default_branch"]
    branches = pages(f"repos/{repo}/branches")
    prs = pages(f"repos/{repo}/pulls?state=all")
    by_head, open_refs = {}, set()
    for p in prs:
        head = p.get("head") or {}
        if (head.get("repo") or {}).get("full_name") == repo:
            by_head.setdefault(head.get("ref"), []).append(p)
            if p["state"] == "open":
                open_refs.add(head.get("ref"))
        if p["state"] == "open":
            open_refs.add((p.get("base") or {}).get("ref"))

    eligible, kept = [], []
    for b in branches:
        name, sha = b["name"], b["commit"]["sha"]
        prs_for_branch = by_head.get(name, [])
        reason = ""
        if name == default or b.get("protected"):
            reason = "default/protected branch"
        elif name in open_refs:
            reason = "open PR head or base"
        elif not prs_for_branch:
            reason = "no associated PR"
        elif any(p["state"] == "closed" and not p.get("merged_at")
                 and p["head"]["sha"] == sha for p in prs_for_branch):
            reason = "closed unmerged PR at current tip"
        else:
            merged = [p for p in prs_for_branch if p.get("merged_at")]
            if not merged:
                reason = "no merged PR"
            elif any(p["head"]["sha"] == sha for p in merged):
                eligible.append((repo, name, sha, "exact merged PR tip"))
                continue
            else:
                c = api(f"repos/{repo}/compare/{default}...{sha}")
                if c["ahead_by"] == 0:
                    eligible.append((repo, name, sha, "reachable from default"))
                    continue
                reason = f"{c['ahead_by']} unique commits"
        kept.append((repo, name, sha, reason))
    return eligible, kept

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--repo", action="append", choices=REPOS)
    p.add_argument("--apply", action="store_true")
    opts = p.parse_args()
    targets = opts.repo or REPOS
    snapshots = {}
    for repo in targets:
        eligible, kept = classify(repo)
        snapshots[repo] = eligible
        print(f"\n{repo}: {len(eligible)} safe candidates; {len(kept)} retained")
        for _, name, _, reason in eligible:
            print(f"  DELETE {name} [{reason}]")
        for _, name, _, reason in kept:
            if name != "main":
                print(f"  KEEP   {name} [{reason}]")

    count = sum(len(v) for v in snapshots.values())
    if not opts.apply:
        print(f"\nDry run; no changes. Pass --apply to review and confirm {count} deletions.")
        return 0
    if count == 0:
        return 0
    if input(f"\nType DELETE {count} to remove remote branch refs: ") != f"DELETE {count}":
        print("Cancelled.")
        return 1

    # A second complete snapshot prevents cleanup after PR or branch state changes.
    for repo in targets:
        fresh, _ = classify(repo)
        if [(b, sha) for _, b, sha, _ in fresh] != [
            (b, sha) for _, b, sha, _ in snapshots[repo]
        ]:
            print(f"ABORT: {repo} changed; rerun dry run.", file=sys.stderr)
            return 1

    deleted = 0
    for repo in targets:
        for _, branch, sha, _ in snapshots[repo]:
            # Never delete a ref that moved since classification.
            current = api(f"repos/{repo}/branches/{quote(branch, safe='')}")
            if current["commit"]["sha"] != sha or current.get("protected"):
                print(f"SKIP moved/protected: {repo}:{branch}")
                continue
            api(f"repos/{repo}/git/refs/heads/{branch}", method="DELETE")
            deleted += 1
            print(f"Deleted {repo}:{branch}")
    print(f"\nDeleted {deleted}; historical PR records are retained.")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except FileNotFoundError:
        sys.exit("Install the GitHub CLI and authenticate with gh auth login.")
    except (RuntimeError, KeyError, ValueError) as ex:
        sys.exit(str(ex))
