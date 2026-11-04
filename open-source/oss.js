(() => {
  "use strict";

  /* Live open-source stats from the public GitHub API, no token.
     Search allows 10 unauthenticated calls a minute per visitor, so
     results are cached for 15 minutes and the last good copy is shown
     if GitHub rate-limits us. */

  /* both of my GitHub accounts; totals are summed across them */
  const USERS = ["sandeepvijayarao09", "mlzerotoheroyoutube"];
  const API = "https://api.github.com";
  const CACHE_KEY = "oss-stats-v2";
  const CACHE_MS = 15 * 60 * 1000;
  const GITHUB_LIST = "https://github.com/pulls?q=" + encodeURIComponent(
    "is:pr " + USERS.map((u) => `author:${u}`).join(" ") + " " + USERS.map((u) => `-user:${u}`).join(" "));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const list = document.getElementById("oss-list");
  const updated = document.getElementById("oss-updated");
  if (!list) return;

  async function get(path) {
    const res = await fetch(API + path, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(res.status + " " + path);
    return res.json();
  }

  async function load() {
    /* PRs from either account on repos neither account owns */
    const authors = USERS.map((u) => `author:${u}`).join(" ");
    const owners = USERS.map((u) => `-user:${u}`).join(" ");
    const prs = await get(`/search/issues?q=${encodeURIComponent(`is:pr ${authors} ${owners}`)}&sort=created&order=desc&per_page=100`);
    /* commit search ignores a second author: one query per account */
    const [commits, users] = await Promise.all([
      Promise.all(USERS.map((u) => get(`/search/commits?q=${encodeURIComponent(`author:${u}`)}&per_page=1`))),
      Promise.all(USERS.map((u) => get(`/users/${u}`))),
    ]);

    const items = prs.items.map((i) => ({
      repo: i.repository_url.split("/repos/")[1],
      number: i.number,
      title: i.title,
      url: i.html_url,
      created: i.created_at,
      author: i.user.login,
      state: i.pull_request && i.pull_request.merged_at ? "merged" : i.state === "open" ? "open" : "closed",
    }));

    const repoNames = [...new Set(items.map((i) => i.repo))];
    const repos = await Promise.all(
      repoNames.map((r) => get(`/repos/${r}`).then((d) => [r, d.stargazers_count]).catch(() => [r, 0]))
    );
    const stars = Object.fromEntries(repos);

    return {
      at: Date.now(),
      items,
      stars,
      totals: {
        merged: items.filter((i) => i.state === "merged").length,
        open: items.filter((i) => i.state === "open").length,
        repos: repoNames.length,
        stars: repos.reduce((s, [, n]) => s + n, 0),
        commits: commits.reduce((s, c) => s + c.total_count, 0),
        publicRepos: users.reduce((s, u) => s + u.public_repos, 0),
      },
    };
  }

  function readCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY));
    } catch {
      return null;
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {
      /* private mode or blocked storage: the page still works */
    }
  }

  function fmt(n) {
    return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n);
  }

  function countTo(el, value) {
    const text = fmt(value);
    if (reduceMotion || value < 2 || value >= 1000) {
      el.textContent = text;
      return;
    }
    const t0 = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - t0) / 900);
      el.textContent = String(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = text;
    }
    requestAnimationFrame(tick);
  }

  const LABEL = { merged: "Merged", open: "In review", closed: "Closed" };

  function render(data) {
    for (const el of document.querySelectorAll("[data-oss]")) {
      const v = data.totals[el.dataset.oss];
      if (typeof v === "number") countTo(el, v);
    }

    list.replaceChildren();
    if (!data.items.length) {
      const li = document.createElement("li");
      li.className = "oss-empty";
      li.textContent = "No upstream pull requests yet.";
      list.append(li);
    }
    for (const pr of data.items) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "oss-pr";
      a.href = pr.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.dataset.state = pr.state;

      const repo = document.createElement("span");
      repo.className = "oss-repo";
      repo.textContent = `${pr.repo} #${pr.number}`;

      const title = document.createElement("span");
      title.className = "oss-title";
      title.textContent = pr.title;

      const meta = document.createElement("span");
      meta.className = "oss-meta";
      const starCount = data.stars[pr.repo];
      const date = new Date(pr.created).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      meta.textContent = [date, starCount ? `★ ${fmt(starCount)}` : "", `@${pr.author}`].filter(Boolean).join(" · ");

      const pill = document.createElement("span");
      pill.className = "oss-pill";
      pill.textContent = LABEL[pr.state];

      a.append(repo, pill, title, meta);
      li.append(a);
      list.append(li);
    }

    const when = new Date(data.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    updated.textContent = `Live from the GitHub API. Last refreshed ${when}.`;
  }

  async function init() {
    const cached = readCache();
    if (cached) render(cached);
    if (cached && Date.now() - cached.at < CACHE_MS) return;
    try {
      const fresh = await load();
      writeCache(fresh);
      render(fresh);
    } catch (err) {
      if (!cached) {
        list.replaceChildren();
        const li = document.createElement("li");
        li.className = "oss-empty";
        li.innerHTML = 'GitHub is rate-limiting this page right now. <a href="' + GITHUB_LIST + '" target="_blank" rel="noopener">See the list on GitHub</a>.';
        list.append(li);
      }
    }
  }

  init();
})();
