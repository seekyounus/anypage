/* Text and code viewer: line numbers, syntax colours, wrap and text size. */
(function () {
  "use strict";
  const { el, button } = AnyPage;

  const HIGHLIGHT_LIMIT = 1.5 * 1024 * 1024; // colour files up to ~1.5 MB; larger ones show plain

  // extension -> highlight.js language (null = plain text)
  const LANG = {
    ".txt": null, ".log": null, ".text": null, ".out": null, ".nfo": null,
    ".md": "markdown", ".markdown": "markdown",
    ".json": "json", ".jsonc": "json", ".geojson": "json", ".ipynb": "json",
    ".xml": "xml", ".xsd": "xml", ".xsl": "xml", ".xslt": "xml", ".rss": "xml", ".config": "xml",
    ".csproj": "xml", ".vbproj": "xml", ".dtsx": "xml", ".rdl": "xml", ".resx": "xml", ".plist": "xml", ".xaml": "xml",
    ".html": "xml", ".htm": "xml", ".xhtml": "xml", ".vue": "xml",
    ".css": "css", ".scss": "scss", ".less": "less",
    ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".py": "python", ".pyw": "python",
    ".sql": "sql", ".psql": "sql", ".dax": null, ".m": null,
    ".cs": "csharp", ".java": "java", ".kt": "kotlin", ".kts": "kotlin",
    ".c": "c", ".h": "c", ".cpp": "cpp", ".cc": "cpp", ".hpp": "cpp", ".cxx": "cpp",
    ".go": "go", ".rs": "rust", ".rb": "ruby", ".php": "php", ".swift": "swift",
    ".pl": "perl", ".lua": "lua", ".r": "r", ".vb": "vbnet", ".bas": "vbnet",
    ".sh": "bash", ".bash": "bash", ".zsh": "bash", ".ps1": "powershell", ".psm1": "powershell", ".bat": "dos", ".cmd": "dos",
    ".yml": "yaml", ".yaml": "yaml", ".toml": "ini", ".ini": "ini", ".cfg": "ini", ".conf": "ini", ".properties": "properties", ".env": "bash",
    ".gradle": "gradle", ".dockerfile": "dockerfile", ".makefile": "makefile", ".mk": "makefile",
    ".diff": "diff", ".patch": "diff", ".graphql": "graphql", ".gql": "graphql",
    ".srt": null, ".vtt": null,
  };
  // formats with their own viewer coming later; don't show them as raw text meanwhile
  const PLANNED = new Set([".rtf", ".doc", ".xls", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".epub", ".heic", ".msg", ".eml"]);
  const NAME_LANG = { dockerfile: "dockerfile", makefile: "makefile", ".gitignore": "bash", ".editorconfig": "ini" };

  /** Unknown extension: treat as text when the start has no NUL bytes and is mostly printable. */
  function looksLikeText(head) {
    if (!head.length) return true;
    let odd = 0;
    for (let i = 0; i < head.length; i++) {
      const b = head[i];
      if (b === 0) return false;
      if (b < 9 || (b > 13 && b < 32)) odd++;
    }
    return odd / head.length < 0.02;
  }

  AnyPage.register({
    id: "text",
    label: "Text",
    kind: "code",
    exts: Object.keys(LANG),
    sniff: (head, name) => !PLANNED.has(AnyPage.extOf(name)) && looksLikeText(head),
    async mount(ctx) {
      const { text: raw, encoding } = AnyPage.readText(ctx.buffer);
      const ext = AnyPage.extOf(ctx.name);
      const lower = ctx.name.toLowerCase();
      let lang = ext in LANG ? LANG[ext] : NAME_LANG[lower] || null;
      if (lang && !(window.hljs && hljs.getLanguage(lang))) lang = null;

      const state = { wrap: false, size: 13.5, pretty: false };
      let text = raw.replace(/\r\n?/g, "\n");
      const canPretty = lang === "json" && text.length < 20 * 1024 * 1024 && isJson(text);

      const gutter = el("pre", { class: "code-gutter", "aria-hidden": "true" });
      const code = el("code", { class: "code-body" + (lang ? " hljs language-" + lang : "") });
      const pre = el("pre", { class: "code-pre" }, code);
      const box = el("div", { class: "code-view" }, gutter, pre);
      ctx.view.replaceChildren(box);

      function render() {
        const shown = state.pretty ? JSON.stringify(JSON.parse(text), null, 2) : text;
        const lines = countLines(shown);
        gutter.textContent = numbers(lines);
        if (lang && shown.length <= HIGHLIGHT_LIMIT) {
          code.innerHTML = hljs.highlight(shown, { language: lang, ignoreIllegals: true }).value;
        } else {
          code.textContent = shown;
        }
        const langName = lang ? (hljs.getLanguage(lang).name || lang) : "Plain text";
        const note = lang && shown.length > HIGHLIGHT_LIMIT ? " (colours off for large files)" : "";
        ctx.setStatus(`${lines.toLocaleString()} line${lines === 1 ? "" : "s"} · ${encoding} · ${langName}${note}`);
      }

      function applyLook() {
        box.classList.toggle("is-wrapped", state.wrap);
        box.style.setProperty("--code-size", state.size + "px");
        sizeLabel.textContent = Math.round((state.size / 13.5) * 100) + "%";
        wrapBtn.setAttribute("aria-pressed", String(state.wrap));
      }

      const wrapBtn = button({ iconName: "wrap", text: "Wrap", title: "Wrap long lines", pressed: false, onClick: () => { state.wrap = !state.wrap; applyLook(); } });
      const sizeLabel = el("span", { class: "tool-label" });
      const tools = [
        el("div", { class: "tool-group" },
          button({ iconName: "minus", title: "Smaller text", onClick: () => { state.size = Math.max(9, state.size - 1); applyLook(); } }),
          sizeLabel,
          button({ iconName: "plus", title: "Larger text", onClick: () => { state.size = Math.min(28, state.size + 1); applyLook(); } })),
        el("div", { class: "tool-group" }, wrapBtn),
      ];
      if (canPretty) {
        const prettyBtn = button({ text: "Format JSON", title: "Show the JSON indented", pressed: false, onClick: () => {
          state.pretty = !state.pretty;
          prettyBtn.setAttribute("aria-pressed", String(state.pretty));
          render();
        } });
        tools.push(el("div", { class: "tool-group" }, prettyBtn));
      }
      ctx.toolbar.replaceChildren(...tools);

      applyLook();
      render();
      return {};
    },
  });

  function isJson(t) { try { JSON.parse(t); return true; } catch (e) { return false; } }

  function countLines(t) {
    let n = 1;
    for (let i = t.indexOf("\n"); i !== -1; i = t.indexOf("\n", i + 1)) n++;
    if (t.endsWith("\n")) n--;
    return Math.max(1, n);
  }

  function numbers(n) {
    const parts = new Array(n);
    for (let i = 0; i < n; i++) parts[i] = i + 1;
    return parts.join("\n");
  }
})();
