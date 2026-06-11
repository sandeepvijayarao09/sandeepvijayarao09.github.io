(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

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

  const statNums = document.querySelectorAll(".stat-num");
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

  /* card spotlight: cursor-tracked sheen, fine pointers only */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll("a.card").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", e.clientX - r.left + "px");
        card.style.setProperty("--my", e.clientY - r.top + "px");
      });
    });
  }

  /* hero canvas: drifting node field with proximity edges */
  const canvas = document.getElementById("field");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const ACCENT = "52, 211, 153";
  const LINK_DIST = 110;
  let nodes = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = null;
  let inView = true;
  const pointer = { x: null, y: null };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    if (reduceMotion) draw();
  }

  function seed() {
    const count = Math.min(90, Math.round((width * height) / 9000));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() < 0.12 ? 2.4 : 1.4,
    }));
  }

  function step() {
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      if (pointer.x !== null) {
        const dx = pointer.x - n.x;
        const dy = pointer.y - n.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 22500 && d2 > 1) {
          const f = 0.012 / Math.sqrt(d2);
          n.vx += dx * f;
          n.vy += dy * f;
        }
      }
      n.vx = Math.max(-0.5, Math.min(0.5, n.vx));
      n.vy = Math.max(-0.5, Math.min(0.5, n.vy));
      if (n.x < -10) n.x = width + 10;
      if (n.x > width + 10) n.x = -10;
      if (n.y < -10) n.y = height + 10;
      if (n.y > height + 10) n.y = -10;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < LINK_DIST) {
          ctx.strokeStyle = `rgba(${ACCENT}, ${(1 - d / LINK_DIST) * 0.32})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (const n of nodes) {
      ctx.fillStyle = `rgba(${ACCENT}, ${n.r > 2 ? 0.9 : 0.55})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop() {
    step();
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (rafId === null && !reduceMotion && inView) rafId = requestAnimationFrame(loop);
  }

  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  new ResizeObserver(resize).observe(canvas);
  resize();

  if (reduceMotion) {
    draw(); /* one static frame, no loop */
  } else {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) start();
      else stop();
    }).observe(canvas);

    canvas.parentElement.addEventListener("pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    });
    canvas.parentElement.addEventListener("pointerleave", () => {
      pointer.x = null;
      pointer.y = null;
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else start();
    });

    start();
  }
})();
