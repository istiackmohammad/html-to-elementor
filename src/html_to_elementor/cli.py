"""Command line: html-to-elementor page.html -o out/ [--title ...] [--base-url ...]"""
from __future__ import annotations

import argparse
import json
import sys

from .converter import Options, convert_file
from .output import dumps, write_outputs


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        prog="html-to-elementor",
        description="Convert an HTML page into an Elementor template built from native widgets.")
    ap.add_argument("html", help="path to the .html file")
    ap.add_argument("-o", "--out", default=".", help="output folder (default: current folder)")
    ap.add_argument("--title", help="template title (default: the page <title>)")
    ap.add_argument("--base-url", default="", help="prefix for relative image/link URLs, "
                    "e.g. https://example.com/wp-content/uploads/2026/10/")
    ap.add_argument("--css", action="append", default=[], help="extra stylesheet file(s) to apply")
    ap.add_argument("--keep-css", action="store_true",
                    help="also embed the original CSS in an HTML widget and keep class names")
    ap.add_argument("--no-canvas", action="store_true",
                    help="use the theme's header/footer instead of the Elementor Canvas template")
    ap.add_argument("--type", default="page", choices=["page", "section"], help="template type")
    ap.add_argument("--no-zip", action="store_true", help="write only the .json file")
    ap.add_argument("--elements-only", action="store_true",
                    help="print only the elements array (the _elementor_data value) to stdout")
    ap.add_argument("--seed", type=int, help="seed for element IDs (reproducible output)")
    args = ap.parse_args(argv)

    title = args.title
    if not title:
        import re
        from pathlib import Path
        m = re.search(r"<title[^>]*>(.*?)</title>", Path(args.html).read_text(encoding="utf-8", errors="replace"),
                      re.I | re.S)
        title = (m.group(1).strip() if m else "") or "Converted page"

    opts = Options(title=title, base_url=args.base_url, keep_css=args.keep_css,
                   canvas=not args.no_canvas, seed=args.seed)
    elements, page_settings, report = convert_file(args.html, opts, tuple(args.css))

    if args.elements_only:
        sys.stdout.write(dumps(elements) + "\n")
        return 0
    paths = write_outputs(elements, page_settings, title, args.out, args.type, not args.no_zip)
    print(json.dumps({"files": paths, "report": report.as_dict()}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
