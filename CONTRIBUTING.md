# Contributing

Thanks for helping. Good contributions, roughly in order of value:

1. **A page that converts badly.** Open an issue with the HTML (or a minimal snippet), what you
   expected in Elementor, and what you got. Screenshots help. Include your Elementor version.
2. **Import reports.** "Imported fine on Elementor X.Y" or "setting Z is ignored" is real data.
3. **New mappings.** A widget we don't produce yet (testimonial, image box, star rating,
   social icons, accordion from `<details>`, ...), or a CSS property we drop.
4. **Fixes** to the CSS engine (selectors, shorthands, units).

## Setup

```bash
pip install -e ".[dev,mcp]"
pytest
```

## Ground rules

- **No runtime dependencies** in the converter. It must keep running from a bare Python 3.9+
  so the skill works anywhere. The MCP server may use `mcp`.
- **Free widgets only** by default. Pro or add-on widgets can come later behind an option.
- **Use real setting keys.** Before adding a setting, confirm its key in an Elementor export
  (Templates › Export) or in Elementor's source, not from memory.
- **Every change gets a test** in `tests/`. Converting `examples/landing.html` must stay free of
  HTML fallbacks and warnings.
- Keep files under ~500 lines. Split by concern.

## Adding a widget

1. Write a builder in `widgets.py` that returns `(content, style_fn)`: content settings that
   don't depend on screen size, plus a function mapping a computed style to style settings.
2. Decide when it applies in `Converter.convert()` in `converter.py`.
3. If a new setting is responsive, add its key to the `RESPONSIVE` pattern.
4. Add a test and a row in `MAPPING.md`.

## Pull requests

Small, focused PRs are easiest to review. Describe what changed and how you checked it
(tests, plus an import into Elementor when the output shape changes).
