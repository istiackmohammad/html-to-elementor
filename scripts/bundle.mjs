// Bundles the engine into single files for the agent skill and the WordPress plugin.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const version = /VERSION = "([^"]+)"/.exec(readFileSync(new URL("../src/version.ts", import.meta.url), "utf8"))[1];
if (version !== pkg.version) {
  throw new Error(`src/version.ts (${version}) does not match package.json (${pkg.version})`);
}
const plugin = readFileSync(new URL("../wordpress-plugin/html-to-elementor/html-to-elementor.php", import.meta.url), "utf8");
const pluginVersion = /Version:\s*([\d.]+)/.exec(plugin)[1];
if (pluginVersion !== pkg.version) {
  throw new Error(`plugin header Version (${pluginVersion}) does not match package.json (${pkg.version})`);
}

const banner = `/*! html-to-elementor ${pkg.version} | MIT | ${pkg.homepage} */`;
const node = { bundle: true, platform: "node", target: "node18", format: "esm", banner: { js: banner }, legalComments: "none" };

await Promise.all([
  // Agent skill: one self-contained file, needs only Node 18+.
  build({ ...node, entryPoints: ["src/cli.ts"], outfile: "skill/html-to-elementor/scripts/convert.mjs" }),
  // WordPress plugin: used by `wp html-to-elementor import page.html` when Node is available.
  build({ ...node, entryPoints: ["src/cli.ts"], outfile: "wordpress-plugin/html-to-elementor/bin/convert.mjs" }),
  // WordPress plugin admin screen: converts in the browser, no Node needed on the server.
  build({
    entryPoints: ["src/browser.ts"], outfile: "wordpress-plugin/html-to-elementor/assets/converter.js",
    bundle: true, platform: "browser", target: "es2019", format: "iife", globalName: "HtmlToElementor",
    minify: true, banner: { js: banner }, legalComments: "none",
  }),
]);
console.log(`bundled ${pkg.version}`);
