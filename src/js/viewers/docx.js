/* Word (.docx) viewer built on docx-preview: pages, headers, footers, zoom. */
(function () {
  "use strict";
  const { el, button } = AnyPage;

  AnyPage.register({
    id: "docx",
    label: "Word document",
    kind: "doc",
    exts: [".docx", ".docm", ".dotx", ".dotm"],
    async mount(ctx) {
      if (!window.docx || !window.JSZip) throw new Error("The Word reader didn't load.");

      const styleHost = el("div", { class: "docx-styles" });
      const pagesHost = el("div", { class: "docx-host" });
      const zoomBox = el("div", { class: "docx-zoom" }, pagesHost);
      ctx.view.replaceChildren(styleHost, zoomBox);

      await docx.renderAsync(ctx.buffer, pagesHost, styleHost, {
        className: "docx",
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        renderComments: false,
        useBase64URL: true,
        experimental: false,
      });

      makeLinksSafe(pagesHost);
      fixSymbolBullets(styleHost);

      const sections = pagesHost.querySelectorAll("section.docx");
      const pageWidth = sections.length ? sections[0].offsetWidth : 816;

      let mode = "auto";
      let scale = 1;
      const label = el("span", { class: "tool-label" });

      function fit() {
        const avail = Math.max(200, ctx.view.clientWidth - 40);
        return avail / pageWidth;
      }
      function apply() {
        if (!ctx.view.clientWidth) return; // hidden tab; redone on show
        scale = mode === "width" ? fit() : mode === "auto" ? Math.min(1, fit()) : mode;
        zoomBox.style.zoom = scale;
        label.textContent = Math.round(scale * 100) + "%";
        widthBtn.setAttribute("aria-pressed", String(mode === "width"));
      }
      const zoomBy = (f) => { mode = Math.min(4, Math.max(0.25, scale * f)); apply(); };
      const widthBtn = button({ iconName: "fitWidth", text: "Fit width", title: "Fit page width", onClick: () => { mode = "width"; apply(); } });

      ctx.toolbar.replaceChildren(
        el("div", { class: "tool-group" },
          button({ iconName: "minus", title: "Zoom out", onClick: () => zoomBy(1 / 1.2) }),
          label,
          button({ iconName: "plus", title: "Zoom in", onClick: () => zoomBy(1.2) })),
        el("div", { class: "tool-group" }, widthBtn),
      );
      ctx.view.addEventListener("wheel", (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
      }, { passive: false });

      apply();
      const words = countWords(pagesHost.innerText || "");
      ctx.setStatus(`${sections.length || 1} page${sections.length === 1 ? "" : "s"} (approx.) · ${words.toLocaleString()} words`);
      return { onShow: apply, onResize: () => { if (typeof mode !== "number") apply(); } };
    },
  });

  /** Keep only web and mail links; anything else (scripts, local files) is made inert. */
  function makeLinksSafe(root) {
    for (const a of root.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") || "";
      if (/^(https?:|mailto:)/i.test(href)) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      } else if (!href.startsWith("#")) {
        a.removeAttribute("href");
      }
    }
  }

  /** Word stores bullets as private characters of the "Symbol"/"Wingdings" fonts,
      which phones don't have. Swap them for ordinary Unicode bullets. */
  const SYMBOL_MAP = { "\uF0B7": "\u2022", "\uF0A7": "\u25AA", "\uF0D8": "\u27A2", "\uF0FC": "\u2713", "\uF076": "\u2756", "\uF06E": "\u25A0", "\uF0A8": "\u25A1" };
  function fixSymbolBullets(styleHost) {
    for (const st of styleHost.querySelectorAll("style")) {
      const before = st.textContent;
      if (!/[\uF000-\uF0FF]/.test(before)) continue;
      st.textContent = before
        .replace(/[\uF000-\uF0FF]/g, (ch) => SYMBOL_MAP[ch] || "\u2022")
        .replace(/font-family:\s*['"]?(Symbol|Wingdings)['"]?\s*;?/gi, "");
    }
  }

  function countWords(t) {
    const m = t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
    return m ? m.length : 0;
  }
})();
