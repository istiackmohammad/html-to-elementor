# How HTML maps to Elementor

Output uses Elementor's flexbox/grid **containers** (Elementor 3.16+ and 4.x) and **free**
widgets only, so no Elementor Pro and no add-on plugins are needed.

## Elements

| HTML | Elementor |
|---|---|
| `section`, `header`, `footer`, `main`, `article`, `aside`, `nav`, `div` with block children | Container (`html_tag` kept for semantic tags) |
| element with `display:flex` | Container, `flex_direction` row/column, gap, justify, align, wrap |
| element with `display:grid` | Grid container, columns from `grid-template-columns` |
| wrapper with `max-width` + `margin:auto` (e.g. `.container`) | Merged into its parent as a **boxed** container with that width |
| `h1`–`h6` | Heading |
| `p`, `blockquote`, `pre`, text-only `div`/`span`, lists of rich text | Text Editor (consecutive paragraphs are merged into one) |
| `a.btn`, `a.button`, `a.cta`, `<button>`, or any link styled with background/border + padding | Button (colours, padding, radius, border, hover colours) |
| `img`, `picture`, `a > img` | Image (with link when wrapped) |
| `ul`/`ol` whose items are short text or links | Icon List (inline view when the list is a flex row, e.g. a nav) |
| `<i class="fa-solid fa-...">` | Icon (Font Awesome 5/6 free) |
| YouTube / Vimeo `iframe`, `<video>` | Video |
| `hr` | Divider |
| `a` styled as a block (card links) | Container with `html_tag: a` and a link |
| `form`, `table`, `svg`, `canvas`, `iframe` (non-video), `input`, `select`, `textarea`, `details` | HTML widget (markup kept as is) |
| `script`, `style`, `link`, `meta`, `noscript` | Dropped (styles are read first) |

## Styles

Computed from the page's `<style>` blocks, linked local `.css` files, and inline `style=""`,
with real cascade order and specificity, `!important`, and CSS variables (`var(--x, fallback)`).

| CSS | Elementor setting |
|---|---|
| `padding`, `margin` | Padding / Margin (container) or Advanced › Padding / Margin (widget) |
| `background-color`, `background-image: url()`, `linear-gradient()` | Classic or Gradient background |
| `border`, `border-radius`, `box-shadow` | Border type/width/colour, radius, box shadow |
| `color`, `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing`, `text-transform`, `font-style` | Text colour + custom Typography |
| `text-align` | Alignment |
| `gap`, `row-gap`, `column-gap` | Container gap |
| `max-width`, `width`, `min-height` | Boxed width, width, min height |
| `:hover` colours on buttons | Hover text / background / border colour |
| `display:none` inside a media query | Responsive › Hide on tablet / mobile |

## Responsive

Styles are computed at three widths that match Elementor's default breakpoints:
desktop (1366px), tablet (900px, inside the 768–1024 range) and mobile (390px).
Both desktop-first (`max-width`) and mobile-first (`min-width`) media queries work.
Tablet and mobile values are written only where they differ (`*_tablet`, `*_mobile`).

## Not converted (yet)

- JavaScript behaviour (sliders, tabs, accordions, counters): the static markup is converted, the motion is not.
- `::before` / `::after` pseudo-elements, CSS animations, `position:absolute` layering.
- Tailwind or other utility-class frameworks: compile them to plain CSS first.
- Remote stylesheets: inline them or pass them with `--css`.
- Relative image paths: upload the images to WordPress, then pass `--base-url`.

Tips for the cleanest result: use semantic tags, keep CSS in a `<style>` block, use
classes such as `.btn` for buttons, use Font Awesome `<i>` icons, and use absolute image URLs.
