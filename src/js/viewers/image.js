/* Image viewer: fit to window, actual size, zoom in and out. */
(function () {
  "use strict";
  const { el, button } = AnyPage;

  const MIME = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".jfif": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
    ".webp": "image/webp", ".bmp": "image/bmp", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".avif": "image/avif",
  };

  function sniffMime(h) {
    if (h[0] === 0xff && h[1] === 0xd8) return "image/jpeg";
    if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return "image/png";
    if (h[0] === 0x47 && h[1] === 0x49 && h[2] === 0x46) return "image/gif";
    if (h[0] === 0x42 && h[1] === 0x4d) return "image/bmp";
    if (h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46 && h[8] === 0x57 && h[9] === 0x45) return "image/webp";
    return null;
  }

  AnyPage.register({
    id: "image",
    label: "Image",
    kind: "img",
    exts: Object.keys(MIME),
    sniff: (head) => !!sniffMime(head),
    async mount(ctx) {
      const mime = MIME[AnyPage.extOf(ctx.name)] || sniffMime(new Uint8Array(ctx.buffer, 0, 16)) || "application/octet-stream";
      const url = URL.createObjectURL(new Blob([ctx.buffer], { type: mime }));
      const img = el("img", { class: "img-el", alt: ctx.name, draggable: "false" });
      const frame = el("div", { class: "img-frame" }, img);
      const box = el("div", { class: "img-view" }, frame);
      ctx.view.replaceChildren(box);

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("The image data couldn't be decoded."));
        img.src = url;
      });

      let natW = img.naturalWidth || 800;
      let natH = img.naturalHeight || 600;
      let mode = "fit"; // "fit" or a number (scale)
      const label = el("span", { class: "tool-label" });

      function fitScale() {
        if (!ctx.view.clientWidth) return 1; // tab not visible yet; recomputed on show
        const w = ctx.view.clientWidth - 32, h = ctx.view.clientHeight - 32;
        return Math.max(0.02, Math.min(1, w / natW, h / natH));
      }
      function apply() {
        const s = mode === "fit" ? fitScale() : mode;
        img.style.width = Math.max(1, Math.round(natW * s)) + "px";
        img.style.height = Math.max(1, Math.round(natH * s)) + "px";
        label.textContent = Math.round(s * 100) + "%";
        fitBtn.setAttribute("aria-pressed", String(mode === "fit"));
      }
      function zoom(f) {
        const cur = mode === "fit" ? fitScale() : mode;
        mode = Math.min(16, Math.max(0.05, cur * f));
        apply();
      }

      const fitBtn = button({ iconName: "fitWidth", text: "Fit", title: "Fit to window", onClick: () => { mode = "fit"; apply(); } });
      ctx.toolbar.replaceChildren(
        el("div", { class: "tool-group" },
          button({ iconName: "minus", title: "Zoom out", onClick: () => zoom(1 / 1.25) }),
          label,
          button({ iconName: "plus", title: "Zoom in", onClick: () => zoom(1.25) })),
        el("div", { class: "tool-group" },
          fitBtn,
          button({ iconName: "actual", text: "100%", title: "Actual size", onClick: () => { mode = 1; apply(); } })),
      );

      box.addEventListener("wheel", (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
      }, { passive: false });

      apply();
      ctx.setStatus(`${natW} × ${natH} px`);
      return {
        onShow: apply,
        onResize: () => { if (mode === "fit") apply(); },
        destroy: () => URL.revokeObjectURL(url),
      };
    },
  });
})();
