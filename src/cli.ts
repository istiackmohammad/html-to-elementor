#!/usr/bin/env node
/** html-to-elementor page.html -o out/ [options] */
import { parseArgs } from "node:util";
import { toTemplate } from "./converter.js";
import { convertFile, writeOutputs } from "./node.js";
import { VERSION } from "./version.js";

const HELP = `Usage: html-to-elementor <page.html> [options]

Convert an HTML page into an Elementor template built from native widgets.
Writes <slug>.json and <slug>.zip (Elementor > Templates > Import) and prints a report.

Options:
  -o, --out <dir>       output folder (default: current folder)
      --title <text>    template title (default: the page <title>)
      --base-url <url>  prefix for relative image/link URLs
      --css <file>      extra stylesheet to apply (repeatable)
      --keep-css        also embed the original CSS in an HTML widget and keep class names
      --no-canvas       keep the theme header/footer (default page template: Elementor Canvas)
      --type <type>     page | section (default: page)
      --no-zip          write only the .json
      --stdout          print the template JSON and report to stdout instead of writing files
      --elements-only   print only the elements array (the _elementor_data value) to stdout
      --seed <n>        seed for element ids (reproducible output)
  -h, --help            show this help
  -v, --version         show the version`;

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o", default: "." },
      title: { type: "string" },
      "base-url": { type: "string", default: "" },
      css: { type: "string", multiple: true, default: [] },
      "keep-css": { type: "boolean", default: false },
      "no-canvas": { type: "boolean", default: false },
      type: { type: "string", default: "page" },
      "no-zip": { type: "boolean", default: false },
      stdout: { type: "boolean", default: false },
      "elements-only": { type: "boolean", default: false },
      seed: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });
  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (values.help || positionals.length !== 1) {
    process.stdout.write(HELP + "\n");
    return values.help ? 0 : 2;
  }
  if (values.type !== "page" && values.type !== "section") {
    process.stderr.write("--type must be page or section\n");
    return 2;
  }
  const seed = values.seed !== undefined ? Number(values.seed) : undefined;
  const result = convertFile(positionals[0]!, {
    title: values.title,
    baseUrl: values["base-url"],
    keepCss: values["keep-css"],
    canvas: !values["no-canvas"],
    seed: Number.isFinite(seed) ? seed : undefined,
  }, values.css);

  if (values.stdout) {
    const template = toTemplate(result, result.title, values.type);
    process.stdout.write(JSON.stringify({ template, report: result.report }) + "\n");
    return 0;
  }
  if (values["elements-only"]) {
    process.stdout.write(JSON.stringify(result.elements) + "\n");
    return 0;
  }
  const files = writeOutputs(result, values.out, { type: values.type, zip: !values["no-zip"] });
  process.stdout.write(JSON.stringify({ files, report: result.report }, null, 2) + "\n");
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  process.stderr.write(`html-to-elementor: ${(err as Error).message}\n`);
  process.exitCode = 1;
}
