/* Glue for the installed app (Tauri). Does nothing in a normal browser.
   - Opens files the operating system hands to AnyPage
     (double-click on Windows, "Open with" / "Share" on Android).
   - Opens web links in the system browser instead of inside the app. */
(function () {
  "use strict";
  const T = window.__TAURI__;
  if (!T || !T.core) return;
  const invoke = T.core.invoke;

  let busy = false;
  async function pickUpFiles() {
    if (busy) return;
    busy = true;
    try {
      const paths = await invoke("take_pending_files");
      for (const path of paths) {
        try {
          const bytes = await invoke("read_file", { path });
          const name = path.split(/[\\/]/).pop() || "file";
          await AnyPage.openFile(new File([bytes], name));
        } catch (e) {
          console.error("Couldn't open", path, e);
        }
      }
    } catch (e) {
      console.warn(e);
    } finally {
      busy = false;
    }
  }

  pickUpFiles();

  // Windows: a second double-click while AnyPage is open
  if (T.event && T.event.listen) T.event.listen("files-waiting", pickUpFiles);

  // Android: a file opened or shared while AnyPage is in the background
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pickUpFiles(); });
  window.addEventListener("focus", pickUpFiles);

  // Android copies a shared file in the background; check again for a few seconds after start
  let tries = 0;
  const timer = setInterval(() => {
    pickUpFiles();
    if (++tries >= 8) clearInterval(timer);
  }, 1000);

  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (/^(https?:|mailto:)/i.test(href)) {
      e.preventDefault();
      invoke("plugin:opener|open_url", { url: href }).catch((err) => console.warn(err));
    }
  });
})();
