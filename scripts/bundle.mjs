// Bundles the engine into single self-contained files: the agent skill script, plus a Node CLI
// bundle and a browser bundle in dist/bundle/ for embedding in other tools.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const version = /VERSION = "([^"]+)"/.exec(readFileSync(new URL("../src/version.ts", import.meta.url), "utf8"))[1];
if (version !== pkg.version) {
  throw new Error(`src/version.ts (${version}) does not match package.json (${pkg.version})`);
}

const banner = `/*! html-to-elementor ${pkg.version} | MIT | ${pkg.homepage} */`;
const node = { bundle: true, platform: "node", target: "node18", format: "esm", banner: { js: banner }, legalComments: "none" };

await Promise.all([
  // Agent skill: one self-contained file, needs only Node 18+.
  build({ ...node, entryPoints: ["src/cli.ts"], outfile: "skill/html-to-elementor/scripts/convert.mjs" }),
  // The CLI as one file with no dependencies, for embedding.
  build({ ...node, entryPoints: ["src/cli.ts"], outfile: "dist/bundle/html-to-elementor.cli.mjs" }),
  // Browser build: window.HtmlToElementor (convert, toTemplate, templateZip, ...).
  build({
    entryPoints: ["src/browser.ts"], outfile: "dist/bundle/html-to-elementor.browser.js",
    bundle: true, platform: "browser", target: "es2019", format: "iife", globalName: "HtmlToElementor",
    minify: true, banner: { js: banner }, legalComments: "none",
  }),
]);
console.log(`bundled ${pkg.version}`);
