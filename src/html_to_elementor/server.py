"""MCP server exposing the converter to any MCP client (Claude, Cursor, Codex, ...).

Run:  html-to-elementor-mcp          (stdio transport)
"""
from __future__ import annotations

import json
from pathlib import Path

try:                                   # mcp 2.x
    from mcp.server.mcpserver import MCPServer as _Server
except ImportError:
    try:                               # mcp 1.x
        from mcp.server.fastmcp import FastMCP as _Server
    except ImportError as exc:  # pragma: no cover
        raise SystemExit("The MCP server needs the 'mcp' package: pip install 'html-to-elementor[mcp]'") from exc

from .converter import Options, convert, convert_file, to_template
from .output import write_outputs

mcp = _Server("html-to-elementor")


@mcp.tool()
def convert_html(html: str, title: str = "Converted page", base_url: str = "",
                 keep_css: bool = False, canvas: bool = True, elements_only: bool = False) -> str:
    """Convert an HTML page (with its <style> CSS) into an Elementor template made of
    native containers and widgets (heading, text-editor, button, image, icon-list, icon,
    video, divider; anything else becomes an HTML widget).

    Returns JSON: {"template": <Elementor template export>, "report": {...}}.
    Save "template" as a .json file and import it in Elementor > Templates > Import.
    With elements_only=true, "template" is just the elements array (_elementor_data).

    base_url: prefix for relative image/link URLs.
    keep_css: also embed the original CSS in an HTML widget and keep class names.
    canvas: set the page template to Elementor Canvas (no theme header/footer).
    """
    opts = Options(title=title, base_url=base_url, keep_css=keep_css, canvas=canvas)
    elements, page_settings, report = convert(html, opts)
    data = elements if elements_only else to_template(elements, page_settings, title)
    return json.dumps({"template": data, "report": report.as_dict()}, ensure_ascii=False)


@mcp.tool()
def convert_html_file(path: str, out_dir: str = "", title: str = "", base_url: str = "",
                      keep_css: bool = False, canvas: bool = True) -> str:
    """Convert an .html file on disk and write <slug>.json and <slug>.zip next to it
    (or into out_dir). Local stylesheets linked from the page are read too.
    Returns the written paths and a conversion report."""
    p = Path(path).expanduser()
    if not p.is_file():
        return json.dumps({"error": f"file not found: {p}"})
    if not title:
        import re
        m = re.search(r"<title[^>]*>(.*?)</title>", p.read_text(encoding="utf-8", errors="replace"), re.I | re.S)
        title = (m.group(1).strip() if m else "") or p.stem
    opts = Options(title=title, base_url=base_url, keep_css=keep_css, canvas=canvas)
    elements, page_settings, report = convert_file(str(p), opts)
    paths = write_outputs(elements, page_settings, title, out_dir or str(p.parent))
    return json.dumps({"files": paths, "report": report.as_dict()})


@mcp.tool()
def widget_mapping() -> str:
    """Describe how HTML elements map to Elementor widgets, so the caller can shape its
    HTML for the cleanest conversion."""
    return (Path(__file__).with_name("MAPPING.md")).read_text(encoding="utf-8")


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
