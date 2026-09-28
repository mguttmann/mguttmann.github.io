/* ==========================================================================
   Manuel Guttmann - Portfolio - main.js
   Vanilla JS only. No external libraries.

   Aesthetic direction: PURE GITHUB PROFILE (monochrome accent).
   Recreated from the Claude-Design handoff template (project/site.js +
   reveal.js). This script:
     - data-drives the Pinned + Repositories grids and the Stack panel,
       built with createElement/textContent (XSS-safe - never innerHTML
       from data). Data sources, in order: the pre-rendered markup in
       index.html (written by tools/refresh-prerender.py) is read back as
       the starting data, then the live pins.json / repos.json replace it
       when both the fetch and the validation succeed. On any failure the
       pre-rendered list stays complete.
     - runs the profile tabs (Overview / Repositories / Stack) as an ARIA
       tab pattern + the sliding tab-ink, the repo search + language-pill
       filter
     - animates the counters, the typed README and the avatar pop - all gated
       behind a motion probe so content is never stuck hidden, and skipped
       under prefers-reduced-motion. Exception: the two remote SVGs embedded
       via <img> (snake, activity composite) animate inside their own
       documents, which neither this script nor the stylesheet can reach.
     - drives the EN/DE language toggle (EN-primary), which flips <html lang>
     - fills the employer/location spots from a SINGLE central EMPLOYER config

   Every init step runs inside safe(): if one feature throws (missing element,
   unsupported API) the others still run.

   HOW TO ADD A PROJECT: make the repo public on GitHub; the profile repo
   publishes it in repos.json. Then run tools/refresh-prerender.py so the
   pre-rendered markup lists it too (see tools/REFRESH.md).
   HOW TO ADD A LANGUAGE STRING: add a key to I18N.de and I18N.en.
   ========================================================================== */
(function () {
  "use strict";

  /* prefers-reduced-motion: respected everywhere */
  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ======================================================================
     1) PROJECTS DATA. Filled at start-up by hydrateFromMarkup() from the
     pre-rendered markup in index.html, then replaced by syncPinsLive() with
     the live data contracts when those load and validate. There is no
     hard-coded project list: the pre-rendered snapshot is the fallback.
     Entry shape: { name, url, desc, language, fork, pinned }.
     ====================================================================== */
  var projects = [];

  /* Language -> GitHub dot colour for the language badge (cosmetic).
     Mirrored in tools/refresh-prerender.py. */
  var LANG_COLORS = {
    "TypeScript": "#3178c6",
    "JavaScript": "#f1e05a",
    "Shell": "#89e051",
    "Python": "#3572A5",
    "PowerShell": "#012456",
    "HCL": "#844FBA"
  };

  /* Stack groups (credible keywords only). Mirrored in
     tools/refresh-prerender.py, keep both in sync. */
  var skills = [
    { key: "stack.g1", h: "Microsoft 365 & Identity", items: ["Microsoft 365", "Entra ID", "Conditional Access", "MFA / passwordless", "Exchange Online", "SharePoint & OneDrive", "Microsoft Teams", "Microsoft Purview"] },
    { key: "stack.g2", h: "Azure & Cloud",             items: ["Microsoft Azure", "Azure RBAC", "Microsoft Graph", "Hetzner Cloud", "Linux / self-hosting", "Docker", "Nginx / reverse proxy", "REST & webhooks"] },
    { key: "stack.g3", h: "Security & Endpoint",       items: ["Microsoft Defender XDR", "Defender for Endpoint", "Microsoft Intune", "Device compliance", "Attack Surface Reduction", "BitLocker", "Conditional Access", "Secure Score"] },
    { key: "stack.g4", h: "Automation & Scripting",    items: ["PowerShell", "Microsoft Graph API", "Python", "Bash", "GitHub Actions", "Workflow orchestration", "Scheduled reporting", "Webhooks / APIs"] },
    { key: "stack.g7", h: "AI & Agents",               items: ["Claude / Claude Code", "Model Context Protocol (MCP)", "MCP server design", "AI agent orchestration", "Claude skills & plugins", "Prompt engineering", "Tool use / function calling"] },
    { key: "stack.g5", h: "Tooling & Dev",             items: ["TypeScript / Node.js", "Git / GitHub", "REST API design", "JSON / SVG", "Markdown", "VS Code", "GitHub Pages"] },
    { key: "stack.g6", h: "IT as a business",          items: ["Vendor management", "Contract management", "Licensing", "Cost optimisation", "IT service management", "Documentation & SOPs"] }
  ];

  /* ======================================================================
     2) I18N dictionary. EN is primary (the site is EN-first); DE is fully
     translated so the toggle works both ways. Keys map to elements via
     [data-i18n="key"]. If a string is missing the other language is used.
     ====================================================================== */
  var I18N = {
    de: {
      "search.placeholder": "Suchen oder springen zu…",
      "nav.overview": "Overview",
      "nav.repos": "Repositories",
      "nav.stack": "Stack",
      "side.status": "automating things",
      "side.role": "IT-Systemadministrator",
      "side.bio": "IT-Systemadministrator. Ich automatisiere Infrastruktur und baue Claude-Skills, Plugins & AI-Agents, alles Open Source.",
      "side.follow": "Follow",
      "side.focus": "Automation · Cloud · AI",
      "side.achievements": "Achievements",
      "readme.hi": "Hi, ich bin Manuel",
      "readme.typed": "$ Sysadmin tagsüber, Automatisierer immer. Ich verwandle wiederkehrende Aufgaben in Code: Claude-Skills, Plugins, Runbooks und AI-Agents, die du direkt einsetzen kannst. Hier teile ich alles als Open Source.",
      "counters.years": "Jahre IT",
      "overview.pinned": "Pinned",
      "overview.morepublic": "Weitere öffentliche Projekte folgen.",
      "overview.contrib": "Contribution-Graph",
      "overview.contrib.note": "// täglich aktualisiert",
      "overview.contrib.fallback": "Der Contribution-Graph erscheint nach dem ersten täglichen Lauf des Profil-Workflows.",
      "overview.contrib3d.fallback": "Der 3D-Contribution-Kalender erscheint nach dem ersten täglichen Lauf des Profil-Workflows.",
      "overview.stats": "Stats",
      "overview.stats.note": "// täglich aktualisiert",
      "overview.stats.fallback": "Die Statistiken erscheinen nach dem ersten täglichen Lauf des Profil-Workflows.",
      "overview.less": "Weniger",
      "overview.more": "Mehr",
      "overview.contact": "Kontakt",
      "overview.closing": "Keine Pitch-Decks, kein Buzzword-Bingo: eine ehrliche Antwort auf ein echtes Problem.",
      "repos.search": "Repository suchen…",
      "repos.search.label": "Repository suchen",
      "repos.all": "Alle Repositories auf GitHub ansehen",
      "repos.none": "Keine Repositories gefunden.",
      "repos.allpill": "Alle",
      "repos.updated": "Aktualisiert auf GitHub",
      "repos.fork": "Fork",
      "repos.view": "Repo ansehen",
      "stack.title": "Tools & Stack",
      "footer.email": "E-Mail"
    },
    en: {
      "search.placeholder": "Search or jump to…",
      "nav.overview": "Overview",
      "nav.repos": "Repositories",
      "nav.stack": "Stack",
      "side.status": "automating things",
      "side.role": "IT systems administrator",
      "side.bio": "IT systems administrator. I automate infrastructure and build Claude skills, plugins & AI agents, all open source.",
      "side.follow": "Follow",
      "side.focus": "Automation · Cloud · AI",
      "side.achievements": "Achievements",
      "readme.hi": "Hi, I'm Manuel",
      "readme.typed": "$ Sysadmin by day, automator always. I turn recurring tasks into code: Claude skills, plugins, runbooks and AI agents you can use right away. I share it all as open source.",
      "counters.years": "Years in IT",
      "overview.pinned": "Pinned",
      "overview.morepublic": "More public projects coming soon.",
      "overview.contrib": "Contribution graph",
      "overview.contrib.note": "// auto-updated daily",
      "overview.contrib.fallback": "Contribution graph populates after the first daily run of the profile workflow.",
      "overview.contrib3d.fallback": "3D contribution calendar populates after the first daily run of the profile workflow.",
      "overview.stats": "Stats",
      "overview.stats.note": "// auto-updated daily",
      "overview.stats.fallback": "Stats populate after the first daily run of the profile workflow.",
      "overview.less": "Less",
      "overview.more": "More",
      "overview.contact": "Contact",
      "overview.closing": "No pitch decks, no buzzword bingo: just a straight answer to a real problem.",
      "repos.search": "Find a repository…",
      "repos.search.label": "Find a repository",
      "repos.all": "See all repositories on GitHub",
      "repos.none": "No repositories found.",
      "repos.allpill": "All",
      "repos.updated": "Updated on GitHub",
      "repos.fork": "Fork",
      "repos.view": "View repo",
      "stack.title": "Tools & Stack",
      "footer.email": "Email"
    }
  };

  /* Stack group headings are translated separately (they are data-driven).
     The EN set is mirrored in tools/refresh-prerender.py. */
  var STACK_HEADINGS = {
    de: { "stack.g1": "Microsoft 365 & Identity", "stack.g2": "Azure & Cloud", "stack.g3": "Security & Endpoint", "stack.g4": "Automatisierung & Scripting", "stack.g5": "Tooling & Dev", "stack.g6": "IT als Business-Funktion" },
    en: { "stack.g1": "Microsoft 365 & Identity", "stack.g2": "Azure & Cloud", "stack.g3": "Security & Endpoint", "stack.g4": "Automation & Scripting", "stack.g5": "Tooling & Dev", "stack.g6": "IT as a business function" }
  };

  /* ======================================================================
     EMPLOYER  --  SINGLE source of truth for employer name + location.
     ----------------------------------------------------------------------
     The owner has publicly set company = journaway and location =
     Ostrhauderfehn, so publish = true. applyEmployer() fills the sidebar
     "Location" value - the value is never scattered across the markup.
     ====================================================================== */
  var EMPLOYER = {
    publish: true,                          // owner-confirmed public
    name: "journaway",                      // used when publish === true
    location: "Ostrhauderfehn, Germany",    // used when publish === true

    /* Neutral, non-fabricated fallbacks (kept if ever toggled off). */
    genericName: { de: "einem Reiseunternehmen in Norddeutschland", en: "a travel company in northern Germany" },
    genericLoc:  { de: "Norddeutschland", en: "Northern Germany" }
  };

  /* small helpers */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* Run an init step in isolation: if one feature throws, the others run. */
  function safe(label, fn) {
    try { fn(); }
    catch (err) {
      if (window.console && console.warn) {
        console.warn("[main.js] init step '" + label + "' failed:", err);
      }
    }
  }

  /* Build a DOM node with optional class + plain text (textContent = no HTML
     injection). The only way data enters the DOM. */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* Only allow http(s) links; otherwise drop the href (blocks javascript: etc.) */
  function safeUrl(url) {
    var u = String(url || "");
    return /^https?:\/\//i.test(u) ? u : "";
  }

  /* Append a small inline GitHub SVG icon (from a fixed path string we own -
     not data) to a node. */
  function appendIcon(node, path, w) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", String(w || 14));
    svg.setAttribute("height", String(w || 14));
    svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", path);
    svg.appendChild(p);
    node.appendChild(svg);
    return svg;
  }

  var ICO_REPO = "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z";
  var ICO_STAR = "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z";

  /* current language (EN-primary) */
  var currentLang = "en";
  function getString(key) {
    var dict = I18N[currentLang] || I18N.en;
    return dict[key] != null ? dict[key] : (I18N.en[key] != null ? I18N.en[key] : (I18N.de[key] != null ? I18N.de[key] : null));
  }

  document.addEventListener("DOMContentLoaded", function () {
    safe("hydrate", hydrateFromMarkup); // must run before anything renders
    safe("footerYear", setFooterYear);
    safe("applyLang", function () { applyLang("en"); }); // EN-primary first paint
    safe("renderPinned", renderPinned);
    safe("renderRepos", initRepos);
    safe("renderStack", renderStack);
    safe("tabs", initTabs);
    safe("langToggle", initLangToggle);
    safe("reveal", initReveal);
    safe("motion", runMotion);
    safe("syncPins", syncPinsLive);
  });

  /* ----------------------------------------------------------------------
     Third-party text (names, descriptions, languages from the data contracts)
     is normalised before it enters `projects`: en dash and em dash become a
     plain hyphen. The pattern is built from code points so the characters
     never appear in this file. Mirrored in tools/refresh-prerender.py.
     ---------------------------------------------------------------------- */
  var DASH_RE = new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]", "g");
  function normText(v) {
    return typeof v === "string" ? v.replace(DASH_RE, "-") : "";
  }

  /* Same checks as tools/refresh-prerender.py: a repo name and an own-repo
     https URL. Entries failing them are dropped (fail closed). */
  var REPO_NAME_RE = /^[A-Za-z0-9._-]+$/;
  var REPO_URL_RE = /^https:\/\/github\.com\/mguttmann\/[A-Za-z0-9._-]+$/;
  function validEntry(e) {
    return !!e && typeof e === "object" &&
      typeof e.name === "string" && REPO_NAME_RE.test(e.name) &&
      typeof e.url === "string" && REPO_URL_RE.test(e.url);
  }
  function validList(v) {
    return Array.isArray(v) ? v.filter(validEntry) : [];
  }

  /* Text shown for a repo without a description (same string as S_NODESC
     in tools/refresh-prerender.py). */
  var S_NODESC = "Public repository on GitHub.";
  function shownDesc(d) {
    return (d && String(d).trim()) ? d : S_NODESC;
  }

  /* ----------------------------------------------------------------------
     Hydration: read the pre-rendered markup (tools/refresh-prerender.py)
     back into `projects`, so every later render (language switch, filter,
     search, failed fetch) works on the complete snapshot and produces the
     same markup. textContent / getAttribute only.
     ---------------------------------------------------------------------- */
  function hydrateFromMarkup() {
    var pinned = Object.create(null);
    $all("#pingrid .pin .name").forEach(function (n) { pinned[n.textContent] = true; });
    var out = [];
    $all("#repolist .rrow").forEach(function (row) {
      var link = $(".l h3 a", row);
      var nameNode = link || $(".l h3 span", row);
      var descNode = $(".l p", row);
      var langNode = $(".rm .lang", row);
      if (!nameNode) return;
      var name = nameNode.textContent;
      out.push({
        name: name,
        url: link ? safeUrl(link.getAttribute("href")) : "",
        // The pre-rendered placeholder stands for "no description" (as in
        // the live data), so an unchanged repo compares equal after the fetch.
        desc: descNode && descNode.textContent !== S_NODESC ? descNode.textContent : "",
        language: (langNode && langNode.textContent) || null,
        fork: !!$(".l h3 .fork", row),
        pinned: !!pinned[name]
      });
    });
    if (out.length) projects = out;
  }

  /* ----------------------------------------------------------------------
     Live data sync: the profile repo publishes two contracts to its
     `output` branch -
       repos.json -> its public repos (the Repositories tab)
       pins.json  -> the pinned subset   (the Pinned grid)
     We read both, build the project list (pinned first, in pin order), and
     re-render. PUBLIC data only, no token. Graceful: a failed, empty or
     invalid response (not an array, no valid entry) replaces nothing, so
     the pre-rendered snapshot stays complete. The dated snapshot note is
     removed only when BOTH contracts replaced the snapshot.
     ---------------------------------------------------------------------- */
  function mapEntry(r, pinned) {
    return {
      name: normText(r.name), url: r.url,
      desc: normText(r.description), language: normText(r.language) || null,
      fork: r.isFork === true, pinned: pinned
    };
  }

  /* Compares what the renderers show, so a difference that renders the
     same (e.g. a blank vs. a missing description) causes no redraw. */
  function sameProjects(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      var x = a[i], y = b[i];
      if (x.name !== y.name || x.url !== y.url || shownDesc(x.desc) !== shownDesc(y.desc) ||
          x.language !== y.language || x.fork !== y.fork || x.pinned !== y.pinned) return false;
    }
    return true;
  }

  function syncPinsLive() {
    if (!window.fetch || !window.Promise) return;
    var base = "https://raw.githubusercontent.com/mguttmann/mguttmann/output/";
    var getJSON = function (file) {
      return fetch(base + file, { cache: "no-cache" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    };
    Promise.all([getJSON("repos.json"), getJSON("pins.json")]).then(function (res) {
      var repos = validList(res[0]), pins = validList(res[1]);
      var reposOk = repos.length > 0, pinsOk = pins.length > 0;
      if (!reposOk && !pinsOk) return; // keep the snapshot

      var pinPos = Object.create(null);
      if (pinsOk) {
        pins.forEach(function (p, i) { if (!(p.name in pinPos)) pinPos[p.name] = i; });
      } else {
        // pins.json failed: keep the snapshot's pin selection and order
        projects.filter(function (p) { return p.pinned; })
          .forEach(function (p, i) { pinPos[p.name] = i; });
      }

      var next;
      if (reposOk) {
        var pinned = [], rest = [];
        repos.forEach(function (r) {
          var m = mapEntry(r, r.name in pinPos);
          (m.pinned ? pinned : rest).push(m);
        });
        pinned.sort(function (a, b) { return pinPos[a.name] - pinPos[b.name]; });
        next = pinned.concat(rest);
      } else {
        // repos.json failed: live pins + the snapshot's remaining repos
        var seen = Object.create(null);
        next = [];
        pins.forEach(function (p) {
          if (seen[p.name]) return;
          seen[p.name] = true;
          next.push(mapEntry(p, true));
        });
        projects.forEach(function (p) {
          if (!seen[p.name]) next.push({
            name: p.name, url: p.url, desc: p.desc, language: p.language, fork: p.fork, pinned: false
          });
        });
      }

      if (reposOk && pinsOk) {
        var note = $("#snapshot-note");
        if (note && note.parentNode) note.parentNode.removeChild(note);
      }
      if (sameProjects(projects, next)) return; // identical: nothing to redraw

      // Differing live data replaces the texts in place: no entrance
      // animation, so rows that are already painted never drop to opacity 0.
      projects = next;
      safe("relistPinned", renderPinned);
      safe("relistRepos", function () { renderPills(); renderRepos(false); });
      setRepoCount();
    });
  }

  function setRepoCount() {
    var count = $("#repo-count");
    if (count && projects.length) count.textContent = String(projects.length);
  }

  /* ----------------------------------------------------------------------
     Footer year
     ---------------------------------------------------------------------- */
  function setFooterYear() {
    var node = $("#footer-year");
    if (node) node.textContent = String(new Date().getFullYear());
  }

  /* ----------------------------------------------------------------------
     PINNED grid (Overview). Built XSS-safe via createElement/textContent.
     ---------------------------------------------------------------------- */
  function renderPinned() {
    var grid = $("#pingrid");
    if (!grid) return;
    var pins = projects.filter(function (p) { return p.pinned; }).slice(0, 6);
    var frag = document.createDocumentFragment();

    pins.forEach(function (p) {
      var card = el("div", "pin");

      var top = el("div", "pin-top");
      appendIcon(top, ICO_REPO, 16);
      var href = safeUrl(p.url);
      var name = el(href ? "a" : "span", "name", p.name);
      if (href) {
        name.setAttribute("href", href);
        name.setAttribute("target", "_blank");
        name.setAttribute("rel", "noopener noreferrer");
        name.setAttribute("aria-label", "View the " + p.name + " repository on GitHub (opens in a new tab)");
      }
      top.appendChild(name);
      top.appendChild(el("span", "vis", "Public"));
      card.appendChild(top);

      card.appendChild(el("p", null, shownDesc(p.desc)));

      var meta = el("div", "pin-meta");
      var lang = el("span", "lang");
      var dot = el("i");
      dot.style.background = LANG_COLORS[p.language] || "#9aa5b0";
      dot.setAttribute("aria-hidden", "true");
      lang.appendChild(dot);
      lang.appendChild(document.createTextNode(p.language || ""));
      meta.appendChild(lang);
      card.appendChild(meta);

      frag.appendChild(card);
    });

    grid.textContent = "";
    grid.appendChild(frag);

    /* Honest > broken: when the public-repo whitelist is small (<=2 pins) the
       grid alone could read as "thin / unfinished". Render a dezent, truthful
       note + a prominent GitHub link RIGHT AFTER the grid so the section reads
       as deliberate. No fabricated projects. The note element is owned markup
       (not data); only the i18n string is text, set via textContent. It is
       rebuilt on every render (incl. language switch) and removed once more
       public projects push the pin count above 2. */
    var existingNote = grid.parentNode && grid.parentNode.querySelector(".pin-thin");
    if (existingNote) existingNote.parentNode.removeChild(existingNote);

    if (pins.length <= 2 && grid.parentNode) {
      var note = el("p", "pin-thin mono");
      var span = el("span", null, getString("overview.morepublic") || "More public projects coming soon.");
      span.setAttribute("data-i18n", "overview.morepublic");
      note.appendChild(span);
      note.appendChild(document.createTextNode("  "));
      var link = el("a", null, getString("repos.all") || "See all repositories on GitHub");
      link.setAttribute("href", "https://github.com/mguttmann?tab=repositories");
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
      link.setAttribute("data-i18n", "repos.all");
      note.appendChild(link);
      note.appendChild(document.createTextNode(" →"));
      grid.parentNode.appendChild(note);
    }
  }

  /* ----------------------------------------------------------------------
     REPOSITORIES panel: list + language pills + search. XSS-safe DOM.
     ---------------------------------------------------------------------- */
  var MOTION = false;
  var activeLang = "__ALL__";
  var query = "";

  function uniqueLangs() {
    var seen = {}, out = [];
    projects.forEach(function (p) {
      if (p.language && !seen[p.language]) { seen[p.language] = true; out.push(p.language); }
    });
    return out;
  }

  function renderPills() {
    var wrap = $("#langpills");
    if (!wrap) return;
    wrap.textContent = "";

    function pill(value, label, color) {
      var b = el("button", "lp" + (value === activeLang ? " on" : ""), null);
      b.setAttribute("type", "button");
      b.setAttribute("data-lang", value);
      if (value === activeLang) b.setAttribute("aria-pressed", "true");
      if (color) {
        var i = el("i");
        i.style.background = color;
        i.setAttribute("aria-hidden", "true");
        b.appendChild(i);
      }
      b.appendChild(document.createTextNode(label));
      return b;
    }

    wrap.appendChild(pill("__ALL__", getString("repos.allpill") || "All"));
    uniqueLangs().forEach(function (l) {
      wrap.appendChild(pill(l, l, LANG_COLORS[l] || "#9aa5b0"));
    });
  }

  /* `animate`: only a change the visitor just made (filter, search,
     language switch) plays the row entrance, and only with motion, as in
     the baseline. The first render and the live-data sync swap the rows
     without animation, so already painted rows never vanish and fade in
     again on their own. */
  function renderRepos(animate) {
    var list = $("#repolist");
    if (!list) return;
    var rows = projects.filter(function (p) {
      var langOk = (activeLang === "__ALL__") || (p.language === activeLang);
      var qOk = !query ||
        p.name.toLowerCase().indexOf(query) !== -1 ||
        (p.desc && p.desc.toLowerCase().indexOf(query) !== -1);
      return langOk && qOk;
    });

    list.textContent = "";
    if (!rows.length) {
      list.appendChild(el("div", "norepo", getString("repos.none") || "No repositories found."));
      return;
    }

    var frag = document.createDocumentFragment();
    rows.forEach(function (p, i) {
      var row = el("div", "rrow");
      if (animate === true && MOTION) {
        row.style.animation = "fadeUp .4s cubic-bezier(.2,.7,.2,1) both";
        row.style.animationDelay = (i * 45) + "ms";
      }

      var left = el("div", "l");

      var h3 = el("h3");
      var href = safeUrl(p.url);
      var nameNode = el(href ? "a" : "span", null, p.name);
      if (href) {
        nameNode.setAttribute("href", href);
        nameNode.setAttribute("target", "_blank");
        nameNode.setAttribute("rel", "noopener noreferrer");
        nameNode.setAttribute("aria-label", "View the " + p.name + " repository on GitHub (opens in a new tab)");
      }
      h3.appendChild(nameNode);
      h3.appendChild(el("span", "vis", "Public"));
      if (p.fork) h3.appendChild(el("span", "fork", getString("repos.fork") || "Fork"));
      left.appendChild(h3);

      left.appendChild(el("p", null, shownDesc(p.desc)));

      if (p.note) left.appendChild(el("p", "pin-note", p.note));

      if (p.topics && p.topics.length) {
        var topics = el("div", "topics");
        p.topics.forEach(function (t) { topics.appendChild(el("span", null, t)); });
        left.appendChild(topics);
      }

      var rm = el("div", "rm");
      var lang = el("span", "lang");
      var dot = el("i");
      dot.style.background = LANG_COLORS[p.language] || "#9aa5b0";
      dot.setAttribute("aria-hidden", "true");
      lang.appendChild(dot);
      lang.appendChild(document.createTextNode(p.language || ""));
      rm.appendChild(lang);
      rm.appendChild(el("span", null, getString("repos.updated") || "Updated on GitHub"));
      left.appendChild(rm);

      row.appendChild(left);

      var right = el("div", "r");
      if (href) {
        var star = el("a", "starbtn");
        star.setAttribute("href", href);
        star.setAttribute("target", "_blank");
        star.setAttribute("rel", "noopener noreferrer");
        star.setAttribute("aria-label", "Star the " + p.name + " repository on GitHub (opens in a new tab)");
        appendIcon(star, ICO_STAR, 15);
        star.appendChild(document.createTextNode("Star"));
        right.appendChild(star);
      }
      row.appendChild(right);

      frag.appendChild(row);
    });
    list.appendChild(frag);
  }

  function initRepos() {
    renderPills();
    renderRepos();

    var wrap = $("#langpills");
    if (wrap) {
      wrap.addEventListener("click", function (e) {
        var btn = e.target.closest ? e.target.closest(".lp") : null;
        if (!btn) return;
        activeLang = btn.getAttribute("data-lang");
        renderPills();
        renderRepos(true);
      });
    }
    var search = $("#repoSearch");
    if (search) {
      search.addEventListener("input", function (e) {
        query = String(e.target.value || "").toLowerCase().trim();
        renderRepos(true);
      });
    }
    setRepoCount();
  }

  /* ----------------------------------------------------------------------
     STACK panel. XSS-safe DOM. Headings re-rendered on language switch.
     ---------------------------------------------------------------------- */
  function renderStack() {
    var grid = $("#stackgrid");
    if (!grid) return;
    var headings = STACK_HEADINGS[currentLang] || STACK_HEADINGS.en;
    var frag = document.createDocumentFragment();

    skills.forEach(function (s) {
      var blk = el("div", "skblk");
      blk.appendChild(el("h4", null, headings[s.key] || s.h));
      var chips = el("div", "chips");
      s.items.forEach(function (item) { chips.appendChild(el("span", null, item)); });
      blk.appendChild(chips);
      frag.appendChild(blk);
    });

    grid.textContent = "";
    grid.appendChild(frag);
  }

  /* ----------------------------------------------------------------------
     Tabs (Overview / Repositories / Stack) + sliding tab-ink.
     ARIA tab pattern (tablist / tab / tabpanel, aria-selected, roving
     tabindex, Arrow / Home / End keys), set here and not in the HTML:
     without JavaScript the tabs cannot switch, so the static markup must
     not announce a tab widget. If any tab lacks its panel, no roles are set.
     ---------------------------------------------------------------------- */
  function initTabs() {
    var tabs = $all(".tab");
    var ink = $("#tabink");
    if (!tabs.length) return;

    var nav = $("#tabs");
    var aria = !!nav && tabs.every(function (t) {
      return !!document.getElementById("panel-" + t.getAttribute("data-panel"));
    });
    if (aria) {
      nav.setAttribute("role", "tablist");
      tabs.forEach(function (t) {
        var name = t.getAttribute("data-panel");
        var panel = document.getElementById("panel-" + name);
        t.id = "tab-" + name;
        t.setAttribute("role", "tab");
        t.setAttribute("aria-controls", panel.id);
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", t.id);
        panel.removeAttribute("aria-label");
      });
    }

    function syncTabState() {
      if (!aria) return;
      tabs.forEach(function (t) {
        var on = t.classList.contains("active");
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.setAttribute("tabindex", on ? "0" : "-1");
      });
    }
    syncTabState();

    function moveInk(tab) {
      if (!ink || !tab) return;
      ink.style.left = tab.offsetLeft + "px";
      ink.style.width = tab.offsetWidth + "px";
    }

    function showTab(name) {
      tabs.forEach(function (t) { t.classList.toggle("active", t.getAttribute("data-panel") === name); });
      syncTabState();
      $all(".panel").forEach(function (p) {
        var on = p.id === "panel-" + name;
        p.classList.toggle("show", on);
        if (on && MOTION) {
          p.style.animation = "none";
          void p.offsetWidth;
          p.style.animation = "fadeUp .4s cubic-bezier(.2,.7,.2,1) both";
        }
      });
      var t = tabs.filter(function (t) { return t.getAttribute("data-panel") === name; })[0];
      if (t) moveInk(t);
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    }

    tabs.forEach(function (t) {
      t.addEventListener("click", function () { showTab(t.getAttribute("data-panel")); });
    });
    if (aria) {
      nav.addEventListener("keydown", function (e) {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        var i = tabs.indexOf(document.activeElement);
        if (i < 0) return;
        var j;
        if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = tabs.length - 1;
        else return;
        e.preventDefault();
        showTab(tabs[j].getAttribute("data-panel"));
        tabs[j].focus();
      });
    }
    $all("[data-go]").forEach(function (node) {
      node.addEventListener("click", function (e) {
        e.preventDefault();
        showTab(node.getAttribute("data-go"));
      });
    });

    function initInk() {
      var a = tabs.filter(function (t) { return t.classList.contains("active"); })[0];
      if (a) moveInk(a);
    }
    window.addEventListener("load", initInk);
    window.addEventListener("resize", initInk);
    initInk();
    setTimeout(initInk, 200);
  }

  /* ----------------------------------------------------------------------
     NOTE: the former illustrative 53x7 contribution graph was REPLACED by the
     real, auto-updated remote SVGs embedded directly in index.html (the light
     "snake" + the 3D night-rainbow calendar, both from mguttmann/mguttmann@
     output via raw.githubusercontent.com - see STATS-ASSETS.md). Those embeds
     are plain <img> tags with their own onerror graceful fallback and need no
     JavaScript, so the old buildGraph()/graphCells machinery is gone.
     ---------------------------------------------------------------------- */

  /* ----------------------------------------------------------------------
     Scroll-reveal (from template reveal.js): arms (hides) elements only if
     the browser's animation timeline actually advances. In frozen/offscreen
     contexts and under reduced motion, everything stays visible.
     ---------------------------------------------------------------------- */
  function initReveal() {
    if (reduceMotion) return; // CSS already keeps .reveal visible

    function arm() {
      // Only arm blocks that cannot have been painted yet: main.js runs at the
      // end of <body>, so the browser may already have painted everything in
      // (or above) the viewport, including the pre-rendered pins. Hiding such
      // a block and fading it in again would be a visible flash. Blocks with
      // no layout box (inactive tab panel) are left alone too.
      var els = $all(".reveal").filter(function (node) { return !mayBePainted(node); });
      els.forEach(function (node, i) {
        node.classList.add("armed");
        node.style.transitionDelay = (Math.min(i % 6, 5) * 55) + "ms";
      });
      function show() {
        var h = window.innerHeight || 800;
        $all(".reveal.armed").forEach(function (node) {
          if (node.getBoundingClientRect().top < h * 0.9) node.classList.remove("armed");
        });
      }
      window.addEventListener("scroll", show, { passive: true });
      window.addEventListener("resize", show);
      requestAnimationFrame(function () { requestAnimationFrame(show); });
      setTimeout(show, 120);
      setTimeout(show, 500);
      // SAFETY NET: never leave content hidden.
      setTimeout(function () { $all(".reveal.armed").forEach(function (n) { n.classList.remove("armed"); }); }, 2500);
    }

    motionProbe(arm);
  }

  /* True unless the element lies entirely below the viewport with a real
     layout box. Anything that is (or was, above the fold) on screen, and
     anything without a box, counts as possibly painted and is never hidden
     by an entrance effect. */
  function mayBePainted(node) {
    var r = node.getBoundingClientRect();
    if (!r.width && !r.height) return true;
    var h = window.innerHeight || 800;
    return r.top < h;
  }

  /* Shared motion probe: only fire cb if CSS transitions are actually running
     (skips frozen/offscreen renders) and motion is allowed. */
  function motionProbe(cb) {
    if (reduceMotion) return;
    var p = document.createElement("div");
    p.style.cssText = "position:fixed;left:-9999px;top:0;width:10px;height:10px;opacity:0;transition:opacity .25s linear";
    document.body.appendChild(p);
    p.getBoundingClientRect();
    p.style.opacity = "1";
    setTimeout(function () {
      var v = parseFloat(getComputedStyle(p).opacity);
      p.remove();
      if (v > 0.02 && v < 0.999) cb();
    }, 90);
  }

  /* ----------------------------------------------------------------------
     Decorative animations: avatar pop, graph fill-in, counter count-up,
     typed README. All behind motionProbe + reduced-motion. Static fallback
     guarantees the final values even if animation never runs.
     ---------------------------------------------------------------------- */
  function runMotion() {
    if (reduceMotion) { staticFallback(); return; }

    motionProbe(function () {
      MOTION = true;

      // Entrance pop on the ring (opacity-only so it never fights the ring's
      // continuous spin transform); the portrait counter-rotates via CSS and
      // must keep its own animation untouched, so we do NOT style .avatar-lg.
      var ring = $(".avatar-ring");
      // Skipped when the ring may already be painted (it sits above the fold),
      // so the already visible avatar never blinks out and back in.
      if (ring && !mayBePainted(ring)) ring.style.animation = "avpop .7s ease both, spin 9s linear infinite";

      // counter count-up (only numeric boxes; TODO pills are skipped)
      $all("[data-count]").forEach(function (node) {
        var target = parseInt(node.getAttribute("data-count"), 10);
        if (isNaN(target)) return;
        var dur = 1200, t0 = performance.now();
        (function tick(now) {
          var pr = Math.min(1, (now - t0) / dur);
          var e = 1 - Math.pow(1 - pr, 3);
          node.textContent = String(Math.round(target * e));
          if (pr < 1) requestAnimationFrame(tick);
        })(performance.now());
      });

      // typed README
      typeReadme();
    });

    // fallback static values if the probe never armed (e.g. offscreen capture)
    setTimeout(staticFallback, 700);
  }

  function typeReadme() {
    var tt = $("#typetarget");
    if (!tt) return;
    var txt = currentTypedText();
    var ci = 0;
    // Type only while the pre-rendered sentence is still hidden by the <head>
    // class. If it is already visible (the 3 s safety net in index.html fired,
    // or the head script never ran), clearing and retyping it would be a
    // visible flash: keep the sentence as it is.
    if (!document.documentElement.classList.contains("typing-pending")) {
      if (tt.textContent !== txt) tt.textContent = txt;
      return;
    }
    // textContent only for data; the cursor is a literal element we own.
    tt.textContent = "";
    releaseTyped();
    var cur = document.createElement("span");
    cur.className = "cursor";
    tt.appendChild(cur);
    (function type() {
      if (ci <= txt.length) {
        tt.textContent = txt.slice(0, ci);
        var c = document.createElement("span");
        c.className = "cursor";
        tt.appendChild(c);
        ci++;
        setTimeout(type, 14);
      } else {
        tt.textContent = txt;
      }
    })();
  }

  function currentTypedText() {
    var tt = $("#typetarget");
    var key = tt && tt.getAttribute("data-i18n-typed");
    return (key && getString(key)) || (tt && tt.getAttribute("data-text")) || "";
  }

  /* Drop the <head> class that hides the pre-rendered sentence (index.html). */
  function releaseTyped() {
    document.documentElement.classList.remove("typing-pending");
  }

  function staticFallback() {
    releaseTyped();
    $all("[data-count]").forEach(function (node) {
      if (node.textContent.trim() === "0" || node.textContent.trim() === "") {
        var t = parseInt(node.getAttribute("data-count"), 10);
        if (!isNaN(t)) node.textContent = String(t);
      }
    });
    var tt = $("#typetarget");
    if (tt && !tt.textContent.trim()) tt.textContent = currentTypedText();
  }

  /* ----------------------------------------------------------------------
     EMPLOYER fill (sidebar location) from the single config.
     ---------------------------------------------------------------------- */
  function employerLoc() {
    if (EMPLOYER.publish && EMPLOYER.location) return EMPLOYER.location;
    return EMPLOYER.genericLoc[currentLang] || EMPLOYER.genericLoc.en;
  }
  function applyEmployer() {
    var loc = $("#facts-location");
    if (loc) loc.textContent = employerLoc();
  }

  /* ----------------------------------------------------------------------
     EN / DE language toggle. Swaps all [data-i18n] text + placeholders +
     <html lang>, re-renders the data-driven panels in the chosen language.
     ---------------------------------------------------------------------- */
  function applyLang(lang, userAction) {
    currentLang = (lang === "en") ? "en" : "de";
    document.documentElement.setAttribute("lang", currentLang);

    $all("[data-i18n]").forEach(function (node) {
      var key = node.getAttribute("data-i18n");
      var val = getString(key);
      if (val != null) node.textContent = val;
    });
    $all("[data-i18n-placeholder]").forEach(function (node) {
      var key = node.getAttribute("data-i18n-placeholder");
      var val = getString(key);
      if (val != null) node.setAttribute("placeholder", val);
    });

    // re-render data-driven, language-dependent panels
    safe("relangRepos", function () { renderPills(); renderRepos(userAction); });
    safe("relangStack", renderStack);
    safe("relangTyped", function () {
      var tt = $("#typetarget");
      if (tt && tt.textContent.trim()) tt.textContent = currentTypedText();
    });

    applyEmployer();

    // toggle button visual state
    var btn = $("#lang-toggle");
    if (btn) {
      btn.setAttribute("data-lang-current", currentLang);
      var de = $(".de", btn), en = $(".en", btn);
      if (de) de.className = "de " + (currentLang === "de" ? "on" : "off");
      if (en) en.className = "en " + (currentLang === "en" ? "on" : "off");
    }
  }

  function initLangToggle() {
    var btn = $("#lang-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      applyLang(currentLang === "de" ? "en" : "de", true);
    });
  }

})();
