# html-to-elementor

Convert HTML pages into **native Elementor templates**: real flexbox/grid containers and
editable widgets (Heading, Text Editor, Button, Image, Icon List, Icon, Video, Divider), not
one big HTML block.

- Runs locally and offline. Your HTML never leaves your machine.
- Free and open source (MIT). No account, no API key, no quota.
- Uses only free Elementor widgets. Works with Elementor 3.16+ and 4.x, no Pro or add-ons needed.
- Reads your CSS properly: cascade, specificity, `!important`, CSS variables, shorthands and
  media queries, and turns them into Elementor's desktop / tablet / mobile settings.
- Comes in four forms: a **CLI**, a **Python library**, an **MCP server** (Claude, Cursor,
  Codex, any MCP client) and an **agent skill** (Claude Code / Claude.ai skills).

## Why

Elementor's official MCP builds pages from prompts on a live site (Elementor 4.3+, admin
application password, Atomic layouts). Hosted HTML importers send your markup to a paid
service. This project fills the gap: a local, scriptable converter you can read, fix and
extend.

## Quick start

```bash
pip install git+https://github.com/istiackmohammad/html-to-elementor
html-to-elementor page.html -o out/
```

This writes `out/<page-title>.json` and `out/<page-title>.zip`, plus a short report.

**Import into WordPress:** Templates › Saved Templates › **Import Templates** › pick the
`.zip` or `.json`. Then open any page with Elementor › folder icon › My Templates › **Insert**.

### Options

| Flag | What it does |
|---|---|
| `--title "Name"` | Template title (default: the page `<title>`) |
| `--base-url URL` | Prefix for relative image and link URLs |
| `--css file.css` | Apply an extra stylesheet (repeatable). Local `<link>`ed CSS is read automatically |
| `--keep-css` | Also embed the original CSS in an HTML widget and keep class names, for closer fidelity |
| `--no-canvas` | Keep the theme header/footer (default page template is Elementor Canvas) |
| `--type section` | Save as a section template instead of a page |
| `--elements-only` | Print just the elements array (the `_elementor_data` post meta value) |
| `--no-zip` | Write only the `.json` |
| `--seed N` | Reproducible element IDs |

### Python

```python
from html_to_elementor import Options, convert, to_template

elements, page_settings, report = convert(html, Options(title="Landing"))
template = to_template(elements, page_settings, "Landing")
print(report.as_dict())   # widget counts, HTML fallbacks, warnings
```

## MCP server

```bash
pip install "html-to-elementor[mcp] @ git+https://github.com/istiackmohammad/html-to-elementor"
```

Claude Code:

```bash
claude mcp add html-to-elementor -- html-to-elementor-mcp
```

Or with [uv](https://docs.astral.sh/uv/), no install step (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "html-to-elementor": {
      "command": "uvx",
      "args": ["--from", "html-to-elementor[mcp] @ git+https://github.com/istiackmohammad/html-to-elementor",
               "html-to-elementor-mcp"]
    }
  }
}
```

Tools:

- `convert_html(html, title, base_url, keep_css, canvas, elements_only)` returns the template JSON and a report.
- `convert_html_file(path, out_dir, ...)` writes the `.json` and `.zip` to disk.
- `widget_mapping()` returns the HTML → widget mapping so the model can shape its HTML first.

A good pairing: let your AI design the page as HTML, convert it here, then use Elementor's
official MCP or the import screen to place it on the site.

## Agent skill

The `skill/html-to-elementor` folder is a ready-made skill. Build the self-contained version
(the converter bundled inside, no install needed):

```bash
python scripts/build_skill.py                       # dist/html-to-elementor-skill.zip
python scripts/build_skill.py --install ~/.claude/skills
```

Upload the zip in Claude.ai (Settings › Capabilities › Skills), or install it into
`~/.claude/skills` for Claude Code. Each [release](../../releases) also has the zip attached.

## What converts to what

See [`src/html_to_elementor/MAPPING.md`](src/html_to_elementor/MAPPING.md). In short:

| HTML | Elementor |
|---|---|
| `section`/`header`/`footer`/`div`, flex and grid layouts | Containers with direction, gap, alignment, grid columns |
| `.container { max-width; margin:auto }` wrappers | Boxed container width |
| `h1`–`h6` | Heading |
| paragraphs and rich text | Text Editor |
| `.btn` links, `<button>`, styled links | Button, with hover colours |
| `img`, linked images | Image |
| nav and check lists | Icon List |
| Font Awesome `<i>` | Icon |
| YouTube / Vimeo / `<video>` | Video |
| `hr` | Divider |
| forms, tables, SVG, other iframes | HTML widget (kept as markup) |

**Not converted:** JavaScript behaviour (sliders, tabs), `::before/::after`, animations,
absolute-positioned layering, Tailwind utility classes (compile to CSS first), remote
stylesheets (inline them or pass `--css`).

## Development

```bash
git clone https://github.com/istiackmohammad/html-to-elementor
cd html-to-elementor
pip install -e ".[dev,mcp]"
pytest
html-to-elementor examples/landing.html -o out/
```

The code is small and dependency-free:

| File | Role |
|---|---|
| `dom.py` | Minimal HTML DOM on top of the standard library parser |
| `css.py` | Stylesheet parser, selector matching, cascade, `var()`, media queries |
| `styles.py` | CSS → Elementor control settings |
| `widgets.py` | One builder per Elementor widget |
| `converter.py` | Walks the DOM, decides container vs widget, merges responsive settings |
| `output.py`, `cli.py`, `server.py` | Files, command line, MCP server |

Contributions are very welcome, especially new widget mappings, real-world pages that convert
badly (attach the HTML), and import results on different Elementor versions. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
