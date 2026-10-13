/* AnyPage app shell: opening files, tabs, toolbar and status bar. */
(function () {
  "use strict";
  const { el, icon, formatBytes, extOf } = AnyPage;

  const MAX_BYTES = 512 * 1024 * 1024; // refuse files over 512 MB for now

  const $ = (id) => document.getElementById(id);
  const tabsEl = $("tabs");
  const viewsEl = $("views");
  const toolbarEl = $("toolbar");
  const welcomeEl = $("welcome");
  const appEl = $("app");
  const statusEl = $("status-text");
  const fileInput = $("file-input");

  const tabs = []; // { id, name, size, kind, tabEl, viewEl, toolEl, status, instance }
  let activeId = null;
  let nextId = 1;

  // fill the icon placeholders on the welcome screen
  for (const slot of document.querySelectorAll("[data-icon]")) {
    slot.replaceWith(AnyPage.fileIcon(slot.dataset.icon, { ext: slot.dataset.ext, size: slot.dataset.size }));
  }

  /* ---------- opening ---------- */

  async function openFile(file) {
    const tab = createTab(file.name, file.size);
    if (file.size > MAX_BYTES) {
      tab.viewEl.replaceChildren(AnyPage.notice("This file is too large", `${file.name} is ${formatBytes(file.size)}. AnyPage opens files up to ${formatBytes(MAX_BYTES)} for now.`, true));
      return;
    }
    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (e) {
      tab.viewEl.replaceChildren(AnyPage.notice("Couldn't read this file", e.message || String(e), true));
      return;
    }
    await mountViewer(tab, buffer);
  }

  async function mountViewer(tab, buffer) {
    const head = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4096));
    const viewer = AnyPage.pick(tab.name, head);
    if (!viewer) {
      setKind(tab, "other");
      tab.viewEl.replaceChildren(unsupported(tab.name));
      setTabStatus(tab, `${tab.name} · ${formatBytes(tab.size)} · not supported yet`);
      return;
    }
    setKind(tab, viewer.kind);
    tab.viewEl.replaceChildren(el("div", { class: "loading" }, "Opening " + tab.name + "…"));
    try {
      tab.instance = await viewer.mount({
        name: tab.name,
        size: tab.size,
        buffer,
        view: tab.viewEl,
        toolbar: tab.toolEl,
        setStatus: (text) => setTabStatus(tab, `${viewer.label} · ${formatBytes(tab.size)}${text ? " · " + text : ""}`),
      });
      if (!tab.status) setTabStatus(tab, `${viewer.label} · ${formatBytes(tab.size)}`);
      if (activeId === tab.id) showToolbar(tab);
    } catch (e) {
      console.error(e);
      tab.viewEl.replaceChildren(AnyPage.notice(
        "AnyPage couldn't open this file",
        `${tab.name} may be damaged or use a feature AnyPage doesn't support yet. Details: ${e && e.message ? e.message : e}`,
        true));
      setTabStatus(tab, `${tab.name} · could not open`);
    }
  }

  function unsupported(name) {
    const ext = extOf(name) || "this type";
    const later = {
      ".doc": "Older Word files (.doc) are planned. Until then, save it as .docx in Word or LibreOffice.",
      ".xls": "Older Excel files (.xls) are planned. Until then, save it as .xlsx or .csv.",
      ".ppt": "PowerPoint support is planned for the next version.",
      ".pptx": "PowerPoint support is planned for the next version.",
      ".odt": "OpenDocument support is planned.",
      ".ods": "OpenDocument support is planned.",
      ".epub": "eBook support is planned.",
      ".heic": "iPhone photos (.heic) are planned. Most phones can export them as .jpg.",
      ".msg": "Outlook email files are planned.",
      ".eml": "Email files are planned.",
    }[ext];
    const box = AnyPage.notice(`AnyPage can't open ${ext} files yet`, later || "Supported now: PDF, Word (.docx), Excel (.xlsx, .csv), text and code files, and images.");
    box.prepend(AnyPage.fileIcon("other", { ext: extOf(name) || ".file" }));
    return box;
  }

  /* ---------- tabs ---------- */

  function createTab(name, size) {
    const id = nextId++;
    const kindEl = el("span", { class: "tab-icon" }, AnyPage.fileIcon("other", { size: "sm" }));
    const closeBtn = el("span", { class: "tab-close", role: "button", title: "Close", "aria-label": "Close " + name });
    closeBtn.append(icon("close", "0 0 12 12"));
    const tabEl = el("div", { class: "tab", role: "tab", tabindex: "0", title: name, "aria-selected": "false" },
      kindEl, el("span", { class: "tab-name" }, name), closeBtn);
    const viewEl = el("div", { class: "view", role: "tabpanel", hidden: true });
    const toolEl = el("div", { class: "toolbar-content" });

    const tab = { id, name, size, kind: "other", tabEl, kindEl, viewEl, toolEl, status: "", instance: null };
    tabs.push(tab);

    tabEl.addEventListener("click", (e) => {
      if (e.target.closest(".tab-close")) closeTab(tab);
      else activate(tab);
    });
    tabEl.addEventListener("auxclick", (e) => { if (e.button === 1) closeTab(tab); });
    tabEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(tab); }
      if (e.key === "Delete") closeTab(tab);
    });

    tabsEl.append(tabEl);
    viewsEl.append(viewEl);
    activate(tab);
    return tab;
  }

  function setKind(tab, kind) {
    const k = AnyPage.iconKind(kind, extOf(tab.name));
    tab.kind = kind;
    tab.kindEl.replaceChildren(AnyPage.fileIcon(k, { size: "sm" }));
    tab.tabEl.title = `${tab.name} (${AnyPage.kindName(k)})`;
  }

  function activate(tab) {
    activeId = tab.id;
    for (const t of tabs) {
      const on = t === tab;
      t.tabEl.setAttribute("aria-selected", String(on));
      t.viewEl.hidden = !on;
    }
    welcomeEl.hidden = true;
    appEl.classList.add("has-tabs");
    showToolbar(tab);
    statusEl.textContent = tab.status || tab.name;
    tab.tabEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (tab.instance && tab.instance.onShow) tab.instance.onShow();
  }

  function showToolbar(tab) {
    toolbarEl.replaceChildren(tab.toolEl);
    toolbarEl.hidden = !tab.toolEl.childElementCount;
  }

  function closeTab(tab) {
    const i = tabs.indexOf(tab);
    if (i < 0) return;
    try { tab.instance && tab.instance.destroy && tab.instance.destroy(); } catch (e) { console.warn(e); }
    tab.tabEl.remove();
    tab.viewEl.remove();
    tabs.splice(i, 1);
    if (activeId === tab.id) {
      const next = tabs[i] || tabs[i - 1];
      if (next) activate(next);
      else showWelcome();
    }
  }

  function showWelcome() {
    activeId = null;
    welcomeEl.hidden = false;
    appEl.classList.remove("has-tabs");
    toolbarEl.hidden = true;
    toolbarEl.replaceChildren();
    statusEl.textContent = "Ready";
  }

  function setTabStatus(tab, text) {
    tab.status = text;
    if (activeId === tab.id) statusEl.textContent = text;
  }

  /* ---------- inputs: button, drag and drop, keyboard, samples ---------- */

  function pickFiles() { fileInput.value = ""; fileInput.click(); }
  $("open-btn").addEventListener("click", pickFiles);
  $("welcome-open").addEventListener("click", pickFiles);
  fileInput.addEventListener("change", () => {
    for (const f of fileInput.files) openFile(f);
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") { e.preventDefault(); pickFiles(); }
  });

  const overlay = $("drop-overlay");
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
  window.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; overlay.hidden = false; });
  window.addEventListener("dragover", (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  window.addEventListener("dragleave", (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) overlay.hidden = true; });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    overlay.hidden = true;
    for (const f of e.dataTransfer.files) openFile(f);
  });

  async function openSample(name) {
    try {
      let bytes;
      const embedded = window.ANYPAGE_SAMPLES && window.ANYPAGE_SAMPLES[name];
      if (embedded) {
        const bin = atob(embedded);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        const res = await fetch("samples/" + encodeURIComponent(name));
        if (!res.ok) throw new Error("Sample not found");
        bytes = new Uint8Array(await res.arrayBuffer());
      }
      await openFile(new File([bytes], name));
    } catch (e) {
      const tab = createTab(name, 0);
      tab.viewEl.replaceChildren(AnyPage.notice("Sample unavailable", String(e.message || e), true));
    }
  }
  $("sample-row").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sample]");
    if (b) openSample(b.dataset.sample);
  });

  window.addEventListener("resize", () => {
    const t = tabs.find((x) => x.id === activeId);
    if (t && t.instance && t.instance.onResize) t.instance.onResize();
  });

  // Exposed for the desktop/mobile shells to open files passed by the OS.
  AnyPage.openFile = openFile;
})();
