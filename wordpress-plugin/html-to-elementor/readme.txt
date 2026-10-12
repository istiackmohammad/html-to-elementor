=== HTML to Elementor ===
Contributors: orbitronix
Tags: elementor, html, import, converter, wp-cli
Requires at least: 6.2
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 0.2.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Convert HTML pages into native, editable Elementor pages and templates: containers and free widgets, not one big HTML block.

== Description ==

Paste or upload an HTML page and get an Elementor page built from real containers and widgets (Heading, Text Editor, Button, Image, Icon List, Icon, Video, Divider). Flexbox and grid layouts, colours, typography, spacing, borders, shadows, gradients, hover colours and tablet/mobile media queries are carried over.

* **Tools › HTML to Elementor**: converts in your browser, then creates a draft page or a saved template. Can copy remote images into the Media Library.
* **WP-CLI**: `wp html-to-elementor import page.html` creates the page from the command line (needs Node.js 18+ on the server for .html; .json imports need nothing extra).
* Uses only free Elementor widgets. Works with Elementor 3.16+ (Flexbox Container enabled) and Elementor 4.

The converter is open source and also available as an npm CLI, an MCP server for AI assistants and an agent skill: https://github.com/istiackmohammad/html-to-elementor

== Installation ==

1. Install and activate Elementor.
2. Upload the plugin zip in Plugins › Add New › Upload Plugin, then activate it.
3. Go to Tools › HTML to Elementor.

== WP-CLI ==

    wp html-to-elementor doctor
    wp html-to-elementor import landing.html --status=draft --sideload-images --user=admin
    wp html-to-elementor import landing.json --as=template --user=admin
    wp html-to-elementor import landing.html --post=42 --user=admin   # replace page 42's content
    wp html-to-elementor convert landing.html --out=./converted

Set the HTE_NODE_BINARY constant in wp-config.php if Node.js is not on the PATH.

== Frequently Asked Questions ==

= Why does an imported page show nothing? =

Elementor 3.x needs Elementor › Settings › Features › Flexbox Container switched on. `wp html-to-elementor doctor` checks this.

= Who can import? =

Users who can edit pages. Pages that need HTML widgets (forms, tables, SVG) can only be imported by users allowed to post unfiltered HTML, usually administrators.

= What is not converted? =

JavaScript behaviour (sliders, tabs), ::before/::after decoration, animations, absolute-positioned layering and Tailwind utility classes. Compile Tailwind to plain CSS first.

== Changelog ==

= 0.2.0 =
* First release of the WordPress plugin: admin screen, REST endpoint and WP-CLI command.
