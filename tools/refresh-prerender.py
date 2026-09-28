#!/usr/bin/env python3
"""Re-generate the pre-rendered markup blocks inside index.html.

WHY THIS EXISTS
---------------
The Pinned grid, the repository list and the Stack are built by
assets/js/main.js. A client that does not run JavaScript (link-preview
crawlers, AI crawlers, plain curl) would see empty containers and no project
names. This script writes the markup main.js produces into index.html as real
HTML, so that content is present without JavaScript. main.js reads that markup
back as its starting data and then tries to replace it with the live data
contracts, so JavaScript visitors see the current list whenever the fetch works.

There is deliberately NO workflow and NO cron running this: the site repo gets
no scheduled job with write access to the landing page. Run it locally:

    python3 tools/refresh-prerender.py                  # fetch live, rewrite
    python3 tools/refresh-prerender.py --check          # exit 1 if content differs
    python3 tools/refresh-prerender.py --pins p.json --repos r.json --date 2026-01-31
                                                        # offline / reproducible
    python3 tools/refresh-prerender.py --compare-dom dump.html
                                                        # drift check against a post-JS DOM dump

Python 3 standard library only, no build step, no dependency.

HOW A STALE SNAPSHOT STAYS TRUE
-------------------------------
The static copy ages between runs. It never states freshness: every run writes
the capture date (a visually hidden note before the Pinned grid and the
description of the JSON-LD ItemList), and nothing generated says "current",
"latest" or shows star counts. A dated statement stays true after GitHub
changes. See tools/REFRESH.md for the full ageing path.

HOW IT STAYS IN SYNC WITH main.js
---------------------------------
The templates below mirror main.js (renderPinned / renderRepos / renderStack,
the `skills`, `STACK_HEADINGS` and `LANG_COLORS` literals and the English
strings). That duplication is checked, not assumed: --compare-dom compares the
three containers of a post-JS DOM dump with index.html byte for byte.

Every guard exits non-zero WITHOUT writing anything: a half-rendered index.html
would be worse than an old one.

Exit codes: 0 ok, 1 --check/--compare-dom found a difference, 2 markers or
anchors missing/duplicated/misordered, 3 pins.json has 2 or fewer entries,
4 data does not match the contract, 5 a pinned repo is missing from repos.json,
6 not idempotent, 7 network or file read error.
"""

import argparse
import datetime
import html as htmllib
import json
import os
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

# --------------------------------------------------------------------------
# Configuration mirrored from assets/js/main.js
# --------------------------------------------------------------------------

BASE_URL = "https://raw.githubusercontent.com/mguttmann/mguttmann/output/"

# main.js LANG_COLORS + the "#9aa5b0" fallback.
LANG_COLORS = {
    "TypeScript": "#3178c6",
    "JavaScript": "#f1e05a",
    "Shell": "#89e051",
    "Python": "#3572A5",
    "PowerShell": "#012456",
    "HCL": "#844FBA",
}
LANG_FALLBACK = "#9aa5b0"

# main.js ICO_REPO / ICO_STAR
ICO_REPO = ("M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5"
            "h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1"
            "v6.708A2.486 2.486 0 0 1 4.5 9h8Z")
ICO_STAR = ("M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1"
            "-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611"
            "L7.327.668A.75.75 0 0 1 8 .25Z")

# main.js skills[] with the EN headings from STACK_HEADINGS.en (the EN first
# paint). skills[4] carries the key "stack.g7", which STACK_HEADINGS does not
# define, so main.js falls back to the group's own heading ("AI & Agents"); this
# script reproduces that behaviour instead of silently changing it.
STACK_HEADINGS_EN = {
    "stack.g1": "Microsoft 365 & Identity",
    "stack.g2": "Azure & Cloud",
    "stack.g3": "Security & Endpoint",
    "stack.g4": "Automation & Scripting",
    "stack.g5": "Tooling & Dev",
    "stack.g6": "IT as a business function",
}
SKILLS = [
    ("stack.g1", "Microsoft 365 & Identity", ["Microsoft 365", "Entra ID", "Conditional Access", "MFA / passwordless",
                                              "Exchange Online", "SharePoint & OneDrive", "Microsoft Teams",
                                              "Microsoft Purview"]),
    ("stack.g2", "Azure & Cloud", ["Microsoft Azure", "Azure RBAC", "Microsoft Graph", "Hetzner Cloud",
                                   "Linux / self-hosting", "Docker", "Nginx / reverse proxy", "REST & webhooks"]),
    ("stack.g3", "Security & Endpoint", ["Microsoft Defender XDR", "Defender for Endpoint", "Microsoft Intune",
                                         "Device compliance", "Attack Surface Reduction", "BitLocker",
                                         "Conditional Access", "Secure Score"]),
    ("stack.g4", "Automation & Scripting", ["PowerShell", "Microsoft Graph API", "Python", "Bash", "GitHub Actions",
                                            "Workflow orchestration", "Scheduled reporting", "Webhooks / APIs"]),
    ("stack.g7", "AI & Agents", ["Claude / Claude Code", "Model Context Protocol (MCP)", "MCP server design",
                                 "AI agent orchestration", "Claude skills & plugins", "Prompt engineering",
                                 "Tool use / function calling"]),
    ("stack.g5", "Tooling & Dev", ["TypeScript / Node.js", "Git / GitHub", "REST API design", "JSON / SVG",
                                   "Markdown", "VS Code", "GitHub Pages"]),
    ("stack.g6", "IT as a business", ["Vendor management", "Contract management", "Licensing",
                                      "Cost optimisation", "IT service management", "Documentation & SOPs"]),
]

# main.js: the English strings the render functions bake in.
S_PUBLIC = "Public"
S_FORK = "Fork"
S_UPDATED = "Updated on GitHub"
S_STAR = "Star"
S_NODESC = "Public repository on GitHub."

# Same checks as validEntry() in main.js. Always applied with fullmatch():
# Python's "$" also matches before a trailing newline, JavaScript's does not.
REPO_NAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")
REPO_URL_RE = re.compile(r"^https://github\.com/mguttmann/[A-Za-z0-9._-]+$")
PERSON_ID = "https://mguttmann.github.io/#person"
MAX_PINS = 6  # renderPinned() shows the first 6 pins

# Characters String.prototype.trim() removes (used for the empty-description test).
JS_WHITESPACE = ("\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a"
                 "\u2028\u2029\u202f\u205f\u3000\ufeff")

# Dash normalisation of third-party text (repository names, descriptions,
# languages): en dash and em dash become a plain hyphen. Built from code points
# so the characters themselves never appear in this file. main.js does the same.
DASHES = str.maketrans({0x2013: "-", 0x2014: "-"})


def norm(s):
    return s.translate(DASHES).replace("\r\n", "\n").replace("\r", "\n")


# --------------------------------------------------------------------------
# Escaping, matching how Chromium serialises a DOM built with textContent /
# setAttribute (outerHTML).
# --------------------------------------------------------------------------

def esc_text(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace("\u00a0", "&nbsp;"))


def esc_attr(s):
    return (str(s).replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")
            .replace("\u00a0", "&nbsp;"))


def rgb(hex_color):
    h = hex_color.lstrip("#")
    return "rgb(%d, %d, %d)" % (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def lang_dot(language):
    """<i> language dot as Chromium serialises it after main.js built it:
    aria-hidden before style, although main.js sets style first."""
    return '<i aria-hidden="true" style="background: %s;"></i>' % rgb(LANG_COLORS.get(language, LANG_FALLBACK))


def svg(path, size):
    return ('<svg viewBox="0 0 16 16" width="%d" height="%d" aria-hidden="true">'
            '<path d="%s"></path></svg>' % (size, size, path))


def desc_or_default(desc):
    return desc if desc.strip(JS_WHITESPACE) else S_NODESC


# --------------------------------------------------------------------------
# Block renderers, mirror of main.js renderPinned / renderRepos / renderStack.
# Each returns ONE line per top-level element: a newline between "</i>" and
# the language name would add a visible leading space.
# --------------------------------------------------------------------------

def snapshot_note(date):
    return ('<p class="sr-only" id="snapshot-note" lang="en">Project list captured from GitHub on '
            '<time datetime="%s">%s</time>. With JavaScript enabled, this page tries to load the current '
            'list.</p>' % (date, date))


def render_pinned(projects):
    cards = []
    for p in [x for x in projects if x["pinned"]][:MAX_PINS]:
        cards.append(
            '<div class="pin"><div class="pin-top">%s'
            '<a class="name" href="%s" target="_blank" rel="noopener noreferrer" '
            'aria-label="View the %s repository on GitHub (opens in a new tab)">%s</a>'
            '<span class="vis">%s</span></div><p>%s</p>'
            '<div class="pin-meta"><span class="lang">%s%s</span></div></div>'
            % (svg(ICO_REPO, 16), esc_attr(p["url"]), esc_attr(p["name"]), esc_text(p["name"]),
               esc_text(S_PUBLIC), esc_text(desc_or_default(p["desc"])), lang_dot(p["language"]),
               esc_text(p["language"] or "")))
    return '<div class="pingrid" id="pingrid">%s</div>' % "".join(cards)


def render_repos(projects):
    rows = []
    for p in projects:
        fork = '<span class="fork">%s</span>' % esc_text(S_FORK) if p["fork"] else ""
        rows.append(
            '<div class="rrow"><div class="l"><h3>'
            '<a href="%s" target="_blank" rel="noopener noreferrer" '
            'aria-label="View the %s repository on GitHub (opens in a new tab)">%s</a>'
            '<span class="vis">%s</span>%s</h3><p>%s</p>'
            '<div class="rm"><span class="lang">%s%s</span><span>%s</span></div></div>'
            '<div class="r"><a class="starbtn" href="%s" target="_blank" rel="noopener noreferrer" '
            'aria-label="Star the %s repository on GitHub (opens in a new tab)">%s%s</a></div></div>'
            % (esc_attr(p["url"]), esc_attr(p["name"]), esc_text(p["name"]), esc_text(S_PUBLIC), fork,
               esc_text(desc_or_default(p["desc"])), lang_dot(p["language"]), esc_text(p["language"] or ""),
               esc_text(S_UPDATED), esc_attr(p["url"]), esc_attr(p["name"]), svg(ICO_STAR, 15), esc_text(S_STAR)))
    return '<div class="repolist" id="repolist">%s</div>' % "".join(rows)


def render_stack():
    blocks = []
    for key, own_heading, items in SKILLS:
        heading = STACK_HEADINGS_EN.get(key, own_heading)
        chips = "".join("<span>%s</span>" % esc_text(i) for i in items)
        blocks.append('<div class="skblk"><h4>%s</h4><div class="chips">%s</div></div>'
                      % (esc_text(heading), chips))
    return '<div class="stack" id="stackgrid">%s</div>' % "".join(blocks)


def render_projects_jsonld(projects, date):
    """ItemList of SoftwareSourceCode. Forks are left out: author -> Person
    would be false for code the owner did not write."""
    items = []
    for p in [x for x in projects if not x["fork"]]:
        entity = {"@type": "SoftwareSourceCode", "@id": p["url"], "name": p["name"]}
        desc = p["desc"].strip(JS_WHITESPACE)
        if desc:
            entity["description"] = desc
        entity["codeRepository"] = p["url"]
        if p["language"]:
            entity["programmingLanguage"] = p["language"]
        entity["author"] = {"@id": PERSON_ID}
        items.append({"@type": "ListItem", "position": len(items) + 1, "item": entity})

    data = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "@id": "https://mguttmann.github.io/#projects",
        "name": "Public repositories by Manuel Guttmann",
        "description": ("Snapshot captured on %s of Manuel Guttmann's own (non-fork) public GitHub repositories, "
                        "as listed in the repos.json published by the profile repository mguttmann/mguttmann."
                        % date),
        "numberOfItems": len(items),
        "itemListElement": items,
    }
    body = json.dumps(data, ensure_ascii=False, indent=2)
    # Data must never be able to end the <script> element.
    body = body.replace("<", "\\u003c")
    return ['<script type="application/ld+json">'] + body.split("\n") + ["</script>"]


# --------------------------------------------------------------------------
# Data loading, validation and ordering (mirror of syncPinsLive in main.js)
# --------------------------------------------------------------------------

class Refused(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


def load(local, filename):
    try:
        if local:
            raw = Path(local).read_bytes()
        else:
            with urllib.request.urlopen(BASE_URL + filename, timeout=15) as r:  # public, read-only
                raw = r.read()
    except (OSError, ValueError) as e:
        raise Refused(7, "could not read %s: %s" % (local or BASE_URL + filename, e))
    try:
        return json.loads(raw.decode("utf-8"))
    except ValueError as e:
        raise Refused(4, "%s is not valid JSON: %s" % (filename, e))


def check_entries(src, entries):
    if not isinstance(entries, list):
        raise Refused(4, "%s must be a JSON array." % src)
    seen = set()
    for e in entries:
        if not isinstance(e, dict) or not isinstance(e.get("name"), str) or not REPO_NAME_RE.fullmatch(e["name"]):
            raise Refused(4, "%s contains an entry without a usable 'name': %r" % (src, e))
        if not isinstance(e.get("url"), str) or not REPO_URL_RE.fullmatch(e["url"]):
            raise Refused(4, "%s: %r has url %r, which is not https://github.com/mguttmann/<repo>."
                          % (src, e["name"], e.get("url")))
        for key in ("description", "language"):
            if e.get(key) is not None and not isinstance(e.get(key), str):
                raise Refused(4, "%s: %r has a %s that is neither a string nor null." % (src, e["name"], key))
        if "isFork" in e and not isinstance(e["isFork"], bool):
            raise Refused(4, "%s: %r has an isFork that is not a boolean." % (src, e["name"]))
        if e["name"] in seen:
            raise Refused(4, "%s lists %r twice." % (src, e["name"]))
        seen.add(e["name"])


def build_projects(pins, repos):
    check_entries("pins.json", pins)
    check_entries("repos.json", repos)
    # main.js adds a ".pin-thin" note (a "coming soon" statement) at <= 2 pins;
    # this script does not render it and refuses instead.
    if len(pins) <= 2:
        raise Refused(3, "pins.json has %d entries; at least 3 are needed." % len(pins))

    pin_pos = {p["name"]: i for i, p in enumerate(pins)}
    repo_names = {r["name"] for r in repos}
    missing = [n for n in pin_pos if n not in repo_names]
    if missing:
        raise Refused(5, "pinned repos missing from repos.json: %s" % ", ".join(sorted(missing)))

    mapped = [{
        "name": norm(r["name"]),
        "language": norm(r["language"]) if r.get("language") else None,
        "url": r["url"],
        "desc": norm(r["description"]) if r.get("description") else "",
        "fork": bool(r.get("isFork")),
        "pinned": r["name"] in pin_pos,
        "pos": pin_pos.get(r["name"], 0),
    } for r in repos]

    pinned = sorted([m for m in mapped if m["pinned"]], key=lambda m: m["pos"])
    rest = [m for m in mapped if not m["pinned"]]
    return pinned + rest


# --------------------------------------------------------------------------
# index.html / sitemap.xml rewriting
# --------------------------------------------------------------------------

REPO_COUNT_RE = re.compile(r'(<span class="count" id="repo-count">)(\d+)(</span>)')
LASTMOD_RE = re.compile(r"(<lastmod>)(\d{4}-\d{2}-\d{2})(</lastmod>)")
NOTE_DATE_RE = re.compile(r'<p class="sr-only" id="snapshot-note" lang="en">[^\n]*?<time datetime="(\d{4}-\d{2}-\d{2})">')


def replace_once(text, regex, value, what):
    if len(regex.findall(text)) != 1:
        raise Refused(2, "expected exactly one %s." % what)
    return regex.sub(lambda m: m.group(1) + value + m.group(3), text)


def replace_region(text, name, lines):
    start = "<!-- prerender:%s:start -->" % name
    end = "<!-- prerender:%s:end -->" % name
    if text.count(start) != 1 or text.count(end) != 1:
        raise Refused(2, "marker %s must appear exactly once each (start=%d, end=%d)."
                      % (name, text.count(start), text.count(end)))
    i, j = text.index(start), text.index(end)
    if i > j:
        raise Refused(2, "marker %s: start comes after end." % name)
    line_start = text.rfind("\n", 0, i) + 1
    indent = text[line_start:i]
    if indent.strip():
        raise Refused(2, "marker %s:start must be the first thing on its line." % name)
    # Only the lines this script lays out are indented; a newline inside data
    # stays as it is, so the text content is never altered.
    body = "".join(indent + ln + "\n" for ln in lines)
    return text[:i + len(start)] + "\n" + body + indent + text[j:]


def transform(text, projects, date):
    text = replace_region(text, "pinned", [snapshot_note(date), render_pinned(projects)])
    text = replace_region(text, "repos", [render_repos(projects)])
    text = replace_region(text, "stack", [render_stack()])
    text = replace_region(text, "projects-jsonld", render_projects_jsonld(projects, date))
    text = replace_once(text, REPO_COUNT_RE, str(len(projects)), '<span class="count" id="repo-count">N</span>')
    return text


# --------------------------------------------------------------------------
# Metrics: the frozen "crawler view" method (M1). Drop comments, <script>,
# <style> and <svg>, drop remaining tags, unescape entities, collapse
# whitespace. Kept unchanged so before/after numbers stay comparable.
# --------------------------------------------------------------------------

def metrics(s):
    t = re.sub(r"<!--.*?-->", " ", s, flags=re.S)
    for tag in ("script", "style", "svg"):
        t = re.sub(r"<%s\b.*?</%s>" % (tag, tag), " ", t, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", htmllib.unescape(t)).strip()
    deep = re.findall(r'href="https://github\.com/mguttmann/([A-Za-z0-9._-]+)"', s)
    return {"bytes": len(s.encode("utf-8")), "chars": len(t), "words": len(t.split()),
            "deeplinks": len(deep), "repos": len(set(deep))}


# --------------------------------------------------------------------------
# --compare-dom: extract a container's outerHTML from serialised HTML
# --------------------------------------------------------------------------

DIV_TAG_RE = re.compile(r"<div\b[^>]*>|</div>")


def extract_div(text, open_tag):
    i = text.find(open_tag)
    if i < 0 or text.find(open_tag, i + 1) >= 0:
        return None
    depth = 0
    for m in DIV_TAG_RE.finditer(text, i):
        depth += -1 if m.group(0) == "</div>" else 1
        if depth == 0:
            return text[i:m.end()]
    return None


CONTAINERS = ['<div class="pingrid" id="pingrid">', '<div class="repolist" id="repolist">',
              '<div class="stack" id="stackgrid">']


def compare_dom(index_text, dump_text):
    ok = True
    for tag in CONTAINERS:
        a, b = extract_div(index_text, tag), extract_div(dump_text, tag)
        if a is None or b is None:
            print("compare-dom: %s not found exactly once (index=%s, dump=%s)"
                  % (tag, a is not None, b is not None), file=sys.stderr)
            ok = False
        elif a != b:
            k = next((n for n in range(min(len(a), len(b))) if a[n] != b[n]), min(len(a), len(b)))
            print("compare-dom: %s differs at offset %d:\n  index: %r\n  dump:  %r"
                  % (tag, k, a[max(0, k - 60):k + 60], b[max(0, k - 60):k + 60]), file=sys.stderr)
            ok = False
        else:
            print("compare-dom: %s identical (%d bytes)" % (tag, len(a)))
    return 0 if ok else 1


# --------------------------------------------------------------------------

def write_atomic(path, text):
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix="." + path.name + ".")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        os.replace(tmp, str(path))
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def run(args):
    root = Path(__file__).resolve().parent.parent
    index = Path(args.index) if args.index else root / "index.html"
    sitemap = Path(args.sitemap) if args.sitemap else index.parent / "sitemap.xml"
    try:
        before = index.read_text(encoding="utf-8")
    except OSError as e:
        raise Refused(7, "could not read %s: %s" % (index, e))

    if args.compare_dom:
        try:
            dump = Path(args.compare_dom).read_text(encoding="utf-8")
        except OSError as e:
            raise Refused(7, "could not read %s: %s" % (args.compare_dom, e))
        return compare_dom(before, dump)

    if args.date and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.date):
        raise Refused(4, "--date must be YYYY-MM-DD.")

    projects = build_projects(load(args.pins, "pins.json"), load(args.repos, "repos.json"))

    if args.check:
        # Compare content only: reuse the capture date already in the file.
        m = NOTE_DATE_RE.search(before)
        date = m.group(1) if m else "0000-00-00"
        if transform(before, projects, date) == before:
            print("refresh-prerender: index.html content matches the data.")
            return 0
        print("refresh-prerender: index.html content differs from the data; run without --check.",
              file=sys.stderr)
        return 1

    date = args.date or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    after = transform(before, projects, date)
    if transform(after, projects, date) != after:
        raise Refused(6, "not idempotent: a second pass changes the result.")
    try:
        site_before = sitemap.read_text(encoding="utf-8")
    except OSError as e:
        raise Refused(7, "could not read %s: %s" % (sitemap, e))
    site_after = replace_once(site_before, LASTMOD_RE, date, "<lastmod>YYYY-MM-DD</lastmod> in sitemap.xml")

    write_atomic(index, after)
    write_atomic(sitemap, site_after)

    mb, ma = metrics(before), metrics(after)
    print("pins %d  |  repos %d (%d forks)  |  stack %d  |  jsonld %d SoftwareSourceCode  |  captured %s"
          % (min(MAX_PINS, len([p for p in projects if p["pinned"]])), len(projects),
             len([p for p in projects if p["fork"]]), len(SKILLS),
             len([p for p in projects if not p["fork"]]), date))
    print("index.html %d -> %d B  |  visible text (M1) %d -> %d chars  |  repo deep-links %d -> %d"
          % (mb["bytes"], ma["bytes"], mb["chars"], ma["chars"], mb["deeplinks"], ma["deeplinks"]))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="Refresh the pre-rendered blocks in index.html (local tool, not CI).")
    ap.add_argument("--pins", help="local pins.json instead of the network")
    ap.add_argument("--repos", help="local repos.json instead of the network")
    ap.add_argument("--index", help="path to index.html (default: index.html next to tools/)")
    ap.add_argument("--sitemap", help="path to sitemap.xml (default: next to index.html)")
    ap.add_argument("--date", help="capture date YYYY-MM-DD (default: today, UTC)")
    ap.add_argument("--check", action="store_true",
                    help="write nothing; exit 1 if the content (capture date ignored) differs from the data")
    ap.add_argument("--compare-dom", metavar="FILE",
                    help="write nothing; compare the three containers of a post-JS DOM dump with index.html")
    args = ap.parse_args(argv)
    try:
        return run(args)
    except Refused as e:
        print("refresh-prerender: ERROR %s" % e, file=sys.stderr)
        print("refresh-prerender: nothing was written.", file=sys.stderr)
        return e.code


if __name__ == "__main__":
    sys.exit(main())
