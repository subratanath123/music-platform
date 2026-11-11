(function () {
  const groups = [
    ["open", "Start here"],
    ["theory", "How things work (Theory)"],
    ["recipes", "Step-by-step recipes"],
    ["trouble", "Troubleshooting"],
    ["choices", "Design choices"],
  ];

  const toc = document.getElementById("toc");
  const main = document.getElementById("main");
  const q = document.getElementById("q");
  const nav = document.getElementById("nav");
  const toggle = document.getElementById("nav-toggle");

  if (window.mermaid) {
    mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function unescapeHtml(str) {
    return String(str)
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  function normalizeArticle(raw) {
    if (raw.summary) return raw;
    const ideaParts = [];
    if (raw.why) ideaParts.push("<p>" + raw.why + "</p>");
    if (raw.what) ideaParts.push("<p><strong>What it is:</strong> " + raw.what + "</p>");
    if (raw.when || raw.where) {
      const meta = [];
      if (raw.when) meta.push("<strong>When:</strong> " + raw.when);
      if (raw.where) meta.push("<strong>Where:</strong> " + raw.where);
      ideaParts.push("<p>" + meta.join(" &nbsp;·&nbsp; ") + "</p>");
    }

    const steps = [];
    let extra = raw.body || "";
    const preRegex = /<pre><code>([\s\S]*?)<\/code><\/pre>\s*(?:<p>([\s\S]*?)<\/p>)?/g;
    if (preRegex.test(extra)) {
      extra = extra.replace(preRegex, function (_, code, explain) {
        steps.push({
          lang: code.trim().startsWith("{") ? "json" : (code.trim().startsWith("-") || code.includes("apiVersion:") ? "yaml" : "bash"),
          code: unescapeHtml(code.trim()),
          explain: explain || "Run this command in your shell.",
        });
        return "";
      });
    }

    const paths = (raw.options || []).map(function (o) {
      return { label: o.name, text: o.note, picked: Boolean(o.picked) };
    });

    const whyMatters = [];
    if (raw.chose) whyMatters.push({ label: "Why we picked this", text: raw.chose });
    if (raw.missing) whyMatters.push({ label: "If this is missing or wrong", text: raw.missing });

    return {
      id: raw.id,
      group: raw.group,
      kicker: raw.kicker,
      title: raw.title,
      short: raw.short,
      summary: raw.lede || "",
      idea: ideaParts.join(""),
      stepsHeading: raw.group === "recipes" ? "What each command does" : "In practice",
      steps: steps,
      extra: extra.trim(),
      pathsHeading: paths.length === 2 ? "Two paths" : "Available options",
      paths: paths,
      editAfter: raw.editAfter || null,
      whyMatters: whyMatters,
      files: raw.files || [],
      search: raw.search || "",
    };
  }

  function searchBlob(raw) {
    const a = normalizeArticle(raw);
    const parts = [
      a.title,
      a.short,
      a.summary,
      a.idea,
      a.search || "",
      (a.files || []).join(" "),
      (a.steps || []).map(function (s) { return (s.label || "") + " " + (s.code || "") + " " + s.explain; }).join(" "),
      (a.paths || []).map(function (p) { return p.label + " " + p.text; }).join(" "),
      (a.whyMatters || []).map(function (m) { return m.label + " " + m.text; }).join(" "),
      a.editAfter ? a.editAfter.text : "",
      a.extra || "",
    ];
    return parts.join(" ").toLowerCase();
  }

  function articles() {
    const query = q.value.trim().toLowerCase();
    if (!query) return window.BOOK;
    return window.BOOK.filter(function (a) {
      return searchBlob(a).includes(query);
    });
  }

  function renderNav() {
    const list = articles();
    toc.innerHTML = "";
    if (!list.length) {
      toc.innerHTML = '<p class="empty-nav">Nothing matches that search.</p>';
      return;
    }
    const currentHash = location.hash || "#" + window.BOOK[0].id;
    groups.forEach(function (g) {
      const items = list.filter(function (a) { return a.group === g[0]; });
      if (!items.length) return;
      const block = document.createElement("div");
      block.className = "group";
      const label = document.createElement("p");
      label.className = "group-label";
      label.textContent = g[1];
      block.appendChild(label);
      items.forEach(function (a) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "toc-link" + (currentHash === "#" + a.id ? " active" : "");
        btn.innerHTML = a.title + "<small>" + a.short + "</small>";
        btn.addEventListener("click", function () {
          location.hash = a.id;
          nav.classList.remove("open");
          toggle.setAttribute("aria-expanded", "false");
        });
        block.appendChild(btn);
      });
      toc.appendChild(block);
    });
  }

  function renderSteps(a) {
    if (!a.steps || !a.steps.length) return "";
    const heading = a.stepsHeading || "What each command does";
    const items = a.steps.map(function (s, idx) {
      const labelHtml = s.label ? '<p class="step-label">' + s.label + "</p>" : "";
      const codeHtml = s.code
        ? '<div class="code-wrap">' +
            '<div class="code-bar"><span>' + escapeHtml(s.lang || "bash") + '</span>' +
            '<button type="button" class="copy-btn" data-copy="' + idx + '">Copy</button></div>' +
            "<pre><code>" + escapeHtml(s.code) + "</code></pre>" +
          "</div>"
        : "";
      return '<div class="step">' + labelHtml + codeHtml + '<p class="step-explain">' + s.explain + "</p></div>";
    }).join("");
    return '<h2 class="section">' + heading + '</h2><div class="steps">' + items + "</div>";
  }

  function renderPaths(a) {
    if (!a.paths || !a.paths.length) return "";
    const heading = a.pathsHeading || "Two paths";
    const items = a.paths.map(function (p) {
      const badge = p.picked ? '<span class="path-badge">Our pick</span>' : "";
      return '<li class="path-item' + (p.picked ? " picked" : "") + '">' +
        "<strong>" + p.label + ":</strong>" + badge + " " + p.text +
      "</li>";
    }).join("");
    return '<h2 class="section">' + heading + '</h2><ul class="paths">' + items + "</ul>";
  }

  function renderEditAfter(a) {
    if (!a.editAfter) return "";
    const heading = a.editAfter.heading || "One edit afterwards";
    return '<aside class="edit-box"><h2>' + heading + "</h2><p>" + a.editAfter.text + "</p></aside>";
  }

  function renderMatters(a) {
    if (!a.whyMatters || !a.whyMatters.length) return "";
    const items = a.whyMatters.map(function (m) {
      return "<li><strong>" + m.label + ":</strong> " + m.text + "</li>";
    }).join("");
    return '<h2 class="section">Why it matters</h2><ul class="matters">' + items + "</ul>";
  }

  function render() {
    const id = (location.hash || "#how-to-read").slice(1);
    const list = window.BOOK;
    const index = Math.max(0, list.findIndex(function (x) { return x.id === id; }));
    const raw = list[index] || list[0];
    const a = normalizeArticle(raw);
    const prev = list[index - 1];
    const next = list[index + 1];

    const ideaHtml = a.idea
      ? '<h2 class="section">The idea</h2><div class="idea">' + a.idea + "</div>"
      : "";

    const extraHtml = a.extra
      ? '<h2 class="section">Details</h2><div class="extra">' + a.extra + "</div>"
      : "";

    main.innerHTML =
      '<p class="kicker">' + a.kicker + "</p>" +
      "<h1>" + a.title + "</h1>" +
      '<p class="summary">' + a.summary + "</p>" +
      ideaHtml +
      renderSteps(a) +
      extraHtml +
      renderPaths(a) +
      renderEditAfter(a) +
      renderMatters(a) +
      (a.files && a.files.length
        ? '<p class="files">Files in this repo: ' + a.files.map(function (f) { return "<code>" + f + "</code>"; }).join(" · ") + "</p>"
        : "") +
      '<div class="pager">' +
        (prev ? '<button type="button" id="prev">← ' + prev.title + "</button>" : "<span></span>") +
        (next ? '<button type="button" id="next">' + next.title + " →</button>" : "<span></span>") +
      "</div>";

    main.querySelectorAll(".copy-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const i = Number(btn.getAttribute("data-copy"));
        const step = a.steps && a.steps[i];
        if (!step || !step.code || !navigator.clipboard) return;
        navigator.clipboard.writeText(step.code).then(function () {
          btn.textContent = "Copied";
          setTimeout(function () { btn.textContent = "Copy"; }, 1400);
        });
      });
    });

    const prevBtn = document.getElementById("prev");
    const nextBtn = document.getElementById("next");
    if (prevBtn) prevBtn.onclick = function () { location.hash = prev.id; };
    if (nextBtn) nextBtn.onclick = function () { location.hash = next.id; };
    renderNav();
    window.scrollTo(0, 0);
    main.focus();
    if (window.mermaid) {
      mermaid.run({ nodes: main.querySelectorAll(".mermaid") }).catch(function () {});
    }
  }

  q.addEventListener("input", renderNav);
  window.addEventListener("hashchange", render);
  toggle.addEventListener("click", function () {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  render();
})();
