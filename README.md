# AnyPage

A free, ad-free, open-source app that opens everyday documents in one place: PDF, Word, Excel, CSV, text and code files, and images. Everything stays on your device.

Targets: Windows and Android (one codebase, packaged with Tauri).

## What opens today

| Kind | Formats |
| --- | --- |
| Documents | PDF (selectable text, links, password-protected files), Word `.docx` |
| Spreadsheets | Excel `.xlsx` (number and date formats, colours, merged cells, multiple sheets), `.csv`, `.tsv` |
| Text and code | `.txt`, `.log`, `.json`, `.xml`, `.sql`, `.py`, `.js`, `.md` and ~50 more, with line numbers and syntax colours |
| Images | `.jpg`, `.png`, `.webp`, `.gif`, `.svg`, `.bmp`, `.ico`, `.avif` |

Planned: PowerPoint, Kindle-style reading mode for PDFs, `.doc`/`.xls`, OpenDocument, ePub, email files, archives.

## Install

Builds are made automatically on GitHub for every change (Actions tab → latest "Build apps" run → Artifacts):

- **AnyPage-Windows**: run the installer. Windows may warn that the app is from an unknown publisher; choose *More info → Run anyway*. The app isn't code-signed yet.
- **AnyPage-Android**: install the `.apk` on an Android phone (allow "Install unknown apps" for your file manager or browser). Test builds are signed with a new key each time, so uninstall the previous build first.

Once installed, AnyPage appears in **Open with** on Windows and in Android's **Open with** and **Share** menus for PDF, Word, Excel, CSV, text and image files.

## Project layout

```
src/                 the app (plain HTML, CSS and JavaScript, no build step)
  index.html
  css/               app shell and viewer styles
  js/core.js         shared helpers and the viewer registry
  js/app.js          tabs, opening files, drag and drop
  js/viewers/        one file per format family (pdf, docx, sheet, text, image)
  vendor/            third-party libraries, kept locally so the app works offline
  samples/           files used by the "Try a sample" buttons
src-tauri/           the Windows and Android app shell (Tauri 2, Rust)
  tauri.conf.json    app settings and Windows file associations
  tauri.android.conf.json  Android file associations
  src/lib.rs         hands files opened from the OS to the page
android/
  MainActivity.kt    receives files from other Android apps ("Open with", "Share")
tools/
  make_samples.py    regenerates src/samples
  build_preview.py   bundles everything into dist/preview.html for a browser preview
  android_setup.py   copies android/ into the generated Android project during builds
app-icon.svg / .png  the app icon (all icon sizes are generated from the PNG)
.github/workflows/build.yml  builds the Windows installer and the Android app
```

## Run it locally

The viewer is plain web code, so any static web server works:

```
npx http-server src
```

To run the desktop app (needs Node.js and Rust):

```
npm install
npx tauri icon app-icon.png
npx tauri dev
```

## Third-party libraries

| Library | Version | Licence |
| --- | --- | --- |
| pdf.js (legacy build) | 6.3.289 | Apache-2.0 |
| docx-preview | 0.4.0 | Apache-2.0 |
| JSZip | 3.10.1 | MIT |
| highlight.js | 11.11.1 | BSD-3-Clause |

The Excel and CSV readers are AnyPage's own code.

## Licence

AnyPage is free software under the [GNU General Public License v3.0](LICENSE). You may use, share and change it; if you share a changed version, it must stay open source under the same licence.
