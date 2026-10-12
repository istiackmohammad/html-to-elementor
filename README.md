# html-to-elementor

Convert HTML pages into **native Elementor pages and templates**: real flexbox/grid
containers and editable widgets (Heading, Text Editor, Button, Image, Icon List, Icon, Video,
Divider), not one big HTML block.

- **Open source (MIT).** Runs locally: your HTML is never sent to a third-party service.
- **Free Elementor widgets only.** Works with Elementor 3.16+ and 4.x. No Pro, no add-ons.
- **Reads your CSS properly.** It handles the cascade, specificity, `!important`, CSS variables,
  shorthands and media queries, and turns them into Elementor's desktop / tablet / mobile settings.
- **One engine, five ways to use it:**

| | For | Get it |
|---|---|---|
| **WordPress plugin** | Site owners: Tools › HTML to Elementor, plus `wp html-to-elementor` WP-CLI | [Releases](../../releases) › `html-to-elementor-wp-plugin-*.zip` |
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

## WordPress plugin

Install the plugin zip from the [latest release](../../releases), activate it (Elementor must be
active), then:

- **Tools › HTML to Elementor:** paste or upload HTML. It converts in your browser, shows a
  report, then creates a draft page or a saved template. It can also copy remote images into
  the Media Library.
- **WP-CLI:**

```bash
wp html-to-elementor doctor                                       # Elementor, containers, Node.js ready?
wp html-to-elementor import landing.html --user=admin             # .html needs Node.js 18+ on the server
wp html-to-elementor import landing.json --as=template --user=admin   # .json needs nothing extra
wp html-to-elementor import landing.html --post=42 --sideload-images --status=publish --user=admin
wp html-to-elementor convert landing.html --out=./converted
```

Pages are saved through Elementor's own Documents API. HTML widgets (forms, tables, SVG) can
only be imported by users with the `unfiltered_html` capability. A REST endpoint
(`POST /wp-json/html-to-elementor/v1/import`) is available for your own tools.

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

A good pairing: let your AI design the page as HTML, convert it here, then import it with the
plugin, the import screen or Elementor's official MCP.

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

`convert`, `toTemplate` and `templateZip` run in the browser too; `convertFile` and
`writeOutputs` are the Node file helpers.

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
npm run build            # tsc + bundles for the skill and the plugin
npm run test:php         # plugin logic tests (needs PHP 7.4+, after build)
npm run package          # release/ zips: skill + WordPress plugin
```

| Path | Role |
|---|---|
| `src/dom.ts` | DOM on top of parse5 (WHATWG-compliant parsing) |
| `src/css.ts` | Stylesheet parser, selector matching, cascade, `var()`, media queries |
| `src/styles.ts` | CSS → Elementor control settings |
| `src/widgets.ts` | One builder per Elementor widget |
| `src/converter.ts` | Walks the DOM, decides container vs widget, merges responsive settings |
| `src/cli.ts`, `src/server.ts` | CLI and MCP server |
| `wordpress-plugin/` | Plugin: importer (Elementor Documents API), REST, admin screen, WP-CLI |
| `skill/` | Agent skill (the converter is bundled into `scripts/convert.mjs` at build) |

Contributions are welcome, especially new widget mappings, real-world pages that convert
badly (attach the HTML), and import results on different Elementor versions. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
