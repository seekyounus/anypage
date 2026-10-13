/* PDF viewer built on pdf.js: lazy page rendering, selectable text, links, zoom. */
(function () {
  "use strict";
  const { el, button } = AnyPage;

  const MAX_CANVAS_PIXELS = 16 * 1024 * 1024;
  const MIN_SCALE = 0.25, MAX_SCALE = 5;

  AnyPage.register({
    id: "pdf",
    label: "PDF",
    kind: "pdf",
    exts: [".pdf"],
    sniff: (h) => h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46, // %PDF
    async mount(ctx) {
      const pdfjs = await AnyPage.loadPdfjs();
      const libs = window.ANYPAGE_LIBS || {};
      const abs = (p) => (p ? new URL(p, document.baseURI).href : undefined);

      const task = pdfjs.getDocument({
        data: new Uint8Array(ctx.buffer.slice(0)),
        cMapUrl: abs(libs.pdfCMaps),
        cMapPacked: true,
        standardFontDataUrl: abs(libs.pdfFonts),
        wasmUrl: abs(libs.pdfWasm),
        isEvalSupported: false, // never run code from inside a PDF
        enableXfa: false,
      });
      task.onPassword = (update, reason) => askPassword(ctx, update, reason === 2);
      const doc = await task.promise;

      const first = await doc.getPage(1);
      const baseVp = first.getViewport({ scale: 1 });
      const numPages = doc.numPages;

      const pagesBox = el("div", { class: "pdf-pages" });
      ctx.view.replaceChildren(pagesBox);

      // one slot per page; real size is filled in once the page is fetched
      const slots = [];
      for (let i = 1; i <= numPages; i++) {
        const slot = el("div", { class: "pdf-page", "data-page": String(i) });
        slot.style.setProperty("--w", baseVp.width);
        slot.style.setProperty("--h", baseVp.height);
        slots.push({ el: slot, n: i, w: baseVp.width, h: baseVp.height, page: i === 1 ? first : null, rendered: 0, task: null });
        pagesBox.append(slot);
      }

      let mode = "auto"; // "auto" | "width" | number
      let scale = 1;

      function fitWidthScale() {
        const avail = Math.max(200, ctx.view.clientWidth - 40);
        return avail / baseVp.width;
      }
      function computeScale() {
        if (mode === "width") return fitWidthScale();
        if (mode === "auto") return Math.min(fitWidthScale(), 1.5);
        return mode;
      }

      function applyScale(keepPage) {
        const target = keepPage || currentPage;
        scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, computeScale()));
        pagesBox.style.setProperty("--scale-factor", scale);
        pagesBox.style.setProperty("--total-scale-factor", scale);
        for (const s of slots) {
          if (s.rendered && s.rendered !== scale) release(s);
        }
        zoomLabel.textContent = Math.round(scale * 100) + "%";
        widthBtn.setAttribute("aria-pressed", String(mode === "width"));
        requestAnimationFrame(() => {
          if (target > 1) slots[target - 1].el.scrollIntoView({ block: "start" });
          refreshVisible();
        });
      }

      /* ----- rendering ----- */

      async function render(s) {
        if (s.rendered === scale || s.task || s.failed === scale) return;
        const myScale = scale;
        s.task = (async () => {
          if (!s.page) s.page = await doc.getPage(s.n);
          const vp = s.page.getViewport({ scale: myScale });
          const raw = s.page.getViewport({ scale: 1 });
          if (raw.width !== s.w || raw.height !== s.h) {
            s.w = raw.width; s.h = raw.height;
            s.el.style.setProperty("--w", s.w);
            s.el.style.setProperty("--h", s.h);
          }
          let ratio = window.devicePixelRatio || 1;
          if (vp.width * vp.height * ratio * ratio > MAX_CANVAS_PIXELS) {
            ratio = Math.sqrt(MAX_CANVAS_PIXELS / (vp.width * vp.height));
          }
          const canvas = el("canvas", { class: "pdf-canvas" });
          canvas.width = Math.floor(vp.width * ratio);
          canvas.height = Math.floor(vp.height * ratio);
          const renderTask = s.page.render({
            canvas,
            canvasContext: canvas.getContext("2d", { alpha: false }),
            viewport: vp,
            transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null,
          });
          await renderTask.promise;
          if (myScale !== scale) return; // zoom changed meanwhile; a fresh render follows

          const textDiv = el("div", { class: "textLayer" });
          const linkDiv = el("div", { class: "pdf-links" });
          s.el.replaceChildren(canvas, textDiv, linkDiv);
          s.rendered = myScale;

          try {
            const tl = new pdfjs.TextLayer({ textContentSource: s.page.streamTextContent(), container: textDiv, viewport: vp });
            await tl.render();
          } catch (e) { console.warn("text layer", e); }
          addLinks(s, vp, linkDiv).catch((e) => console.warn("links", e));
        })().catch((e) => {
          console.error(e);
          s.failed = myScale;
          s.el.replaceChildren(el("div", { class: "pdf-page-error" }, "Page " + s.n + " couldn't be drawn."));
        }).finally(() => {
          s.task = null;
          if (s.wanted && s.rendered !== scale && s.failed !== scale) render(s);
        });
      }

      function release(s) {
        s.rendered = 0;
        s.el.replaceChildren();
      }

      async function addLinks(s, vp, layer) {
        const annots = await s.page.getAnnotations({ intent: "display" });
        for (const a of annots) {
          if (a.subtype !== "Link" || !a.rect) continue;
          const t = vp.transform;
          const at = (x, y) => [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]];
          const [x1, y1] = at(a.rect[0], a.rect[1]);
          const [x2, y2] = at(a.rect[2], a.rect[3]);
          const box = { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
          let link;
          if (a.url && /^(https?:|mailto:)/i.test(a.url)) {
            link = el("a", { href: a.url, target: "_blank", rel: "noopener noreferrer", title: a.url });
          } else if (a.dest) {
            link = el("a", { href: "#", title: "Go to linked page" });
            link.addEventListener("click", async (e) => {
              e.preventDefault();
              try {
                const dest = typeof a.dest === "string" ? await doc.getDestination(a.dest) : a.dest;
                if (!dest) return;
                const idx = typeof dest[0] === "object" ? await doc.getPageIndex(dest[0]) : dest[0];
                goTo(idx + 1);
              } catch (err) { console.warn(err); }
            });
          } else continue;
          Object.assign(link.style, { left: box.left + "px", top: box.top + "px", width: box.width + "px", height: box.height + "px" });
          layer.append(link);
        }
      }

      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          const s = slots[Number(e.target.dataset.page) - 1];
          s.wanted = e.isIntersecting;
          if (e.isIntersecting) render(s);
          else if (s.rendered && !s.task) release(s);
        }
      }, { root: ctx.view, rootMargin: "1200px 0px" });
      for (const s of slots) io.observe(s.el);

      function refreshVisible() {
        for (const s of slots) if (s.wanted) render(s);
      }

      /* ----- page tracking and navigation ----- */

      let currentPage = 1;
      function updateCurrent() {
        const mid = ctx.view.scrollTop + ctx.view.clientHeight * 0.35;
        let lo = 0, hi = slots.length - 1;
        while (lo < hi) {
          const m = (lo + hi + 1) >> 1;
          if (slots[m].el.offsetTop <= mid) lo = m; else hi = m - 1;
        }
        currentPage = lo + 1;
        if (document.activeElement !== pageInput) pageInput.value = currentPage;
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= numPages;
      }
      let ticking = false;
      ctx.view.addEventListener("scroll", () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => { ticking = false; updateCurrent(); });
      }, { passive: true });

      function goTo(n) {
        n = Math.min(numPages, Math.max(1, n | 0));
        slots[n - 1].el.scrollIntoView({ block: "start" });
        currentPage = n;
        updateCurrent();
      }

      /* ----- toolbar ----- */

      const pageInput = el("input", { type: "number", min: "1", max: String(numPages), value: "1", "aria-label": "Page number", id: "pdf-page-" + Math.random().toString(36).slice(2, 8) });
      pageInput.addEventListener("change", () => goTo(Number(pageInput.value)));
      pageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") goTo(Number(pageInput.value)); });
      const prevBtn = button({ iconName: "up", title: "Previous page", onClick: () => goTo(currentPage - 1) });
      const nextBtn = button({ iconName: "down", title: "Next page", onClick: () => goTo(currentPage + 1) });
      const zoomLabel = el("span", { class: "tool-label" });
      const zoomBy = (f) => { mode = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * f)); applyScale(); };
      const widthBtn = button({ iconName: "fitWidth", text: "Fit width", title: "Fit page width", onClick: () => { mode = "width"; applyScale(); } });

      ctx.toolbar.replaceChildren(
        el("div", { class: "tool-group" }, prevBtn, nextBtn, pageInput, el("span", { class: "tool-label tool-of" }, "of " + numPages)),
        el("span", { class: "tool-sep" }),
        el("div", { class: "tool-group" },
          button({ iconName: "minus", title: "Zoom out", onClick: () => zoomBy(1 / 1.2) }),
          zoomLabel,
          button({ iconName: "plus", title: "Zoom in", onClick: () => zoomBy(1.2) })),
        el("div", { class: "tool-group" }, widthBtn),
      );

      ctx.view.addEventListener("wheel", (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
      }, { passive: false });

      let title = "";
      try {
        const meta = await doc.getMetadata();
        title = (meta && meta.info && meta.info.Title) || "";
      } catch (e) { /* no metadata */ }
      ctx.setStatus(`${numPages} page${numPages === 1 ? "" : "s"}${title ? " · " + title : ""}`);

      applyScale(1);
      updateCurrent();

      let lastWidth = ctx.view.clientWidth;
      return {
        onShow() {
          if (ctx.view.clientWidth !== lastWidth) { lastWidth = ctx.view.clientWidth; if (mode === "auto" || mode === "width") applyScale(); }
        },
        onResize() {
          if (ctx.view.clientWidth === lastWidth) return;
          lastWidth = ctx.view.clientWidth;
          if (mode === "auto" || mode === "width") applyScale();
        },
        destroy() { io.disconnect(); doc.destroy(); },
      };
    },
  });

  /** Inline password form; the PDF loads once the right password is entered. */
  function askPassword(ctx, update, wrong) {
    const input = el("input", { type: "password", id: "pdf-password", autocomplete: "off", "aria-label": "Password", placeholder: "Password" });
    const form = el("form", null, input, el("button", { class: "btn btn-primary", type: "submit" }, "Open"));
    form.addEventListener("submit", (e) => { e.preventDefault(); ctx.view.replaceChildren(el("div", { class: "loading" }, "Unlocking…")); update(input.value); });
    const box = AnyPage.notice(wrong ? "That password didn't work" : "This PDF is password protected", wrong ? "Check the password and try again." : "Enter the password to open it.", wrong);
    box.append(form);
    ctx.view.replaceChildren(box);
    input.focus();
  }
})();
