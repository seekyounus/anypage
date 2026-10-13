/* Spreadsheet viewer: Excel .xlsx (read with our own small parser) and CSV/TSV.
   Shows values the way Excel last saved them, with number/date formats, bold,
   colours, alignment, merged cells and column widths. */
(function () {
  "use strict";
  const { el, button } = AnyPage;

  const ROW_STEP = 5000;   // rows drawn at a time
  const MAX_COLS = 500;    // widest sheet drawn

  AnyPage.register({
    id: "sheet",
    label: "Spreadsheet",
    kind: "sheet",
    exts: [".xlsx", ".xlsm", ".xltx", ".xltm", ".csv", ".tsv", ".tab"],
    async mount(ctx) {
      const ext = AnyPage.extOf(ctx.name);
      let book;
      if (ext === ".csv" || ext === ".tsv" || ext === ".tab") {
        const { text, encoding } = AnyPage.readText(ctx.buffer);
        book = readDelimited(text, ext === ".csv" ? null : "\t");
        book.note = `${encoding} · separator ${book.sepName}`;
      } else {
        if (!window.JSZip) throw new Error("The Excel reader didn't load.");
        book = await readXlsx(ctx.buffer);
      }
      return showBook(ctx, book);
    },
  });

  /* =================== rendering =================== */

  function showBook(ctx, book) {
    ctx.view.classList.add("view-fill");
    const scroller = el("div", { class: "sheet-scroll" });
    const tabsBar = el("div", { class: "sheet-tabs", role: "tablist", "aria-label": "Sheets" });
    ctx.view.replaceChildren(el("div", { class: "sheet-view" }, scroller, tabsBar));

    const visible = book.sheets.filter((s) => s.state !== "hidden" && s.state !== "veryHidden");
    const list = visible.length ? visible : book.sheets;
    let active = 0;

    list.forEach((s, i) => {
      const b = el("button", { class: "sheet-tab", type: "button", role: "tab", "aria-selected": String(i === 0) }, s.name);
      b.addEventListener("click", () => select(i));
      tabsBar.append(b);
    });
    tabsBar.hidden = list.length < 2 && !book.isXlsx;

    async function select(i) {
      active = i;
      [...tabsBar.children].forEach((b, j) => b.setAttribute("aria-selected", String(j === i)));
      scroller.replaceChildren(el("div", { class: "loading" }, "Reading " + list[i].name + "…"));
      try {
        const grid = await list[i].load();
        drawGrid(scroller, grid, (shownRows) => {
          const sheetsNote = list.length > 1 ? ` · sheet ${i + 1} of ${list.length}` : "";
          const more = shownRows < grid.maxRow ? ` (showing ${shownRows.toLocaleString()})` : "";
          ctx.setStatus(`${grid.maxRow.toLocaleString()} rows × ${grid.maxCol} columns${more}${sheetsNote}${book.note ? " · " + book.note : ""}`);
        });
      } catch (e) {
        console.error(e);
        scroller.replaceChildren(AnyPage.notice("This sheet couldn't be read", e.message || String(e), true));
      }
    }

    const sizes = [80, 90, 100, 115, 130, 150];
    let sizeIdx = 2;
    const label = el("span", { class: "tool-label" }, "100%");
    function setSize(d) {
      sizeIdx = Math.max(0, Math.min(sizes.length - 1, sizeIdx + d));
      scroller.style.setProperty("--sheet-zoom", sizes[sizeIdx] / 100);
      label.textContent = sizes[sizeIdx] + "%";
    }
    ctx.toolbar.replaceChildren(el("div", { class: "tool-group" },
      button({ iconName: "minus", title: "Zoom out", onClick: () => setSize(-1) }),
      label,
      button({ iconName: "plus", title: "Zoom in", onClick: () => setSize(1) })));

    select(0);
    return { destroy() { ctx.view.classList.remove("view-fill"); } };
  }

  function drawGrid(scroller, g, onStatus) {
    const cols = Math.min(Math.max(g.maxCol, 1), MAX_COLS);
    const table = el("table", { class: "sheet-table" });
    const colgroup = el("colgroup", null, el("col", { class: "rowhead-col" }));
    const headRow = el("tr", null, el("th", { class: "corner", scope: "col" }));
    const shownCols = [];
    for (let c = 1; c <= cols; c++) {
      const info = g.cols[c];
      if (info && info.hidden) continue;
      shownCols.push(c);
      const col = el("col");
      col.style.width = (info && info.width ? info.width : g.defaultWidth || 64) + "px";
      colgroup.append(col);
      headRow.append(el("th", { scope: "col" }, colName(c)));
    }
    const tbody = el("tbody");
    table.append(colgroup, el("thead", null, headRow), tbody);

    const covered = new Set();
    const spans = new Map();
    for (const m of g.merges) {
      spans.set(m.r1 + ":" + m.c1, m);
      for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(r + ":" + c);
    }

    let drawn = 0;
    const moreBtn = el("button", { class: "btn sheet-more", type: "button" });
    function drawMore() {
      const end = Math.min(g.maxRow, drawn + ROW_STEP);
      const frag = document.createDocumentFragment();
      for (let r = drawn + 1; r <= end; r++) {
        const rowInfo = g.rows[r];
        if (rowInfo && rowInfo.hidden) continue;
        const tr = el("tr", null, el("th", { scope: "row" }, String(r)));
        if (rowInfo && rowInfo.height) tr.style.height = rowInfo.height + "px";
        const rowCells = g.cells[r];
        for (const c of shownCols) {
          const key = r + ":" + c;
          if (covered.has(key)) continue;
          const cell = rowCells && rowCells[c];
          const td = document.createElement("td");
          if (cell) {
            td.textContent = cell.text;
            if (cell.num) td.className = "num";
            if (cell.css) td.style.cssText += cell.css;
          }
          const m = spans.get(key);
          if (m) {
            if (m.r2 > m.r1) td.rowSpan = m.r2 - m.r1 + 1;
            if (m.c2 > m.c1) td.colSpan = m.c2 - m.c1 + 1;
          }
          tr.append(td);
        }
        frag.append(tr);
      }
      tbody.append(frag);
      drawn = end;
      moreBtn.hidden = drawn >= g.maxRow;
      moreBtn.textContent = `Show next ${Math.min(ROW_STEP, g.maxRow - drawn).toLocaleString()} rows`;
      onStatus(drawn);
    }
    moreBtn.addEventListener("click", drawMore);

    const parts = [el("div", { class: "sheet-paper" }, table)];
    if (g.maxCol > MAX_COLS) parts.push(el("p", { class: "sheet-note" }, `Showing the first ${MAX_COLS} of ${g.maxCol} columns.`));
    parts.push(moreBtn);
    if (!g.maxRow) parts.unshift(el("p", { class: "sheet-note" }, "This sheet is empty."));
    scroller.replaceChildren(...parts);
    scroller.scrollTo(0, 0);
    drawMore();
  }

  function colName(n) {
    let s = "";
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return s;
  }
  function colIndex(letters) {
    let n = 0;
    for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n;
  }
  function parseRef(ref) {
    const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref);
    return m ? { c: colIndex(m[1]), r: Number(m[2]) } : null;
  }

  /* =================== CSV / TSV =================== */

  function readDelimited(text, forced) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const sep = forced || guessSeparator(text);
    const sepName = { ",": "comma", ";": "semicolon", "\t": "tab", "|": "pipe" }[sep];
    const sheet = {
      name: "Sheet1",
      load: async () => {
        const rows = parseDelimited(text, sep);
        const cells = {};
        let maxCol = 0;
        rows.forEach((row, i) => {
          const r = i + 1;
          const line = (cells[r] = {});
          row.forEach((v, j) => {
            if (v === "") return;
            const t = v.trim();
            line[j + 1] = { text: v, num: t !== "" && /^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?([eE][-+]?\d+)?%?$/.test(t) && /\d/.test(t) };
          });
          maxCol = Math.max(maxCol, row.length);
        });
        const header = cells[1];
        if (header) for (const c in header) header[c].css = "font-weight:600;";
        return { cells, maxRow: rows.length, maxCol, cols: {}, rows: {}, merges: [], defaultWidth: 110 };
      },
    };
    return { sheets: [sheet], sepName, isXlsx: false };
  }

  function guessSeparator(text) {
    const sample = text.slice(0, 64 * 1024).split(/\r?\n/).slice(0, 20).filter((l) => l.length);
    let best = ",", bestScore = -1;
    for (const s of [",", ";", "\t", "|"]) {
      const counts = sample.map((l) => countOutsideQuotes(l, s));
      if (!counts.length || !counts[0]) continue;
      const same = counts.filter((c) => c === counts[0]).length;
      const score = same * 100 + counts[0];
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }
  function countOutsideQuotes(line, sep) {
    let n = 0, q = false;
    for (const ch of line) { if (ch === '"') q = !q; else if (ch === sep && !q) n++; }
    return n;
  }

  /** RFC 4180 style: quotes, doubled quotes, separators and line breaks inside quotes. */
  function parseDelimited(text, sep) {
    const rows = [];
    let row = [], field = "", i = 0, q = false;
    const n = text.length;
    while (i < n) {
      const ch = text[i];
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"' && field === "") { q = true; i++; continue; }
      if (ch === sep) { row.push(field); field = ""; i++; continue; }
      if (ch === "\r" || ch === "\n") {
        row.push(field); rows.push(row); row = []; field = "";
        if (ch === "\r" && text[i + 1] === "\n") i++;
        i++; continue;
      }
      field += ch; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /* =================== XLSX =================== */

  const parser = new DOMParser();
  const xml = (s) => parser.parseFromString(s, "application/xml");
  const kids = (node, tag) => (node ? Array.from(node.getElementsByTagNameNS("*", tag)) : []);
  const first = (node, tag) => (node ? node.getElementsByTagNameNS("*", tag)[0] || null : null);
  const directKids = (node, tag) => (node ? Array.from(node.children).filter((c) => c.localName === tag) : []);
  const attr = (node, name) => (node ? node.getAttribute(name) : null);
  const relAttr = (node) => node.getAttribute("r:id") || node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");

  async function readXlsx(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const read = async (path) => {
      const f = zip.file(path) || zip.file(path.replace(/^\//, ""));
      return f ? f.async("string") : null;
    };

    const wbText = await read("xl/workbook.xml");
    if (!wbText) throw new Error("This file has no workbook inside. It may not be a real .xlsx file.");
    const wb = xml(wbText);
    const pr = first(wb, "workbookPr");
    const date1904 = pr && /^(1|true)$/.test(attr(pr, "date1904") || "");

    const rels = {};
    const relText = await read("xl/_rels/workbook.xml.rels");
    if (relText) for (const r of kids(xml(relText), "Relationship")) rels[attr(r, "Id")] = attr(r, "Target");

    const shared = [];
    const ssText = await read("xl/sharedStrings.xml");
    if (ssText) for (const si of kids(xml(ssText), "si")) shared.push(stringItem(si));

    const styles = readStyles(await read("xl/styles.xml"));

    const sheets = kids(wb, "sheet").map((s) => {
      let target = rels[relAttr(s)] || "";
      const path = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
      let cache = null;
      return {
        name: attr(s, "name") || "Sheet",
        state: attr(s, "state") || "visible",
        load: async () => {
          if (cache) return cache;
          const text = await read(path);
          if (!text) throw new Error("This sheet is a chart or is missing from the file.");
          cache = readSheet(xml(text), shared, styles, date1904);
          return cache;
        },
      };
    });
    return { sheets, isXlsx: true };
  }

  /** Text of a shared/inline string, skipping phonetic hints. */
  function stringItem(si) {
    let out = "";
    for (const t of kids(si, "t")) {
      if (t.parentNode && t.parentNode.localName === "rPh") continue;
      out += t.textContent;
    }
    return out.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }

  function readStyles(text) {
    const st = { numFmts: {}, fonts: [], fills: [], xfs: [] };
    if (!text) return st;
    const doc = xml(text);
    for (const f of kids(doc, "numFmt")) st.numFmts[attr(f, "numFmtId")] = attr(f, "formatCode");
    for (const f of directKids(first(doc, "fonts"), "font")) {
      const color = first(f, "color");
      st.fonts.push({
        b: isOn(first(f, "b")), i: isOn(first(f, "i")),
        u: !!first(f, "u"), strike: isOn(first(f, "strike")),
        color: rgb(attr(color, "rgb")),
      });
    }
    for (const f of directKids(first(doc, "fills"), "fill")) {
      const p = first(f, "patternFill");
      const type = attr(p, "patternType");
      st.fills.push(type && type !== "none" ? rgb(attr(first(p, "fgColor"), "rgb")) : null);
    }
    for (const x of directKids(first(doc, "cellXfs"), "xf")) {
      const al = first(x, "alignment");
      st.xfs.push({
        numFmtId: attr(x, "numFmtId") || "0",
        font: Number(attr(x, "fontId") || 0),
        fill: Number(attr(x, "fillId") || 0),
        h: attr(al, "horizontal"),
        v: attr(al, "vertical"),
        wrap: isOn(al && al.getAttribute("wrapText") != null ? al : null, "wrapText"),
        indent: Number(attr(al, "indent") || 0),
      });
    }
    return st;
  }
  function isOn(node, name) {
    if (!node) return false;
    const v = node.getAttribute(name || "val");
    return v == null || v === "1" || v === "true";
  }
  function rgb(v) {
    if (!v || v.length < 6) return null;
    const hex = v.slice(-6);
    return /^[0-9A-Fa-f]{6}$/.test(hex) ? "#" + hex : null;
  }

  function readSheet(doc, shared, styles, date1904) {
    const cells = {};
    const rows = {};
    const cols = {};
    let maxRow = 0, maxCol = 0;

    const fmt = first(doc, "sheetFormatPr");
    const baseW = Number(attr(fmt, "defaultColWidth") || 0);
    const defaultWidth = baseW ? charsToPx(baseW) : 64;

    for (const c of kids(first(doc, "cols"), "col")) {
      const min = Number(attr(c, "min")), max = Math.min(Number(attr(c, "max")), MAX_COLS + 1);
      const info = { width: attr(c, "width") ? charsToPx(Number(attr(c, "width"))) : null, hidden: isOn(c.getAttribute("hidden") != null ? c : null, "hidden") };
      for (let i = min; i <= max; i++) cols[i] = info;
    }

    for (const row of kids(first(doc, "sheetData"), "row")) {
      const r = Number(attr(row, "r")) || maxRow + 1;
      const ht = attr(row, "ht");
      if (attr(row, "hidden") === "1" || attr(row, "hidden") === "true" || (ht && attr(row, "customHeight") === "1")) {
        rows[r] = { hidden: attr(row, "hidden") === "1" || attr(row, "hidden") === "true", height: ht ? Math.round(Number(ht) * 4 / 3) : null };
      }
      let line = null;
      let nextCol = 1;
      for (const c of directKids(row, "c")) {
        const ref = parseRef(attr(c, "r") || "");
        const col = ref ? ref.c : nextCol;
        nextCol = col + 1;
        const cell = readCell(c, shared, styles, date1904);
        if (!cell) continue;
        if (!line) line = cells[r] = {};
        line[col] = cell;
        if (cell.text !== "" || cell.css) {
          if (r > maxRow) maxRow = r;
          if (col > maxCol) maxCol = col;
        }
      }
    }

    const merges = [];
    for (const m of kids(first(doc, "mergeCells"), "mergeCell")) {
      const [a, b] = (attr(m, "ref") || "").split(":");
      const p = parseRef(a || ""), q = parseRef(b || a || "");
      if (p && q) {
        merges.push({ r1: p.r, c1: p.c, r2: q.r, c2: q.c });
        maxRow = Math.max(maxRow, q.r); maxCol = Math.max(maxCol, q.c);
      }
    }
    return { cells, rows, cols, merges, maxRow, maxCol, defaultWidth };
  }

  function charsToPx(w) { return Math.round(w * 7 + 5); }

  function readCell(c, shared, styles, date1904) {
    const t = attr(c, "t") || "n";
    const xf = styles.xfs[Number(attr(c, "s") || 0)] || null;
    const vNode = first(c, "v");
    const v = vNode ? vNode.textContent : null;
    let text = "", num = false;

    if (t === "s") text = v != null ? shared[Number(v)] || "" : "";
    else if (t === "inlineStr") text = stringItem(first(c, "is") || c);
    else if (t === "str") text = v || "";
    else if (t === "b") text = v === "1" ? "TRUE" : "FALSE";
    else if (t === "e") text = v || "#ERROR";
    else if (t === "d") text = v || "";
    else if (v != null && v !== "") {
      const n = Number(v);
      const code = xf ? fmtCode(xf.numFmtId, styles) : "General";
      text = formatNumber(n, code, date1904);
      num = true;
    }

    const css = xf ? cellCss(xf, styles) : "";
    if (!text && !css) return null;
    if (t === "b" || t === "e") num = true;
    return { text, num, css };
  }

  function cellCss(xf, styles) {
    let css = "";
    const font = styles.fonts[xf.font];
    if (font) {
      if (font.b) css += "font-weight:700;";
      if (font.i) css += "font-style:italic;";
      if (font.u || font.strike) css += `text-decoration:${font.u ? "underline" : ""} ${font.strike ? "line-through" : ""};`;
      if (font.color && font.color.toLowerCase() !== "#000000") css += `color:${font.color};`;
    }
    const fill = styles.fills[xf.fill];
    if (fill) css += `background:${fill};`;
    if (xf.h && xf.h !== "general") css += `text-align:${{ centerContinuous: "center", distributed: "justify", fill: "left" }[xf.h] || xf.h};`;
    if (xf.v === "center") css += "vertical-align:middle;";
    else if (xf.v === "top") css += "vertical-align:top;";
    if (xf.wrap) css += "white-space:pre-wrap;";
    if (xf.indent) css += `padding-left:${4 + xf.indent * 9}px;`;
    return css;
  }

  /* =================== number formats =================== */

  const BUILTIN = {
    0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%", 11: "0.00E+00",
    12: "# ?/?", 13: "# ??/??", 14: "m/d/yyyy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy",
    18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "m/d/yyyy h:mm",
    37: "#,##0 ;(#,##0)", 38: "#,##0 ;[Red](#,##0)", 39: "#,##0.00;(#,##0.00)", 40: "#,##0.00;[Red](#,##0.00)",
    45: "mm:ss", 46: "[h]:mm:ss", 47: "mmss.0", 48: "##0.0E+0", 49: "@",
  };
  function fmtCode(id, styles) {
    return styles.numFmts[id] || BUILTIN[Number(id)] || "General";
  }

  /** Split a format into its ; sections, respecting quotes and escapes. */
  function sections(code) {
    const out = [];
    let cur = "", q = false;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (ch === '"') q = !q;
      if (ch === "\\" && !q) { cur += ch + (code[i + 1] || ""); i++; continue; }
      if (ch === ";" && !q) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  function isDateFormat(sec) {
    const s = sec.replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[(?!h\]|hh\]|m\]|mm\]|s\]|ss\])[^\]]*\]/gi, "");
    return /[ymdhs]/i.test(s) && !/[0#?]/.test(s.replace(/\.0+/g, ""));
  }

  function formatNumber(n, code, date1904) {
    if (!isFinite(n)) return String(n);
    if (!code || /^general$/i.test(code)) return general(n);
    const secs = sections(code);
    let sec = secs[0], val = n, neg = n < 0;
    if (neg && secs.length > 1) { sec = secs[1]; val = Math.abs(n); neg = false; }
    else if (n === 0 && secs.length > 2) sec = secs[2];
    sec = sec.replace(/\[(Red|Black|Blue|Cyan|Green|Magenta|White|Yellow|Color\s*\d+)\]/gi, "")
      .replace(/\[[<>=]+[^\]]*\]/g, "");
    if (/^\s*@?\s*$/.test(sec) && sec.includes("@")) return general(n);
    if (/^general$/i.test(sec.trim())) return (neg ? "-" : "") + general(Math.abs(val));
    if (isDateFormat(sec)) return formatDate(n, sec, date1904);
    if (/\?\/\?/.test(sec)) return general(n);
    const s = formatNumeric(neg ? Math.abs(val) : val, sec);
    return neg ? "-" + s : s;
  }

  function general(n) {
    if (Number.isInteger(n) && Math.abs(n) < 1e11) return String(n);
    const abs = Math.abs(n);
    if (abs !== 0 && (abs >= 1e11 || abs < 1e-9)) return n.toExponential(5).replace(/\.?0+e/, "e").toUpperCase();
    return String(Number(n.toPrecision(11)));
  }

  /** Numbers like #,##0.00, 0%, "SAR "#,##0, 0.00E+00 */
  function formatNumeric(val, sec) {
    // literal text: quoted strings, escaped chars, [$SAR-401] currency, _x spacing, *x fill
    const tokens = [];
    for (let i = 0; i < sec.length; i++) {
      const ch = sec[i];
      if (ch === '"') { const j = sec.indexOf('"', i + 1); tokens.push({ lit: sec.slice(i + 1, j < 0 ? undefined : j) }); i = j < 0 ? sec.length : j; continue; }
      if (ch === "\\") { tokens.push({ lit: sec[i + 1] || "" }); i++; continue; }
      if (ch === "_") { tokens.push({ lit: " " }); i++; continue; }
      if (ch === "*") { i++; continue; }
      if (ch === "[") { const j = sec.indexOf("]", i); const inner = sec.slice(i + 1, j); if (inner.startsWith("$")) tokens.push({ lit: inner.slice(1).split("-")[0] }); i = j < 0 ? sec.length : j; continue; }
      tokens.push({ ch });
    }
    const pattern = tokens.filter((t) => t.ch && /[0#?.,%Ee+\-]/.test(t.ch)).map((t) => t.ch).join("");
    const firstNum = tokens.findIndex((t) => t.ch && /[0#?]/.test(t.ch));
    let lastNum = -1;
    tokens.forEach((t, i) => { if (t.ch && /[0#?.,Ee+\-]/.test(t.ch) && i >= firstNum) lastNum = i; });
    if (firstNum < 0) return tokens.map((t) => t.lit != null ? t.lit : t.ch).join("") || general(val);
    const prefix = tokens.slice(0, firstNum).map((t) => (t.lit != null ? t.lit : t.ch)).join("");
    const suffix = tokens.slice(lastNum + 1).map((t) => (t.lit != null ? t.lit : t.ch)).join("");
    const percent = (pattern.match(/%/g) || []).length;
    let v = val * Math.pow(100, percent);
    const core = pattern.replace(/%/g, "");
    const expMatch = /[Ee][+\-]/.exec(core);
    if (expMatch) {
      const mant = core.slice(0, expMatch.index);
      const dec = (mant.split(".")[1] || "").replace(/[^0#?]/g, "").length;
      const [m, e] = v.toExponential(dec).split("e");
      const ePad = core.slice(expMatch.index + 2).replace(/[^0]/g, "").length || 2;
      const ei = Number(e);
      return prefix + m.toUpperCase() + "E" + (ei < 0 ? "-" : "+") + String(Math.abs(ei)).padStart(ePad, "0") + suffix;
    }
    // trailing commas scale by 1000 each
    const scaleCommas = (/(,+)(?=[^0#?]*$)/.exec(core.replace(/\..*$/, "")) || [""])[0].length;
    v = v / Math.pow(1000, scaleCommas);
    const [intPat, decPat = ""] = core.split(".");
    const decMin = decPat.replace(/[^0]/g, "").length;
    const decMax = decPat.replace(/[^0#?]/g, "").length;
    const grouped = /[0#?],[0#?]/.test(intPat);
    const intMin = intPat.replace(/[^0]/g, "").length;
    let s = v.toFixed(decMax);
    let [ip, dp = ""] = s.split(".");
    while (dp.length > decMin && dp.endsWith("0")) dp = dp.slice(0, -1);
    if (intMin === 0 && ip === "0" && (dp || decMax)) ip = "";
    ip = ip.padStart(intMin, "0");
    if (grouped) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return prefix + ip + (dp ? "." + dp : "") + suffix;
  }

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function serialToParts(serial, date1904) {
    let days = Math.floor(serial);
    let secs = Math.round((serial - days) * 86400);
    if (secs >= 86400) { days++; secs -= 86400; }
    if (date1904) days += 1462;
    else if (days < 60) days += 1; // Excel counts a 29 Feb 1900 that never existed
    const d = new Date(Date.UTC(1899, 11, 30) + days * 86400000);
    return {
      y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(),
      h: Math.floor(secs / 3600), mi: Math.floor((secs % 3600) / 60), s: secs % 60,
      totalH: Math.floor(serial * 24), totalM: Math.floor(serial * 1440), totalS: Math.round(serial * 86400),
    };
  }

  function formatDate(serial, sec, date1904) {
    const p = serialToParts(serial, date1904);
    const toks = [];
    const lower = sec;
    for (let i = 0; i < lower.length; i++) {
      const ch = lower[i];
      if (ch === '"') { const j = lower.indexOf('"', i + 1); toks.push({ lit: lower.slice(i + 1, j < 0 ? undefined : j) }); i = j < 0 ? lower.length : j; continue; }
      if (ch === "\\") { toks.push({ lit: lower[i + 1] || "" }); i++; continue; }
      if (ch === "_") { toks.push({ lit: " " }); i++; continue; }
      if (ch === "*") { i++; continue; }
      if (ch === "[") {
        const j = lower.indexOf("]", i);
        const inner = lower.slice(i + 1, j).toLowerCase();
        if (/^h+$/.test(inner)) toks.push({ t: "H", n: inner.length });
        else if (/^m+$/.test(inner)) toks.push({ t: "M", n: inner.length });
        else if (/^s+$/.test(inner)) toks.push({ t: "S", n: inner.length });
        i = j < 0 ? lower.length : j; continue;
      }
      if (/^(am\/pm|a\/p)/i.test(lower.slice(i))) { const len = /^am\/pm/i.test(lower.slice(i)) ? 5 : 3; toks.push({ t: "ampm", n: len }); i += len - 1; continue; }
      const c = ch.toLowerCase();
      if ("ymdhs".includes(c)) {
        let j = i; while (j < lower.length && lower[j].toLowerCase() === c) j++;
        toks.push({ t: c, n: j - i }); i = j - 1; continue;
      }
      if (ch === "." && /0/.test(lower[i + 1] || "")) { let j = i + 1; while (lower[j] === "0") j++; toks.push({ t: "frac", n: j - i - 1 }); i = j - 1; continue; }
      toks.push({ lit: ch });
    }
    // an "m" right after an hour or right before a second means minutes
    const timeIdx = toks.map((t, i) => (t.t ? i : -1)).filter((i) => i >= 0);
    timeIdx.forEach((idx, k) => {
      const t = toks[idx];
      if (t.t !== "m") return;
      const prev = toks[timeIdx[k - 1]], next = toks[timeIdx[k + 1]];
      if ((prev && (prev.t === "h" || prev.t === "H")) || (next && (next.t === "s" || next.t === "S"))) t.t = "min";
    });
    const has12 = toks.some((t) => t.t === "ampm");
    const pad = (v, n) => String(v).padStart(n, "0");
    return toks.map((t) => {
      if (t.lit != null) return t.lit;
      switch (t.t) {
        case "y": return t.n <= 2 ? pad(p.y % 100, 2) : String(p.y);
        case "m": return t.n === 1 ? String(p.mo + 1) : t.n === 2 ? pad(p.mo + 1, 2) : t.n === 3 ? MONTHS[p.mo].slice(0, 3) : t.n === 5 ? MONTHS[p.mo][0] : MONTHS[p.mo];
        case "d": return t.n === 1 ? String(p.d) : t.n === 2 ? pad(p.d, 2) : t.n === 3 ? DAYS[p.wd].slice(0, 3) : DAYS[p.wd];
        case "h": { const h = has12 ? (p.h % 12 || 12) : p.h; return t.n >= 2 ? pad(h, 2) : String(h); }
        case "min": return t.n >= 2 ? pad(p.mi, 2) : String(p.mi);
        case "s": return t.n >= 2 ? pad(p.s, 2) : String(p.s);
        case "H": return pad(p.totalH, t.n);
        case "M": return pad(p.totalM, t.n);
        case "S": return pad(p.totalS, t.n);
        case "ampm": return t.n === 5 ? (p.h < 12 ? "AM" : "PM") : (p.h < 12 ? "A" : "P");
        case "frac": return "." + "0".repeat(t.n);
        default: return "";
      }
    }).join("");
  }

  // exposed for testing
  AnyPage._sheet = { formatNumber, parseDelimited, guessSeparator };
})();
