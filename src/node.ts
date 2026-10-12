/** Node-only helpers: read an .html file (plus its local stylesheets) and write outputs. */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { convert, htmlTitle, toTemplate, type ConversionResult, type ConvertOptions } from "./converter.js";
import { slugify, templateJson, templateZip } from "./output.js";

export interface FileConversion extends ConversionResult {
  title: string;
}

/** Convert an .html file. Local <link rel="stylesheet"> files and `cssFiles` are applied too. */
export function convertFile(path: string, options: ConvertOptions = {}, cssFiles: string[] = []): FileConversion {
  const html = readFileSync(path, "utf8");
  const extra: string[] = cssFiles.map((f) => readFileSync(f, "utf8"));
  const supplied: string[] = [];
  for (const m of html.matchAll(/<link[^>]+href=["']([^"']+\.css)(?:\?[^"']*)?["'][^>]*>/gi)) {
    const href = m[1]!;
    if (/^(https?:)?\/\//i.test(href)) continue;
    const local = resolve(dirname(path), href);
    if (existsSync(local) && statSync(local).isFile()) {
      extra.push(readFileSync(local, "utf8"));
      supplied.push(href);
    }
  }
  const title = options.title ?? htmlTitle(html) ?? "Converted page";
  const result = convert(html, {
    ...options,
    title,
    extraCss: [options.extraCss ?? "", ...extra].filter(Boolean).join("\n"),
    suppliedStylesheets: [...(options.suppliedStylesheets ?? []), ...supplied],
  });
  return { ...result, title };
}

/** Write <slug>.json and (unless zip=false) <slug>.zip into outDir. Returns the paths. */
export function writeOutputs(
  result: FileConversion,
  outDir: string,
  { type = "page", zip = true }: { type?: "page" | "section"; zip?: boolean } = {},
): { json: string; zip?: string } {
  mkdirSync(outDir, { recursive: true });
  const template = toTemplate(result, result.title, type);
  const slug = slugify(result.title);
  const json = join(outDir, `${slug}.json`);
  writeFileSync(json, templateJson(template), "utf8");
  if (!zip) return { json };
  const zipPath = join(outDir, `${slug}.zip`);
  writeFileSync(zipPath, templateZip(template));
  return { json, zip: zipPath };
}
