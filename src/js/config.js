/* Where AnyPage finds its libraries. Everything ships inside the app so it works offline.
   (The browser preview build swaps this file for CDN copies.) */
window.ANYPAGE_LIBS = {
  pdfjs: "./vendor/pdfjs/pdf.mjs",
  pdfWorker: "./vendor/pdfjs/pdf.worker.mjs",
  pdfCMaps: "./vendor/pdfjs/cmaps/",
  pdfFonts: "./vendor/pdfjs/standard_fonts/",
  pdfWasm: "./vendor/pdfjs/wasm/",
};
