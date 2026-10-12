---
name: html-to-elementor
description: Convert an HTML landing page or website section into a native Elementor template (flexbox containers + free widgets like Heading, Text Editor, Button, Image, Icon List, Video) and package it as an importable .json/.zip. Use when the user wants to turn HTML, a static page, an AI-generated mockup, or a design they coded into an editable Elementor page, says "html to elementor", "make this an Elementor page", "convert to Elementor JSON", or wants a template to import into WordPress.
---

# HTML to Elementor

Turns HTML + CSS into an Elementor template made of real, editable containers and widgets
(not one big HTML block). The output imports through **Elementor › Templates › Saved Templates ›
Import Templates** and works with free Elementor 3.16+ and 4.x. No Pro, no add-ons.

The converter is bundled as one file, `scripts/convert.mjs`. It needs only Node.js 18+ (no npm install).

## Workflow

1. **Get the HTML into a file.** If the user pasted HTML, save it as `page.html`. Keep the
   page's `<style>` blocks. A local `.css` file linked from the page is read automatically if it
   sits next to the HTML. Remote stylesheets are not fetched.

2. **Prepare it if needed** (check before converting, and tell the user what you changed):
   - Tailwind or other utility-class CSS: rewrite it as plain CSS in a `<style>` block first,
     because utility classes are not interpreted.
   - Relative image paths (`img/hero.jpg`): ask where the images will live and pass
     `--base-url https://site.com/wp-content/uploads/2026/10/`, or use absolute URLs.
   - Buttons should be `<a class="btn">` or `<button>`. Icons should be Font Awesome `<i>` tags.
   - Content built by JavaScript does not exist in static HTML. Write it out as markup.

3. **Convert:**
   ```bash
   node <skill-dir>/scripts/convert.mjs page.html -o out/ --title "Page name"
   ```
   Options: `--base-url URL`, `--css extra.css`, `--keep-css` (also embed the original CSS in an
   HTML widget and keep class names, for closer visual fidelity), `--no-canvas` (keep the theme's
   header/footer instead of the blank Elementor Canvas template), `--type section`, `--no-zip`,
   `--stdout`, `--elements-only` (print the raw `_elementor_data` array).

4. **Read the report** printed as JSON: widget counts, `htmlFallbacks` (elements kept as HTML
   widgets: forms, tables, SVG, non-video iframes) and `warnings`. If something important fell
   back to HTML or a warning applies, fix the HTML and convert again.

5. **Deliver** `out/<slug>.zip` (and the `.json`) with these import steps:
   1. WordPress admin › Templates › Saved Templates › **Import Templates** › choose the .zip or .json.
   2. Create or open a page › Edit with Elementor › folder icon › My Templates › **Insert**.
   On Elementor 3.x the Flexbox Container feature must be on (Elementor › Settings › Features);
   it is on by default for new sites and always on in Elementor 4.

   If the site has the **HTML to Elementor** WordPress plugin, the user can instead run
   `wp html-to-elementor import out/<slug>.json --user=admin` or use Tools › HTML to Elementor.

## What maps to what

See `references/MAPPING.md` for the full table. In short: semantic blocks and flex/grid
layouts become containers (with responsive direction, gap and columns), headings become
Heading widgets, paragraphs become Text Editor, styled links become Buttons (with hover
colours), and images, icon lists, Font Awesome icons, YouTube/Vimeo/video and dividers map to
their widgets. Media queries become tablet/mobile settings, including hide-on-mobile.

## Be honest about limits

Sliders, tabs, accordions and other JavaScript behaviour, `::before/::after` decoration,
absolute-positioned layering and CSS animations are not converted. Tell the user which parts
need a manual touch after import rather than claiming a pixel-perfect result.
