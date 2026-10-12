/** Package conversion results as Elementor-importable .json and .zip. */
import { strToU8, zipSync } from "fflate";
import type { ElementorTemplate } from "./converter.js";

export function slugify(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "page";
}

export function templateJson(template: ElementorTemplate): string {
  return JSON.stringify(template, null, 2);
}

/**
 * A .zip holding <slug>.json. Elementor › Templates › Import accepts the .json
 * on its own or a .zip of one or more templates.
 */
export function templateZip(template: ElementorTemplate): Uint8Array {
  const name = `${slugify(template.title)}.json`;
  return zipSync({ [name]: strToU8(templateJson(template)) }, { level: 9 });
}
