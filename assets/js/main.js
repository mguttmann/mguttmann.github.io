/* ==========================================================================
   Manuel Guttmann - Portfolio - main.js
   Vanilla JS, no libraries. Progressive enhancement only: all content lives in
   index.html and is fully visible without JS. This script just:
     - stamps the current year in the footer
     - reveals sections on scroll (gated behind a real motion probe, skipped
       under prefers-reduced-motion, with a safety net so nothing stays hidden)
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $all(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }
  function safe(label, fn) {
    try { fn(); }
    catch (err) { if (window.console && console.warn) console.warn("[main.js] '" + label + "' failed:", err); }
  }

  document.addEventListener("DOMContentLoaded", function () {
    safe("footerYear", setFooterYear);
    safe("reveal", initReveal);
  });

  /* Footer year */
  function setFooterYear() {
    var node = document.getElementById("footer-year");
    if (node) node.textContent = String(new Date().getFullYear());
  }

  /* Scroll-reveal: arms (hides) .reveal elements only if the browser's
     animation timeline actually advances. Under reduced motion or in
     frozen/offscreen contexts everything stays visible. */
  function initReveal() {
    if (reduceMotion) return; // CSS keeps .reveal visible

    motionProbe(function () {
      var els = $all(".reveal");
      els.forEach(function (node, i) {
        node.classList.add("armed");
        node.style.transitionDelay = (Math.min(i, 7) * 70) + "ms";
      });

      function show() {
        var h = window.innerHeight || 800;
        $all(".reveal.armed").forEach(function (node) {
          if (node.getBoundingClientRect().top < h * 0.92) node.classList.remove("armed");
        });
      }
      window.addEventListener("scroll", show, { passive: true });
      window.addEventListener("resize", show);
      requestAnimationFrame(function () { requestAnimationFrame(show); });
      setTimeout(show, 120);
      setTimeout(show, 500);
      // SAFETY NET: never leave content hidden.
      setTimeout(function () {
        $all(".reveal.armed").forEach(function (n) { n.classList.remove("armed"); });
      }, 2600);
    });
  }

  /* Only fire cb if CSS transitions actually run (skips frozen/offscreen
     renders) and motion is allowed. */
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

})();
