"""Bundle src/ into one self-contained preview page (dist/preview.html).

The real app loads its libraries from src/vendor/ so it works offline.
The preview page loads the same library versions from public CDNs instead,
inlines our own CSS and JS, and embeds the sample files.
"""
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT = ROOT / "dist" / "preview.html"

PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/"
PREVIEW_LIBS = {
    "pdfjs": PDFJS + "pdf.min.mjs",
    "pdfWorker": PDFJS + "pdf.worker.min.mjs",
    # character maps, standard fonts and image decoders can't be fetched from a
    # preview page; pdf.js falls back to built-in fonts for those rare cases
}


def script_safe(js: str) -> str:
    return js.replace("</script", "<\\/script")


def main():
    html = (SRC / "index.html").read_text(encoding="utf-8")
    title = re.search(r"<title>.*?</title>", html, re.S).group(0)
    body = re.search(r"<body>(.*)</body>", html, re.S).group(1)

    css = []
    for href in re.findall(r'<link rel="stylesheet" href="([^"]+)"', html):
        css.append((SRC / href).read_text(encoding="utf-8"))

    # library config -> CDN copies
    config_tag = '<script src="js/config.js" id="libs-config"></script>'
    assert config_tag in body, "library config tag not found in index.html"
    body = body.replace(config_tag, '<script id="libs-config">window.ANYPAGE_LIBS = ' + json.dumps(PREVIEW_LIBS, indent=1) + ";</script>")

    # vendor scripts -> their CDN URL
    body = re.sub(r'<script src="[^"]+" data-cdn="([^"]+)"></script>', r'<script src="\1"></script>', body)

    # our scripts -> inline
    def inline(m):
        return "<script>\n" + script_safe((SRC / m.group(1)).read_text(encoding="utf-8")) + "\n</script>"
    body = re.sub(r'<script src="(js/[^"]+)"></script>', inline, body)

    # sample files -> embedded
    samples = {p.name: base64.b64encode(p.read_bytes()).decode() for p in sorted((SRC / "samples").iterdir()) if p.is_file()}
    sample_js = "<script>window.ANYPAGE_SAMPLES = " + json.dumps(samples) + ";</script>\n"
    body = body.replace('<script id="libs-config">', sample_js + '<script id="libs-config">', 1)

    page = f"{title}\n<style>\n{''.join(css)}\n</style>\n{body.strip()}\n"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
