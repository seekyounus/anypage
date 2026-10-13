/* AnyPage core: shared helpers and the viewer registry.
   Every viewer registers itself here; app.js picks one per file. */
(function () {
  "use strict";

  const viewers = [];

  const AnyPage = {
    viewers,

    /** Add a viewer. spec: { id, label, kind, exts: [".pdf"], sniff?(bytes, name), mount(ctx) } */
    register(spec) {
      viewers.push(spec);
    },

    /** Find the viewer for a file, by extension first, then by the first bytes. */
    pick(name, head) {
      const ext = extOf(name);
      const byExt = viewers.find((v) => v.exts.includes(ext));
      if (byExt) return byExt;
      return viewers.find((v) => v.sniff && v.sniff(head, name)) || null;
    },

    extOf,
    formatBytes,
    el,
    icon,
    button,
    readText,
    notice,
    loadPdfjs,
  };

  function extOf(name) {
    const i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i).toLowerCase() : "";
  }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
    return (n / 1024 / 1024).toFixed(1) + " MB";
  }

  /** Tiny element builder: el("div", { class: "x", onclick: fn }, child, "text") */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v; // only used with our own static markup
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  const ICONS = {
    minus: '<path d="M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    plus: '<path d="M4 10h12M10 4v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    fitWidth: '<path d="M3 4v12M17 4v12M6.5 10h7M6.5 10l2-2M6.5 10l2 2M13.5 10l-2-2M13.5 10l-2 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    actual: '<rect x="4" y="4" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 8.5l1.5-1v5.5M12 8.5v.01M12 12v.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    wrap: '<path d="M3 5h14M3 10h11a3 3 0 0 1 0 6h-3M3 15h5M11 16l1.5 1.5M11 16l1.5-1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    up: '<path d="M5 12l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    down: '<path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  };

  function icon(name, viewBox) {
    const span = document.createElement("span");
    span.innerHTML = `<svg viewBox="${viewBox || "0 0 20 20"}" aria-hidden="true">${ICONS[name] || ""}</svg>`;
    return span.firstChild;
  }

  /** Toolbar button. Pass iconName for an icon-only button (title becomes its label). */
  function button(opts) {
    const b = el("button", {
      type: "button",
      class: "btn" + (opts.iconName && !opts.text ? " btn-icon" : ""),
      title: opts.title || opts.text || "",
      "aria-label": opts.title || opts.text || "",
      onclick: opts.onClick,
    });
    if (opts.iconName) b.append(icon(opts.iconName));
    if (opts.text) b.append(el("span", null, opts.text));
    if (opts.pressed != null) b.setAttribute("aria-pressed", String(!!opts.pressed));
    return b;
  }

  /** Decode bytes as text: UTF-8 (with or without BOM), UTF-16 by BOM, else Windows-1252. */
  function readText(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes), encoding: "UTF-16 LE" };
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes), encoding: "UTF-16 BE" };
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
      return { text, encoding: bom ? "UTF-8 BOM" : "UTF-8" };
    } catch (e) {
      return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "Windows-1252" };
    }
  }

  function notice(title, message, isError) {
    return el("div", { class: "notice" + (isError ? " is-error" : "") },
      el("h2", null, title),
      message ? el("p", null, message) : null);
  }

  let pdfjsPromise = null;
  /** Load pdf.js once, on first PDF. */
  function loadPdfjs() {
    if (!pdfjsPromise) {
      const libs = window.ANYPAGE_LIBS || {};
      const url = new URL(libs.pdfjs, document.baseURI).href;
      pdfjsPromise = import(url).then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = new URL(libs.pdfWorker, document.baseURI).href;
        return lib;
      });
    }
    return pdfjsPromise;
  }

  window.AnyPage = AnyPage;
})();
