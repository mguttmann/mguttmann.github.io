#!/usr/bin/env python3
"""Regenerate the Featured-projects block in index.html from the LIVE pinned
repositories on the mguttmann profile - the SAME source the profile README uses
(its featured-from-pins workflow reads the identical GraphQL pinnedItems query).

Public data only -> `gh api graphql` with the built-in GITHUB_TOKEN, which has
read access to PUBLIC pinnedItems by default. Rewrites ONLY the text between the
FEATURED:START / FEATURED:END markers, so it can never damage the rest of the
page. Defensive: on any fetch error or zero pins it is a safe no-op (the last
good block stays in place). XSS-safe: all repo-supplied text is HTML-escaped.
"""
import html
import json
import re
import subprocess
import sys
from pathlib import Path

INDEX = Path("index.html")
START = "<!-- FEATURED:START -->"
END = "<!-- FEATURED:END -->"
USER = "mguttmann"

# Official GitHub Linguist colours (cosmetic language dot).
LANG_COLORS = {
    "TypeScript": "#3178c6", "JavaScript": "#f1e05a", "Shell": "#89e051",
    "Python": "#3572A5", "C#": "#178600", "HTML": "#e34c26", "CSS": "#663399",
    "PowerShell": "#012456", "Swift": "#F05138", "HCL": "#844FBA",
    "Go": "#00ADD8", "Rust": "#dea584", "Java": "#b07219", "Dockerfile": "#384d54",
}
REPO_ICO = ("M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 "
            "0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 "
            "1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z")
STAR_ICO = ("M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 "
            "4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 "
            "6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z")


def fetch_pins():
    query = ('{user(login:"%s"){pinnedItems(first:6,types:REPOSITORY){nodes{...on Repository{'
             'name description url primaryLanguage{name} isFork isPrivate stargazerCount}}}}}' % USER)
    try:
        out = subprocess.run(
            ["gh", "api", "graphql", "-f", "query=" + query],
            capture_output=True, text=True, check=True,
        ).stdout
        nodes = json.loads(out)["data"]["user"]["pinnedItems"]["nodes"]
        # BRAND-SAFETY (hard rule): PUBLIC repos only. The built-in CI
        # GITHUB_TOKEN already sees public pins only, but a locally-run broad PAT
        # could see private pins - never render those on the public site.
        return [n for n in nodes if n and not n.get("isPrivate")]
    except Exception as e:  # network / permission / parse -> safe no-op
        print(f"sync_featured: could not fetch pins ({e}); leaving page unchanged", file=sys.stderr)
        return None


def render_card(p) -> str:
    name = html.escape(p.get("name", ""))
    url = html.escape(p.get("url", ""), quote=True)
    desc = html.escape((p.get("description") or "Public repository on GitHub.").strip())
    lang_obj = p.get("primaryLanguage") or {}
    lang = lang_obj.get("name") if isinstance(lang_obj, dict) else None
    color = LANG_COLORS.get(lang, "#9aa5b0")
    stars = int(p.get("stargazerCount", 0) or 0)
    vis = "Fork" if p.get("isFork") else "Public"
    lang_html = (f'<span class="lang"><i class="dot" style="background:{color}" aria-hidden="true"></i>'
                 f'{html.escape(lang)}</span>') if lang else ""
    return (
        f'        <a class="card" href="{url}" target="_blank" rel="noopener noreferrer">\n'
        f'          <div class="card-top">\n'
        f'            <svg class="repoico" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="{REPO_ICO}"/></svg>\n'
        f'            <span class="card-name">{name}</span>\n'
        f'            <span class="vis">{vis}</span>\n'
        f'          </div>\n'
        f'          <p class="card-desc">{desc}</p>\n'
        f'          <div class="card-meta">\n'
        f'            {lang_html}\n'
        f'            <span class="stars"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="{STAR_ICO}"/></svg>{stars}</span>\n'
        f'          </div>\n'
        f'        </a>'
    )


def build_block(pins) -> str:
    if pins:
        cards = "\n".join(render_card(p) for p in pins)
    else:
        cards = '        <p class="thin mono">No pinned repositories yet &mdash; pin a repository on the profile to feature it here.</p>'
    note = ""
    if len(pins) <= 2:
        note = ('\n      <p class="thin mono">More public projects coming soon. '
                '<a href="https://github.com/mguttmann?tab=repositories" target="_blank" rel="noopener noreferrer">'
                'See all repositories on GitHub &rarr;</a></p>')
    return f'{START}\n      <div class="cards">\n{cards}\n      </div>{note}\n      {END}'


def main() -> int:
    pins = fetch_pins()
    if pins is None:
        return 0  # safe no-op
    text = INDEX.read_text(encoding="utf-8")
    if START not in text or END not in text:
        print("sync_featured: markers not found in index.html", file=sys.stderr)
        return 1
    block = build_block(pins)
    new = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _m: block, text, count=1, flags=re.S)
    if new != text:
        INDEX.write_text(new, encoding="utf-8")
        print(f"sync_featured: Featured block updated ({len(pins)} pins)")
    else:
        print("sync_featured: no change")
    return 0


if __name__ == "__main__":
    sys.exit(main())
