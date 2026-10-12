#!/usr/bin/env node
/** MCP server (stdio) exposing the converter to Claude, Cursor, Codex and other MCP clients. */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { convert, toTemplate } from "./converter.js";
import { convertFile, writeOutputs } from "./node.js";
import { VERSION } from "./version.js";

const here = dirname(fileURLToPath(import.meta.url));

const server = new McpServer({ name: "html-to-elementor", version: VERSION });

const common = {
  base_url: z.string().optional().describe("Prefix for relative image and link URLs"),
  keep_css: z.boolean().optional().describe("Also embed the original CSS in an HTML widget and keep class names"),
  canvas: z.boolean().optional().describe("Use the Elementor Canvas page template (default true)"),
};

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

server.registerTool(
  "convert_html",
  {
    description:
      "Convert an HTML page (with its <style> CSS) into an Elementor template made of native containers " +
      "and widgets (heading, text-editor, button, image, icon-list, icon, video, divider; anything else " +
      "becomes an HTML widget). Returns {template, report}. Save template as .json and import it in " +
      "Elementor > Templates > Import, or set elements_only to get the raw _elementor_data array.",
    inputSchema: {
      html: z.string().min(1).max(5_000_000).describe("The full HTML document or a fragment"),
      title: z.string().optional(),
      elements_only: z.boolean().optional(),
      ...common,
    },
  },
  async ({ html, title, elements_only, base_url, keep_css, canvas }) => {
    const name = title ?? "Converted page";
    const result = convert(html, { title: name, baseUrl: base_url, keepCss: keep_css, canvas });
    return text({ template: elements_only ? result.elements : toTemplate(result, name), report: result.report });
  },
);

server.registerTool(
  "convert_html_file",
  {
    description:
      "Convert an .html file on disk and write <slug>.json and <slug>.zip next to it (or into out_dir). " +
      "Local stylesheets linked from the page are read too. Returns the written paths and a report.",
    inputSchema: {
      path: z.string().min(1),
      out_dir: z.string().optional(),
      title: z.string().optional(),
      ...common,
    },
  },
  async ({ path, out_dir, title, base_url, keep_css, canvas }) => {
    const p = resolve(path);
    if (!existsSync(p) || !statSync(p).isFile()) return { ...text({ error: `file not found: ${p}` }), isError: true };
    const result = convertFile(p, { title, baseUrl: base_url, keepCss: keep_css, canvas });
    const files = writeOutputs(result, out_dir ? resolve(out_dir) : dirname(p));
    return text({ files, report: result.report });
  },
);

server.registerTool(
  "widget_mapping",
  {
    description: "Describe how HTML elements and CSS map to Elementor widgets and settings, so HTML can be shaped for the cleanest conversion.",
    inputSchema: {},
  },
  async () => ({
    content: [{ type: "text" as const, text: readFileSync(resolve(here, "../docs/MAPPING.md"), "utf8") }],
  }),
);

await server.connect(new StdioServerTransport());
