# Contributing

Thanks for helping. Good contributions, roughly in order of value:

1. **A page that converts badly.** Open an issue with the HTML (or a minimal snippet), what you
   expected in Elementor, and what you got. Screenshots help. Include your Elementor version.
2. **Import reports.** "Imported fine on Elementor X.Y" or "setting Z is ignored" is real data.
3. **New mappings.** A widget we don't produce yet (testimonial, image box, star rating,
   social icons, accordion from `<details>`, ...), or a CSS property we drop.
4. **Fixes** to the CSS engine (selectors, shorthands, units) or the WordPress plugin.

## Setup

```bash
npm install
npm test            # engine tests
npm run typecheck
npm run build       # needed before the PHP tests and packaging
npm run test:php    # plugin logic tests (PHP 7.4+)
```

## Ground rules

- **One engine.** All conversion logic lives in `src/` (TypeScript). The CLI, MCP server, skill
  and WordPress plugin all use it, so a fix lands everywhere at once. Don't duplicate it in PHP.
- **The engine must run in the browser.** Only `src/node.ts`, `src/cli.ts` and `src/server.ts`
  may use Node APIs.
- **Free widgets only** by default. Pro or add-on widgets can come later behind an option.
- **Use real setting keys.** Before adding a setting, confirm its key in an Elementor export
  (Templates › Export) or in Elementor's source, not from memory.
- **Every change gets a test.** Converting `examples/landing.html` must stay free of HTML
  fallbacks and warnings.
- **WordPress code** follows the WordPress coding standards: escape output, check capabilities,
  validate input, prefix everything with `hte_` / `HTE_`.
- Keep files under ~500 lines. Split by concern.

## Adding a widget

1. Write a builder in `src/widgets.ts` that returns `{ content, style }`: content settings that
   don't depend on screen size, plus a function mapping a computed style to style settings.
2. Decide when it applies in `Converter.convert()` in `src/converter.ts`.
3. If a new setting is responsive, add its key to the `RESPONSIVE` pattern.
4. Add a test in `test/` and a row in `docs/MAPPING.md`.

## Releases

Versions live in `package.json`, `src/version.ts` and the plugin header
(`wordpress-plugin/html-to-elementor/html-to-elementor.php` + `readme.txt`); `npm run build`
fails if they disagree. `npm run package` writes the skill and plugin zips to `release/`.

## Pull requests

Small, focused PRs are easiest to review. Describe what changed and how you checked it
(tests, plus an import into Elementor when the output shape changes).
