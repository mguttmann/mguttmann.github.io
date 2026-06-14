#!/usr/bin/env python3
"""Regenerate the Open-source-contributions (opencode) block in index.html from
the LIVE pull requests Manuel opened on anomalyco/opencode - the SAME source and
honest framing as the profile README's opencode_pr.py.

Public data only -> `gh` with the built-in GITHUB_TOKEN (cross-repo PUBLIC PR
read). Rewrites ONLY between OPENCODE:START / OPENCODE:END. Honest throughout:
opencode is a fork + open PRs (a contribution), never presented as merged/owned.
Defensive: on any fetch error it is a safe no-op. XSS-safe: PR title escaped.
"""
import html
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = "anomalyco/opencode"
AUTHOR = "mguttmann"
INDEX = Path("index.html")
START = "<!-- OPENCODE:START -->"
END = "<!-- OPENCODE:END -->"
GH_ICO = ("M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z")


def kfmt(n: int) -> str:
    return f"{round(n / 1000, 1)}k" if n >= 1000 else str(n)


def strip_prefix(title: str) -> str:
    return re.sub(r"^[a-z]+(\([^)]*\))?!?:\s*", "", title).strip()


def fetch_prs():
    try:
        out = subprocess.run(
            ["gh", "pr", "list", "--repo", REPO, "--author", AUTHOR,
             "--state", "all", "--limit", "200",
             "--json", "number,state,additions,deletions,title"],
            capture_output=True, text=True, check=True,
        ).stdout
        return json.loads(out)
    except Exception as e:  # network / permission / parse -> safe no-op
        print(f"sync_opencode: could not fetch PRs ({e}); leaving page unchanged", file=sys.stderr)
        return None


def build_block(prs) -> str:
    total = len(prs)
    opens = [p for p in prs if p["state"] == "OPEN"]
    closed = sum(1 for p in prs if p["state"] == "CLOSED")
    merged = sum(1 for p in prs if p["state"] == "MERGED")

    if opens:
        head = max(opens, key=lambda p: p["additions"])
        num, add, dele = head["number"], head["additions"], head["deletions"]
        quote = html.escape(strip_prefix(head["title"]))
        pr = f"https://github.com/{REPO}/pull/{num}"
        counts = f"{total} PRs opened in total ({len(opens)} open, {closed} closed"
        counts += f", {merged} merged)." if merged else ")."
        return (
            f'{START}\n'
            f'      <div class="oss">\n'
            f'        <div class="oss-badges">\n'
            f'          <a class="badge" href="{pr}" target="_blank" rel="noopener noreferrer">\n'
            f'            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="{GH_ICO}"/></svg>\n'
            f'            opencode &mdash; contributing via PRs\n'
            f'          </a>\n'
            f'          <a class="badge badge--solid" href="{pr}" target="_blank" rel="noopener noreferrer">\n'
            f'            open&nbsp;PR&nbsp;#{num} &middot; +{kfmt(add)} lines proposed\n'
            f'          </a>\n'
            f'        </div>\n\n'
            f'        <p class="prose">\n'
            f'          <a href="https://github.com/{REPO}" target="_blank" rel="noopener noreferrer"><strong>opencode</strong></a>\n'
            f'          <span class="sub mono">&nbsp;&middot;&nbsp; open-source contribution (TypeScript)</span><br/>\n'
            f'          Active <strong>open-source contributor</strong> to <a href="https://github.com/{REPO}" target="_blank" rel="noopener noreferrer"><code>{REPO}</code></a>\n'
            f'          via pull requests &mdash; working from <a href="https://github.com/{AUTHOR}/opencode" target="_blank" rel="noopener noreferrer">my fork</a>.\n'
            f'          Headlining the <a href="{pr}" target="_blank" rel="noopener noreferrer">open PR&nbsp;#{num}</a>:\n'
            f'          <em>&ldquo;{quote}&rdquo;</em> &mdash;\n'
            f'          <strong>~{kfmt(add)} lines proposed</strong> (<code>+{add:,} / &minus;{dele:,}</code>), <strong>currently open</strong> and awaiting upstream\n'
            f'          review (proposed changes, not yet accepted). {counts}\n'
            f'        </p>\n'
            f'      </div>\n'
            f'      {END}'
        )

    # no open PR right now - honest fallback
    counts = f"{total} PRs opened in total ({closed} closed"
    counts += f", {merged} merged)." if merged else ")."
    return (
        f'{START}\n'
        f'      <div class="oss">\n'
        f'        <div class="oss-badges">\n'
        f'          <a class="badge" href="https://github.com/{REPO}/pulls?q=is%3Apr+author%3A{AUTHOR}" target="_blank" rel="noopener noreferrer">\n'
        f'            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="{GH_ICO}"/></svg>\n'
        f'            opencode &mdash; contributing via PRs\n'
        f'          </a>\n'
        f'        </div>\n'
        f'        <p class="prose">\n'
        f'          <a href="https://github.com/{REPO}" target="_blank" rel="noopener noreferrer"><strong>opencode</strong></a>\n'
        f'          <span class="sub mono">&nbsp;&middot;&nbsp; open-source contribution (TypeScript)</span><br/>\n'
        f'          Active <strong>open-source contributor</strong> to <a href="https://github.com/{REPO}" target="_blank" rel="noopener noreferrer"><code>{REPO}</code></a>\n'
        f'          via pull requests &mdash; working from <a href="https://github.com/{AUTHOR}/opencode" target="_blank" rel="noopener noreferrer">my fork</a>.\n'
        f'          {counts} No PR currently open; proposed changes, none merged.\n'
        f'        </p>\n'
        f'      </div>\n'
        f'      {END}'
    )


def main() -> int:
    prs = fetch_prs()
    if prs is None:
        return 0  # safe no-op
    text = INDEX.read_text(encoding="utf-8")
    if START not in text or END not in text:
        print("sync_opencode: markers not found in index.html", file=sys.stderr)
        return 1
    block = build_block(prs)
    new = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _m: block, text, count=1, flags=re.S)
    if new != text:
        INDEX.write_text(new, encoding="utf-8")
        print("sync_opencode: opencode block updated")
    else:
        print("sync_opencode: no change")
    return 0


if __name__ == "__main__":
    sys.exit(main())
