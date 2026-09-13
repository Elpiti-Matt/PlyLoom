#!/usr/bin/env python3
"""Fill repository links in local documentation. Does not publish or authenticate."""
import argparse
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("owner")
parser.add_argument("--repo", default="PlyLoom")
args = parser.parse_args()
if not all(re.fullmatch(r"[A-Za-z0-9_.-]+", x) for x in [args.owner, args.repo]):
    parser.error("Owner and repository must be GitHub names")
root = Path(__file__).resolve().parents[1]
repository = f"{args.owner}/{args.repo}"
url = f"https://github.com/{repository}"
badge = f"[![Release asset downloads](https://img.shields.io/github/downloads/{repository}/total?label=downloads)]({url}/releases)"
config_path = root / "REPOSITORY.json"
if config_path.exists():
    existing = json.loads(config_path.read_text())
    if existing["repository"] != repository:
        parser.error("Already configured for another repository; edit links deliberately instead of replacing silently")
for path in [root / "README.md", root / "README.ru.md", *sorted((root / "articles").glob("*.md"))]:
    text = path.read_text()
    text = text.replace("{{REPO_URL}}", url).replace("{{DEMO_URL}}", f"https://{args.owner}.github.io/{args.repo}/")
    text = text.replace("<!-- DOWNLOAD_BADGE -->", badge)
    path.write_text(text)
config_path.write_text(json.dumps({"repository": repository, "url": url}, indent=2) + "\n")
print("Local documentation configured for", repository)
