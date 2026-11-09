(function () {
  const groups = [
    ["open", "Open the book"],
    ["theory", "Theory"],
    ["recipes", "Recipes"],
    ["trouble", "If it is missing"],
    ["choices", "Why this one"],
  ];

  const toc = document.getElementById("toc");
  const main = document.getElementById("main");
  const q = document.getElementById("q");
  const nav = document.getElementById("nav");
  const toggle = document.getElementById("nav-toggle");

  if (window.mermaid) {
    mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
  }

  function articles() {
    const query = q.value.trim().toLowerCase();
    if (!query) return window.BOOK;
    return window.BOOK.filter(function (a) {
      return (a.title + " " + a.lede + " " + a.why + " " + a.what + " " + (a.search || ""))
        .toLowerCase()
        .includes(query);
    });
  }

  function renderNav() {
    const list = articles();
    toc.innerHTML = "";
    if (!list.length) {
      toc.innerHTML = '<p class="empty-nav">Nothing matches.</p>';
      return;
    }
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
        btn.className = "toc-link" + (location.hash === "#" + a.id ? " active" : "");
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

  function fact(title, text) {
    return '<section class="fact"><h2>' + title + "</h2><p>" + text + "</p></section>";
  }

  function render() {
    const id = (location.hash || "#how-to-read").slice(1);
    const list = window.BOOK;
    const index = Math.max(0, list.findIndex(function (a) { return a.id === id; }));
    const a = list[index] || list[0];
    const prev = list[index - 1];
    const next = list[index + 1];
    const options = (a.options || []).map(function (o) {
      return '<div class="option' + (o.picked ? " picked" : "") + '"><strong>' + o.name + "</strong><span>" + o.note + "</span></div>";
    }).join("");

    main.innerHTML =
      '<p class="kicker">' + a.kicker + "</p>" +
      "<h1>" + a.title + "</h1>" +
      '<p class="lede">' + a.lede + "</p>" +
      '<div class="facts">' +
        fact("Why", a.why) +
        fact("What", a.what) +
        fact("When", a.when) +
        fact("Where", a.where) +
      "</div>" +
      (options ? '<h2 class="section">Options</h2><div class="options">' + options + "</div>" : "") +
      '<aside class="callout chose"><h2>Why we chose it</h2><p>' + a.chose + "</p></aside>" +
      '<aside class="callout missing"><h2>If it is not there</h2><p>' + a.missing + "</p></aside>" +
      '<h2 class="section">How it actually works</h2><div class="body">' + a.body + "</div>" +
      (a.files ? '<p class="files">Files: ' + a.files.map(function (f) { return "<code>" + f + "</code>"; }).join(" · ") + "</p>" : "") +
      '<div class="pager">' +
        (prev ? '<button type="button" id="prev">← ' + prev.title + "</button>" : "<span></span>") +
        (next ? '<button type="button" id="next">' + next.title + " →</button>" : "<span></span>") +
      "</div>";

    const prevBtn = document.getElementById("prev");
    const nextBtn = document.getElementById("next");
    if (prevBtn) prevBtn.onclick = function () { location.hash = prev.id; };
    if (nextBtn) nextBtn.onclick = function () { location.hash = next.id; };
    renderNav();
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
