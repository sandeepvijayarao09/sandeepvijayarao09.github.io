(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* theme toggle: follows the system until the visitor picks one, then
     pins it on <html data-theme>; the inline head script applies it pre-paint */
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const toggle = document.querySelector("[data-theme-toggle]");
  const currentTheme = () => root.dataset.theme || (systemDark.matches ? "dark" : "light");
  function syncTheme() {
    const theme = currentTheme();
    if (toggle) toggle.setAttribute("aria-label", theme === "dark" ? "Use light theme" : "Use dark theme");
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (root.dataset.theme) m.setAttribute("content", theme === "dark" ? "#161617" : "#fbfbfd");
    });
  }
  if (toggle) {
    toggle.addEventListener("click", () => {
      root.dataset.theme = currentTheme() === "dark" ? "light" : "dark";
      try { localStorage.setItem("theme", root.dataset.theme); } catch (e) { /* private mode: still switches */ }
      syncTheme();
    });
  }
  systemDark.addEventListener("change", syncTheme);
  syncTheme();

  /* nav border: sentinel observer instead of scroll listener */
  const nav = document.getElementById("nav");
  const sentinel = document.getElementById("top-sentinel");
  if (nav && sentinel) {
    new IntersectionObserver(([entry]) => {
      nav.classList.toggle("scrolled", !entry.isIntersecting);
    }).observe(sentinel);
  }

  /* headline word-rise: split h1 text into staggered word spans */
  if (!reduceMotion) {
    document.querySelectorAll(".hero h1, .page-header h1").forEach((h) => {
      const nodes = Array.from(h.childNodes);
      let wi = 0;
      for (const node of nodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const frag = document.createDocumentFragment();
        for (const part of node.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(part));
          } else {
            const s = document.createElement("span");
            s.className = "h-word";
            s.style.setProperty("--wi", wi++);
            s.textContent = part;
            frag.appendChild(s);
          }
        }
        h.replaceChild(frag, node);
      }
      h.classList.add("split");
    });
  }

  /* scroll reveals */
  const revealEls = document.querySelectorAll("[data-reveal]");
  if (reduceMotion) {
    revealEls.forEach((el) => el.classList.add("in"));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            revealObserver.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el) => revealObserver.observe(el));
  }

  /* stat count-up: numbers tick to their value when first seen */
  function countUp(el) {
    const original = el.textContent.trim();
    const m = original.match(/^(\d+(?:\.\d+)?)([\s\S]*)$/);
    if (!m) return;
    if (/^(19|20)\d{2}$/.test(m[1])) return; /* years don't count up */
    const target = parseFloat(m[1]);
    const suffix = m[2];
    const decimals = (m[1].split(".")[1] || "").length;
    const duration = 900;
    const t0 = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = original;
    }
    requestAnimationFrame(tick);
  }

  /* [data-oss] stats load live and animate themselves in oss.js */
  const statNums = document.querySelectorAll(".stat-num:not([data-oss])");
  if (!reduceMotion && statNums.length) {
    const statObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            statObserver.unobserve(entry.target);
            countUp(entry.target);
          }
        }
      },
      { threshold: 0.6 }
    );
    statNums.forEach((n) => statObserver.observe(n));
  }
})();
