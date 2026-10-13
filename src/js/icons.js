/* AnyPage file-type icons. Our own drawings: one page shape, a colour and a
   symbol per kind, and the format name on a band (large size only).
   No company logos are used. */
(function () {
  "use strict";

  const KINDS = {
    pdf:   { color: "#c43d3d", name: "PDF document" },
    doc:   { color: "#2f62c9", name: "Word document" },
    sheet: { color: "#1f7a4a", name: "Spreadsheet" },
    code:  { color: "#5a4bb5", name: "Code file" },
    text:  { color: "#56627a", name: "Text file" },
    img:   { color: "#b0621b", name: "Image" },
    other: { color: "#7a8394", name: "File" },
  };

  const PLAIN_TEXT = new Set([".txt", ".log", ".text", ".out", ".nfo", ".md", ".markdown", ".srt", ".vtt", ".csv", ""]);

  /** Kind of icon for a file name, given the viewer kind (pdf/doc/sheet/code/img/other). */
  function iconKind(viewerKind, ext) {
    if (viewerKind === "code") return PLAIN_TEXT.has(ext) ? "text" : "code";
    return KINDS[viewerKind] ? viewerKind : "other";
  }

  // symbols drawn inside the page; c = kind colour, w = stroke width
  const GLYPHS = {
    pdf: (c, w) => `<rect x="8" y="11" width="7" height="7.5" rx="1" fill="${c}"/>
      <path d="M17.5 12h6.5M17.5 15h6.5M17.5 18h4.5M8 21.5h16" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`,
    doc: (c, w) => `<path d="M8 11.5h16M8 15h16M8 18.5h16M8 22h10" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`,
    sheet: (c, w) => `<rect x="7.5" y="10.5" width="17" height="12" rx="1" fill="none" stroke="${c}" stroke-width="${w}"/>
      <path d="M13.2 10.5v12M18.8 10.5v12M7.5 14.5h17M7.5 18.5h17" stroke="${c}" stroke-width="${w * 0.75}"/>
      <rect x="7.5" y="10.5" width="17" height="4" fill="${c}" opacity="0.28"/>`,
    code: (c, w) => `<path d="M12 12.5l-4 4 4 4M20 12.5l4 4-4 4M17.6 11l-3.2 11" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`,
    text: (c, w) => `<path d="M8 11.5h16M8 15h13M8 18.5h16M8 22h8" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`,
    img: (c) => `<circle cx="20.5" cy="12.8" r="2.1" fill="${c}"/>
      <path d="M7.5 22.5l5.2-6.6 3.6 4.2 2.6-3 5.6 5.4Z" fill="${c}"/>`,
    other: (c, w) => `<path d="M8 12h16M8 16h16M8 20h10" stroke="${c}" stroke-width="${w}" stroke-linecap="round" opacity="0.6"/>`,
  };

  const PAGE = "M3.5 1H21.5L30 9.5V37.5A1.5 1.5 0 0 1 28.5 39H3.5A1.5 1.5 0 0 1 2 37.5V2.5A1.5 1.5 0 0 1 3.5 1Z";
  const FOLD = "M21.5 1V8A1.5 1.5 0 0 0 23 9.5H30";

  /**
   * fileIcon(kind, { ext, size: "lg" | "sm" }) -> SVG element
   * lg (about 32×40px) carries the format name; sm (tabs, headings) is the page and symbol only.
   */
  function fileIcon(kind, opts) {
    const o = opts || {};
    const k = KINDS[kind] ? kind : "other";
    const c = KINDS[k].color;
    const lg = o.size !== "sm";
    const label = (o.label || (o.ext ? o.ext.replace(".", "") : k === "other" ? "file" : k)).toUpperCase().slice(0, 4);
    const glyph = GLYPHS[k](c, lg ? 1.6 : 2.6);
    const svg = lg
      ? `<svg class="ficon ficon-lg" viewBox="0 0 32 40" role="img" aria-label="${KINDS[k].name}">
          <path d="${PAGE}" fill="var(--paper)" stroke="var(--ficon-edge)" stroke-width="1.2"/>
          <path d="${FOLD}" fill="${c}" fill-opacity="0.18" stroke="var(--ficon-edge)" stroke-width="1.2" stroke-linejoin="round"/>
          <g transform="translate(0 -1)">${glyph}</g>
          <rect x="0" y="26" width="25" height="10" rx="2" fill="${c}"/>
          <text x="12.5" y="33.4" text-anchor="middle" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="${label.length > 3 ? 6.6 : 7.4}" font-weight="700" letter-spacing="0.3" fill="#ffffff">${label}</text>
        </svg>`
      : `<svg class="ficon ficon-sm" viewBox="0 0 32 40" role="img" aria-label="${KINDS[k].name}">
          <path d="${PAGE}" fill="var(--paper)" stroke="${c}" stroke-width="2.2"/>
          <path d="${FOLD}" fill="${c}" stroke="${c}" stroke-width="2.2" stroke-linejoin="round"/>
          <g transform="translate(0 5)">${glyph}</g>
        </svg>`;
    const holder = document.createElement("span");
    holder.innerHTML = svg.replace(/\n\s*/g, "");
    return holder.firstChild;
  }

  AnyPage.fileIcon = fileIcon;
  AnyPage.iconKind = iconKind;
  AnyPage.kindName = (k) => (KINDS[k] || KINDS.other).name;
})();
