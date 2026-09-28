# Refreshing the pre-rendered project markup

`index.html` carries the Pinned grid, the repository list, the Stack panel,
the repository counter and a JSON-LD `ItemList` of the repositories as real,
static HTML. A client without JavaScript (crawlers, link previews, curl)
therefore sees the project names and repository links. `assets/js/main.js`
reads that markup back as its starting data and then tries to replace it with
the live data contracts published by the profile repository:

- `https://raw.githubusercontent.com/mguttmann/mguttmann/output/pins.json`
- `https://raw.githubusercontent.com/mguttmann/mguttmann/output/repos.json`

The static copy is renewed by one local script, `tools/refresh-prerender.py`.

**There is no workflow, no cron and no CI job for this, on purpose.** The site
repository gets no scheduled job with write access to the landing page. The
script runs only when someone runs it by hand, and its result is reviewed and
committed like any other change.

Requirements: Python 3, standard library only. No build step, no dependency.

Note: GitHub Pages serves every committed file of this repository, this
folder included. Python bytecode (`__pycache__/`, `*.py[cod]`) contains local
file paths and is therefore listed in `.gitignore`.

## What the script writes

Four marked regions in `index.html`, plus two single values:

| Region / value | Content |
|---|---|
| `<!-- prerender:pinned:start/end -->` | dated snapshot note (`#snapshot-note`, visually hidden) and `#pingrid` |
| `<!-- prerender:repos:start/end -->` | `#repolist` |
| `<!-- prerender:stack:start/end -->` | `#stackgrid` |
| `<!-- prerender:projects-jsonld:start/end -->` | JSON-LD `ItemList` of `SoftwareSourceCode`, own repositories only (forks are left out) |
| `<span class="count" id="repo-count">N</span>` | number of repositories |
| `<lastmod>` in `sitemap.xml` | capture date |

Do not edit these regions by hand; the next run overwrites them. Every
marker must appear exactly once and each start marker must be the first thing
on its line, otherwise the script refuses (exit 2).

The markup is the same markup `main.js` builds (same elements, classes,
attributes and English strings), so the page looks the same before and after
JavaScript runs. The templates in the script mirror `renderPinned`,
`renderRepos`, `renderStack`, `skills`, `STACK_HEADINGS` and `LANG_COLORS` in
`main.js`. That duplication is checked, not assumed: see "Drift check" below.

Third-party text (repository names, descriptions, languages) is handled the
same way in the script and in `main.js`:

- en dash and em dash become a plain hyphen;
- in the HTML regions it is escaped as text (`&`, `<`, `>`, quotes in
  attributes); `main.js` only uses `textContent` and `setAttribute`, never
  `innerHTML` with data;
- in the JSON-LD block every `<` is written as the JSON escape `\u003c`, so
  a description can never end the `<script>` element.

## Commands

Run from anywhere; paths default to the files next to `tools/`.

```sh
# Fetch both contracts live, validate, rewrite index.html and sitemap.xml
python3 tools/refresh-prerender.py

# Write nothing; exit 1 if the content differs from the live data.
# The capture date is ignored, so a run on another day with unchanged data
# still exits 0.
python3 tools/refresh-prerender.py --check

# Offline / reproducible: local contract files and a fixed capture date
python3 tools/refresh-prerender.py --pins pins.json --repos repos.json --date 2026-01-31

# Write nothing; compare the three containers of a post-JS DOM dump with index.html
python3 tools/refresh-prerender.py --compare-dom dump.html
```

Options:

| Option | Meaning |
|---|---|
| `--pins FILE` | read `pins.json` from a local file instead of the network |
| `--repos FILE` | read `repos.json` from a local file instead of the network |
| `--index FILE` | path to `index.html` (default: the one next to `tools/`) |
| `--sitemap FILE` | path to `sitemap.xml` (default: next to `index.html`) |
| `--date YYYY-MM-DD` | capture date (default: today, UTC) |
| `--check` | write nothing, compare content only (see above) |
| `--compare-dom FILE` | write nothing, drift check against a DOM dump |

Without `--pins`/`--repos` the script makes two plain GET requests to the
public URLs above. It sends no token and writes nothing to GitHub.

After a normal run it prints what it rendered and the before/after size of the
crawler-visible text and of the repository links.

Running twice with the same data and the same date changes nothing. A run on a
later day with unchanged data changes only the capture date (note, `ItemList`
description, `sitemap.xml`).

## Exit codes

Every refusal (codes 2 to 7) prints the reason plus `nothing was written.`
and leaves `index.html` and `sitemap.xml` untouched. A half-rendered page would
be worse than an old one.

This guarantee covers the refusals only. An error the script does not map to a
code ends with a Python traceback and exit code 1, which is the same code as
"difference found": for example a write error (disk full, permissions) while
the two files are replaced, or an HTTP error that is not an `OSError` (such as
a truncated response). The two files are replaced one after the other, each
atomically; a write error on the second one leaves a new `index.html` next to
the old `sitemap.xml` date until the next run. After a traceback, read the
message instead of the exit code.

| Code | Meaning |
|---|---|
| 0 | ok |
| 1 | `--check` or `--compare-dom` found a difference |
| 2 | a marker, or the repository counter, is missing, duplicated or misordered |
| 3 | `pins.json` has 2 or fewer entries |
| 4 | data does not match the contract: not a JSON array, invalid JSON, an entry without a usable name, a URL that is not `https://github.com/mguttmann/<repo>` (name and URL must match in full, as in `main.js`; a trailing newline is rejected), a duplicated name, a `description`/`language` that is neither string nor null, an `isFork` that is not a boolean, or a malformed `--date` |
| 5 | a pinned repository is missing from `repos.json` |
| 6 | not idempotent: a second pass would change the result |
| 7 | network or file read error |

Codes 0, 2, 3, 4 (including a name or URL with a trailing newline), 5 and 7
and the "nothing written" behaviour on refusal are covered by the
verification run of this change. Code 6 is a defensive guard that no test
triggers, and the `--compare-dom` exit 1 path was only exercised by hand
during development; treat both as unverified.

## Page load: the static markup is never hidden again

`main.js` runs at the end of `<body>`, so the browser may already have painted
the pre-rendered markup. The page's own entrance effects therefore never hide
something that may already be on screen:

- **Hero sentence.** When motion is allowed, a small script in `<head>` hides
  the pre-rendered sentence (`typing-pending`) so that `main.js` can type it
  in without the full sentence flashing first. If `main.js` has not started
  after 3 seconds, the sentence is shown as it is; a `main.js` that arrives
  later keeps the visible sentence and does not clear or retype it. Under
  reduced motion the sentence is visible from the start.
- **Scroll reveal.** Only blocks that lie entirely below the viewport when
  `main.js` runs are faded in on scroll. Blocks in or above the viewport and
  blocks without a layout box (inactive tab panels) stay visible and are not
  animated. Whether the pins count as above or below the fold depends on the
  viewport: on a desktop-sized window they are usually visible and never
  animated, on a phone-sized one they usually start below the fold and fade
  in when scrolled to.
- **Live-data sync.** When the fetched data differs from the pre-rendered
  markup (or a repository has no description, whose placeholder text is read
  back as an empty description), pins and repository rows are rebuilt without
  the entrance animation, so rows already on screen never drop to transparent.
  The row fade-in plays only right after a visitor action: a language filter,
  a search input or the EN/DE toggle, as before this change.
- **Avatar.** The entrance pop of the avatar ring is skipped when the ring may
  already be painted, which is the case whenever it is above the fold.

The verification run of this change covers the hero, reveal and avatar
cases with five combinations of `main.js` delay and viewport (0, 0.8 and 3.5
seconds on a desktop-sized window, 1.5 and 3.5 seconds on a phone-sized one):
no visible sentence shrinks, no visible block or ring drops back to
transparent. The live-data sync is covered with a delayed fetch while the
Repositories tab is open (data that differs from the snapshot, identical data
with a repository without description, a failing `pins.json`, a failing
`repos.json`) and while the Overview is open (differing data): no visible row
or card drops in opacity. Real mobile network timings were not tested.

## How the static snapshot ages

The static copy is only as current as the last run. It is built so that an old
copy never claims anything false:

- It never states freshness. Nothing generated says "current" or "latest",
  and no star counts are rendered. The only numbers it writes are the
  repository count (`#repo-count`) and the `numberOfItems` of the JSON-LD
  `ItemList`; both are counts of the captured list and belong to the dated
  snapshot described next, and `main.js` replaces the visible counter with
  the live count.
- Every run writes the capture date into a visually hidden note in front of
  the Pinned grid ("Project list captured from GitHub on DATE. With JavaScript
  enabled, this page tries to load the current list.") and into the
  description of the JSON-LD `ItemList` ("Snapshot captured on DATE of ...").
  A dated statement stays true after GitHub changes.

What happens when GitHub changes (a repository is renamed, made private,
deleted or gets a new description) and nobody runs the script:

| Who | Sees |
|---|---|
| JavaScript visitor, both fetches succeed | the live data; `main.js` replaces pins, list and counter and removes the snapshot note. If the live data equals the snapshot, nothing is redrawn. If it differs, the visitor first sees the snapshot texts and then, once the fetch returns, the live texts: a one-time text swap in which nothing is hidden or faded in, although a card or row may change height with the text length. Re-running the script after a change on GitHub removes the swap. |
| JavaScript visitor, only `pins.json` fails | live repository list with the snapshot's pin selection and order; a snapshot-pinned repository that is gone from the live list is simply not shown |
| JavaScript visitor, only `repos.json` fails | live pins followed by the snapshot's remaining repositories, without duplicates |
| JavaScript visitor, both fail, or the data is empty, not an array or has no valid entry | the complete snapshot, including the dated note; filter, search and the language toggle work on it |
| Client without JavaScript, crawler | the snapshot as of the capture date, possibly with a dead link to a removed repository, next to the dated note and the dated `ItemList` |

Only the next run of the script corrects: the static regions, the JSON-LD
`ItemList` (`main.js` never updates it at runtime), the counter as served in
the HTML and `sitemap.xml`.

Recommended routine: run `--check` now and then (for example after changing
repositories on GitHub). Exit 1 means the snapshot is behind; run the script
without `--check`, look at the diff, run the drift check, commit.

## Drift check (`--compare-dom`)

If `main.js` changes how it renders (markup, strings, skills, headings,
colours) and the script is not updated, the static markup no longer matches
what JavaScript builds. `--compare-dom` catches that by comparing the
`#pingrid`, `#repolist` and `#stackgrid` containers of `index.html` with those
of a DOM dump taken after `main.js` ran, byte for byte.

Take the dump with the live fetch blocked, so `main.js` renders from the
snapshot, and with reduced motion, so no animation state ends up in the
markup. Serve the working tree on a loopback port first (the ports below are
examples):

```sh
python3 -m http.server 8765 --bind 127.0.0.1 &   # from the repository root
SERVER=$!

CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROF=$(mktemp -d)
"$CH" --headless --disable-gpu --user-data-dir="$PROF" \
  --force-prefers-reduced-motion --virtual-time-budget=5000 \
  --host-resolver-rules="MAP raw.githubusercontent.com 127.0.0.1:9" \
  --dump-dom http://127.0.0.1:8765/ > /tmp/dump.html 2>/dev/null &
CP=$!
# Chrome writes the dump but, as observed here, does not exit by itself:
# wait for the closing tag, then stop it.
for i in $(seq 60); do sleep 0.5; grep -q "</html>" /tmp/dump.html 2>/dev/null && break; done
kill $CP; wait $CP 2>/dev/null; rm -rf "$PROF"
kill $SERVER

python3 tools/refresh-prerender.py --compare-dom /tmp/dump.html
```

Each container prints `identical` or the first differing offset with context.
Exit 0 means all three match. On a difference, bring the script's templates in
line with `main.js` (not the other way round), re-run the script and repeat
the check. Until then JavaScript visitors are unaffected, because `main.js`
replaces the containers at runtime anyway; clients without JavaScript get the
outdated template.

## Known limits

- **Reduced motion and the two `<img>` SVGs.** Under
  `prefers-reduced-motion: reduce` the rules at the end of
  `assets/css/styles.css` and the motion gate in `main.js` switch off the
  page's own animations (avatar, wave, cursor, reveals, typing, counters).
  The snake backdrop and the activity composite are remote SVGs embedded via
  `<img>`: they render in their own documents, which neither the stylesheet nor
  the script can reach. The snake is only dimmed and keeps animating; the
  composite keeps animating. A `<picture>` swap would need a static variant of
  each image, and none exists today.
- **Tabs and hidden panels.** Without JavaScript the tabs do nothing and no
  tab roles are announced; the Repositories and Stack panels stay hidden by
  CSS as before. Their text is in the HTML, but crawlers that evaluate CSS may
  weigh hidden content lower. The Overview panel (hero sentence and pins) is
  visible without JavaScript.
- **The capture date is the run date.** The contracts carry no timestamp of
  their own. If the profile pipeline has stalled, `repos.json` may already be
  older than the date the note states.
- **The snapshot note is visually hidden and English only.** Sighted
  visitors whose fetch fails see the list without a visible date; with the
  German toggle, screen readers still read the note in English (`lang="en"`).
- **Fewer than three pins.** The script refuses (exit 3) and the old, dated
  snapshot stays. At runtime, live data with two or fewer valid pins still
  shows the existing "More public projects coming soon." note, as before this
  tool existed.
- **No exclusion list.** Every repository in `repos.json` is rendered. A
  repository that should not appear has to be fixed in the profile repository.
