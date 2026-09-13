#!/usr/bin/env python3
"""Read public GitHub release-asset downloads; never runs in the app."""
import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone


def fetch(repository, page):
    url = f"https://api.github.com/repos/{repository}/releases?per_page=100&page={page}"
    request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "PlyLoom-release-stats"})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def summarize(releases):
    assets = [{"release": release["tag_name"], "name": asset["name"], "downloads": asset["download_count"]}
              for release in releases for asset in release.get("assets", [])]
    return {"metric": "release_asset_downloads_not_unique_users", "total": sum(a["downloads"] for a in assets), "assets": assets}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repository", help="OWNER/REPO")
    parser.add_argument("--fixture", help="Use a saved releases JSON instead of the network")
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repository):
        parser.error("Expected OWNER/REPO")
    if args.fixture:
        with open(args.fixture, encoding="utf-8") as file:
            releases = json.load(file)
    else:
        releases, page = [], 1
        try:
            while True:
                batch = fetch(args.repository, page)
                if not isinstance(batch, list):
                    raise ValueError("Unexpected GitHub response")
                releases.extend(batch)
                if len(batch) < 100:
                    break
                page += 1
        except Exception as error:
            print(f"Could not read GitHub statistics: {error}", file=sys.stderr)
            return 1
    result = summarize(releases)
    result.update(repository=args.repository, checked_at=datetime.now(timezone.utc).isoformat())
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
