# html-to-elementor

Convert HTML pages into **native Elementor pages and templates**: real flexbox/grid
containers and editable widgets (Heading, Text Editor, Button, Image, Icon List, Icon, Video,
Divider), not one big HTML block.

- **Open source (MIT).** Runs locally: your HTML is never sent to a third-party service.
- **Free Elementor widgets only.** Works with Elementor 3.16+ and 4.x. No Pro, no add-ons.
- **Reads your CSS properly.** It handles the cascade, specificity, `!important`, CSS variables,
  shorthands and media queries, and turns them into Elementor's desktop / tablet / mobile settings.
- **One engine, four ways to use it:**

| | For | Get it |
|---|---|---|
| **CLI** | Developers, build pipelines | `npx -y github:istiackmohammad/html-to-elementor page.html` |
| **MCP server** | Claude, Cursor, Codex, any MCP client | `npx -y -p github:istiackmohammad/html-to-elementor html-to-elementor-mcp` |
| **Agent skill** | Claude Code / Claude.ai skills | [Releases](../../releases) › `html-to-elementor-skill.zip` |
| **Library** | Your own tools (Node and browser) | `npm install github:istiackmohammad/html-to-elementor` |

> Not on the npm registry yet: the commands below install straight from GitHub (npm builds it on
> first run). Once published, `github:istiackmohammad/html-to-elementor` becomes plain `html-to-elementor`.

## Why

Elementor's official MCP builds pages from prompts on a live site (Elementor 4.3+, admin
application password, Atomic layouts) and does not take HTML. Hosted HTML importers send
your markup to a paid service. This project is an open, local, scriptable converter you can
read, fix and extend.

## CLI

```bash
npx -y github:istiackmohammad/html-to-elementor page.html -o out/
```

This writes `out/<page-title>.json` and `out/<page-title>.zip` and prints a report. Import
either file in **Templates › Saved Templates › Import Templates**.

| Flag | What it does |
|---|---|
| `--title "Name"` | Template title (default: the page `<title>`) |
| `--base-url URL` | Prefix for relative image and link URLs |
| `--css file.css` | Apply an extra stylesheet (repeatable). Local `<link>`ed CSS is read automatically |
| `--keep-css` | Also embed the original CSS in an HTML widget and keep class names, for closer fidelity |
| `--no-canvas` | Keep the theme header/footer (default page template is Elementor Canvas) |
| `--type section` | Save as a section template instead of a page |
| `--stdout` | Print `{template, report}` JSON instead of writing files |
| `--elements-only` | Print just the elements array (the `_elementor_data` value) |
| `--no-zip` | Write only the `.json` |
| `--seed N` | Reproducible element IDs |

## MCP server

Claude Code:

```bash
claude mcp add html-to-elementor -- npx -y -p github:istiackmohammad/html-to-elementor html-to-elementor-mcp
```

Claude Desktop, Cursor and other clients:

```json
{
  "mcpServers": {
    "html-to-elementor": {
      "command": "npx",
      "args": ["-y", "-p", "github:istiackmohammad/html-to-elementor", "html-to-elementor-mcp"]
    }
  }
}
```

Tools:

- `convert_html(html, title?, base_url?, keep_css?, canvas?, elements_only?)` returns `{template, report}`.
- `convert_html_file(path, out_dir?, ...)` writes `.json` and `.zip` to disk.
- `widget_mapping()` returns the HTML → widget mapping so the model can shape its HTML first.

A good pairing: let your AI design the page as HTML, convert it here, then import it with
Elementor's import screen or its official MCP.

## Agent skill

Download `html-to-elementor-skill.zip` from the [latest release](../../releases):

- **Claude.ai:** Settings › Capabilities › Skills › upload the zip.
- **Claude Code:** unzip into `~/.claude/skills/`, or from a checkout run `npm run package -- --install ~/.claude/skills`.

The skill bundles the converter in one file and needs only Node.js 18+.

## Library

```ts
import { convert, toTemplate, templateZip } from "html-to-elementor";

const result = convert(html, { title: "Landing", baseUrl: "https://cdn.example.com/" });
const template = toTemplate(result, "Landing");   // Elementor template export
const zip = templateZip(template);                 // Uint8Array, importable .zip
console.log(result.report);                        // widget counts, HTML fallbacks, warnings
```

`convert`, `toTemplate` and `templateZip` run in the browser too (`npm run build` also writes a
standalone `dist/bundle/html-to-elementor.browser.js` exposing `window.HtmlToElementor`);
`convertFile` and `writeOutputs` are the Node file helpers.

## What converts to what

Full table: [`docs/MAPPING.md`](docs/MAPPING.md).

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
absolute-positioned layering, Tailwind utility classes (compile to CSS first), and remote
stylesheets (inline them or pass `--css`).

## Development

```bash
git clone https://github.com/istiackmohammad/html-to-elementor
cd html-to-elementor
npm install
npm test                 # engine tests (vitest)
npm run build            # tsc + bundles (skill script, dist/bundle/)
npm run package          # release/html-to-elementor-skill.zip
```

| Path | Role |
|---|---|
| `src/dom.ts` | DOM on top of parse5 (WHATWG-compliant parsing) |
| `src/css.ts` | Stylesheet parser, selector matching, cascade, `var()`, media queries |
| `src/styles.ts` | CSS → Elementor control settings |
| `src/widgets.ts` | One builder per Elementor widget |
| `src/converter.ts` | Walks the DOM, decides container vs widget, merges responsive settings |
| `src/cli.ts`, `src/server.ts` | CLI and MCP server |
| `skill/` | Agent skill (the converter is bundled into `scripts/convert.mjs` at build) |

Contributions are welcome, especially new widget mappings, real-world pages that convert
badly (attach the HTML), and import results on different Elementor versions. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
