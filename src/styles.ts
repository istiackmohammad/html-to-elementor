/**
 * Map computed CSS to Elementor control settings.
 *
 * Each function takes a computed style (see css.ts) and returns Elementor
 * settings for one breakpoint. The converter calls them per viewport and
 * suffixes tablet/mobile differences with _tablet / _mobile.
 */
import { splitTop, type Style } from "./css.js";

export type Settings = Record<string, unknown>;
export interface SizeValue { unit: string; size: number; sizes: [] }
export interface Dimensions { unit: string; top: string; right: string; bottom: string; left: string; isLinked: boolean }

const NUM = /^(-?[\d.]+)(px|em|rem|%|vh|vw|pt)?$/;

export function clean(n: number): number {
  return Number.isInteger(n) ? n : Math.round(n * 1000) / 1000;
}

/** "24px" -> { unit: "px", size: 24, sizes: [] } */
export function size(value: string | undefined | null, unitless = "px"): SizeValue | null {
  if (!value) return null;
  let v = value.trim().toLowerCase();
  const clamp = /^clamp\(([^,]+),([^,]+),([^)]+)\)$/.exec(v);
  if (clamp) v = clamp[3]!.trim(); // clamp(min, preferred, max): the max is the desktop value
  const m = NUM.exec(v);
  if (!m) return null;
  let num = parseFloat(m[1]!);
  let unit = m[2] ?? unitless;
  if (unit === "pt") { num = (num * 4) / 3; unit = "px"; }
  return { unit, size: clean(num), sizes: [] };
}

const isZero = (s: string) => s === "" || s === "0";

export function dims(style: Style, prefix: string, suffix = ""): Dimensions | null {
  const sides = ["top", "right", "bottom", "left"] as const;
  const raw = sides.map((s) => style[`${prefix}-${s}${suffix}`]);
  if (raw.every((r) => r === undefined)) return null;
  const parsed = raw.map((r): [string | null, string] => {
    if (r === undefined || r === "auto") return [null, ""];
    const s = size(r);
    return s ? [s.unit, String(s.size)] : [null, ""];
  });
  const units = parsed.filter(([u, n]) => u && !isZero(n)).map(([u]) => u!);
  const unit = units.length
    ? units.sort((a, b) => units.filter((x) => x === b).length - units.filter((x) => x === a).length)[0]!
    : "px";
  const vals = parsed.map(([u, n]) => {
    if (u === null || u === unit || isZero(n)) return n;
    if (["px", "rem", "em"].includes(u) && ["px", "rem", "em"].includes(unit)) {
      const px = parseFloat(n) * (u === "px" ? 1 : 16);
      return String(clean(unit === "px" ? px : px / 16));
    }
    return n;
  });
  return {
    unit, top: vals[0]!, right: vals[1]!, bottom: vals[2]!, left: vals[3]!,
    isLinked: new Set(vals).size === 1,
  };
}

const nonZero = (d: Dimensions | null): d is Dimensions =>
  !!d && [d.top, d.right, d.bottom, d.left].some((v) => !isZero(v));

export function radius(style: Style): Dimensions | null {
  const corners = ["top-left", "top-right", "bottom-right", "bottom-left"];
  const fake: Style = {};
  ["top", "right", "bottom", "left"].forEach((s, i) => {
    const v = style[`border-${corners[i]}-radius`];
    if (v !== undefined) fake[`r-${s}`] = v;
  });
  return dims(fake, "r");
}

export function color(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  return ["inherit", "initial", "unset", "currentcolor"].includes(v.toLowerCase()) ? null : v;
}

const GENERIC_FONTS = new Set(["inherit", "sans-serif", "serif", "monospace", "system-ui",
  "-apple-system", "blinkmacsystemfont", "ui-sans-serif", "cursive"]);

export function fontFamily(value: string | undefined): string | null {
  if (!value) return null;
  const first = value.split(",")[0]!.trim().replace(/^['"]|['"]$/g, "");
  return GENERIC_FONTS.has(first.toLowerCase()) ? null : first;
}

export function typography(style: Style, prefix = "typography"): Settings {
  const out: Settings = {};
  const fam = fontFamily(style["font-family"]);
  const fs = size(style["font-size"]);
  const fw = style["font-weight"];
  const lh = size(style["line-height"], "em");
  const ls = size(style["letter-spacing"]);
  const tt = style["text-transform"];
  if (fam) out[`${prefix}_font_family`] = fam;
  if (fs) out[`${prefix}_font_size`] = fs;
  if (fw) out[`${prefix}_font_weight`] = ({ bold: "700", normal: "400" } as Record<string, string>)[fw] ?? fw;
  if (lh) out[`${prefix}_line_height`] = lh;
  if (ls) out[`${prefix}_letter_spacing`] = ls;
  if (tt && tt !== "none") out[`${prefix}_text_transform`] = tt;
  if (style["font-style"] === "italic") out[`${prefix}_font_style`] = "italic";
  if (Object.keys(out).length) out[`${prefix}_typography`] = "custom";
  return out;
}

export function textAlign(style: Style): string | null {
  const map: Record<string, string> = { start: "left", end: "right", left: "left", right: "right", center: "center", justify: "justify" };
  return map[style["text-align"] ?? ""] ?? null;
}

const TRANSPARENT = /^(transparent|none|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/i;

export function isVisibleColor(c: string | null): c is string {
  return !!c && !TRANSPARENT.test(c) && !/,\s*0\s*\)$/.test(c);
}

const GRADIENT_ANGLES: Record<string, number> = {
  "to top": 0, "to right": 90, "to bottom": 180, "to left": 270,
  "to bottom right": 135, "to right bottom": 135, "to top right": 45,
  "to right top": 45, "to bottom left": 225, "to left bottom": 225, "to top left": 315, "to left top": 315,
};
const STOP = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)\s*([\d.]+%)?/;

export function background(style: Style, prefix = "background"): Settings {
  const img = style["background-image"] ?? "";
  const bg = color(style["background-color"]);
  const grad = /linear-gradient\(([\s\S]*)\)/.exec(img);
  if (grad) {
    const parts = splitTop(grad[1]!, ",").map((p) => p.trim());
    let angle = 180;
    if (parts.length && /^-?[\d.]+deg$/.test(parts[0]!)) angle = parseFloat(parts.shift()!);
    else if (parts.length && parts[0]!.startsWith("to ")) angle = GRADIENT_ANGLES[parts.shift()!] ?? 180;
    const stops = parts.map((p) => STOP.exec(p)).filter((m): m is RegExpExecArray => !!m);
    if (stops.length >= 2) {
      const first = stops[0]!, last = stops[stops.length - 1]!;
      return {
        [`${prefix}_background`]: "gradient",
        [`${prefix}_color`]: first[1],
        [`${prefix}_color_stop`]: { unit: "%", size: first[2] ? clean(parseFloat(first[2])) : 0, sizes: [] },
        [`${prefix}_color_b`]: last[1],
        [`${prefix}_color_b_stop`]: { unit: "%", size: last[2] ? clean(parseFloat(last[2])) : 100, sizes: [] },
        [`${prefix}_gradient_type`]: "linear",
        [`${prefix}_gradient_angle`]: { unit: "deg", size: Math.round(angle), sizes: [] },
      };
    }
  }
  const url = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(img);
  if (url) {
    const bsize = style["background-size"];
    const rep = style["background-repeat"];
    const out: Settings = {
      [`${prefix}_background`]: "classic",
      [`${prefix}_image`]: { url: url[1], id: "", size: "", source: "url" },
      [`${prefix}_position`]: bgPosition(style["background-position"]),
      [`${prefix}_size`]: ["cover", "contain", "auto"].includes(bsize ?? "") ? bsize : "cover",
      [`${prefix}_repeat`]: ["no-repeat", "repeat", "repeat-x", "repeat-y"].includes(rep ?? "") ? rep : "no-repeat",
    };
    if (bg) out[`${prefix}_color`] = bg;
    return out;
  }
  if (isVisibleColor(bg)) return { [`${prefix}_background`]: "classic", [`${prefix}_color`]: bg };
  return {};
}

function bgPosition(pos: string | undefined): string {
  const valid = new Set(["center center", "center left", "center right", "top center", "top left",
    "top right", "bottom center", "bottom left", "bottom right"]);
  if (!pos) return "center center";
  const words = pos.trim().toLowerCase().split(/\s+/);
  let p = words.join(" ");
  if (words.length === 1) {
    p = ({ center: "center center", top: "top center", bottom: "bottom center", left: "center left", right: "center right" } as Record<string, string>)[words[0]!] ?? "center center";
  } else if (words.length === 2 && (words[0] === "left" || words[0] === "right")) {
    p = `${words[1]} ${words[0]}`;
  }
  return valid.has(p) ? p : "center center";
}

export function border(style: Style, prefix = "border"): Settings {
  const sides = ["top", "right", "bottom", "left"];
  const styles = sides.map((s) => style[`border-${s}-style`]);
  const active = styles.filter((s) => s && s !== "none");
  if (!active.length) return {};
  const out: Settings = { [`${prefix}_border`]: active[0] };
  const widths: Style = {};
  sides.forEach((s, i) => {
    widths[`w-${s}`] = styles[i] && styles[i] !== "none" ? (style[`border-${s}-width`] ?? "1px") : "0";
  });
  const w = dims(widths, "w");
  if (w) out[`${prefix}_width`] = w;
  for (const s of sides) {
    const c = color(style[`border-${s}-color`]);
    if (c) { out[`${prefix}_color`] = c; break; }
  }
  return out;
}

export function boxShadow(value: string | undefined, prefix = "box_shadow"): Settings {
  if (!value || value.trim() === "none") return {};
  const first = splitTop(value, ",")[0]!.trim();
  if (first.startsWith("inset")) return {};
  const col = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))/.exec(first);
  const nums = [...first.replace(/(rgba?|hsla?)\([^)]*\)|#[0-9a-fA-F]+/g, "").matchAll(/(-?[\d.]+)/g)]
    .map((m) => clean(parseFloat(m[1]!)));
  const [h = 0, v = 0, blur = 0, spread = 0] = nums;
  return {
    [`${prefix}_box_shadow_type`]: "yes",
    [`${prefix}_box_shadow`]: { horizontal: h, vertical: v, blur, spread, color: col ? col[1] : "rgba(0,0,0,0.5)" },
  };
}

// -------------------------------------------------------- per element type
const FLEX_VALUES: Record<string, string> = {
  "flex-start": "flex-start", start: "flex-start", left: "flex-start", center: "center",
  "flex-end": "flex-end", end: "flex-end", right: "flex-end", "space-between": "space-between",
  "space-around": "space-around", "space-evenly": "space-evenly", stretch: "stretch",
};
const toGrid = (v: string) => (v === "flex-start" ? "start" : v === "flex-end" ? "end" : v);

export function gridTracks(value: string | undefined): number | null {
  if (!value || value === "none") return null;
  const rep = /^repeat\(\s*(\d+)\s*,/.exec(value.trim());
  if (rep) return parseInt(rep[1]!, 10);
  if (value.includes("auto-fit") || value.includes("auto-fill")) return null;
  return splitTop(value.trim(), " ").filter((t) => t.trim()).length || null;
}

export const ZERO_PADDING: Dimensions = { unit: "px", top: "0", right: "0", bottom: "0", left: "0", isLinked: true };

export function zeroGap() {
  return { column: "0", row: "0", isLinked: true, unit: "px", size: 0 };
}

function gap(style: Style) {
  const row = size(style["row-gap"]);
  const col = size(style["column-gap"]);
  if (!row && !col) return zeroGap();
  const c = (col ?? row)!, r = (row ?? col)!;
  return { column: String(c.size), row: String(r.size), isLinked: c.size === r.size, unit: c.unit, size: c.size };
}

export function container(style: Style, isChild: boolean): Settings {
  const s: Settings = {};
  const display = style["display"] ?? "block";
  const flex = display === "flex" || display === "inline-flex";
  if (display === "grid" || display === "inline-grid") {
    const cols = gridTracks(style["grid-template-columns"]);
    s["container_type"] = "grid";
    s["grid_columns_grid"] = { unit: "fr", size: cols ?? 3, sizes: [] };
    const rows = gridTracks(style["grid-template-rows"]);
    if (rows) s["grid_rows_grid"] = { unit: "fr", size: rows, sizes: [] };
    s["grid_gaps"] = gap(style);
    const ai = FLEX_VALUES[style["align-items"] ?? ""];
    if (ai) s["grid_align_items"] = toGrid(ai);
    const ji = FLEX_VALUES[style["justify-items"] ?? ""];
    if (ji) s["grid_justify_items"] = toGrid(ji);
  } else {
    s["flex_direction"] = flex ? (style["flex-direction"] ?? "row") : "column";
    s["flex_gap"] = flex ? gap(style) : zeroGap();
    if (flex) {
      const jc = FLEX_VALUES[style["justify-content"] ?? ""];
      if (jc) s["flex_justify_content"] = jc;
      const ai = FLEX_VALUES[style["align-items"] ?? ""];
      if (ai) s["flex_align_items"] = ai;
      if (style["flex-wrap"] === "wrap" || style["flex-wrap"] === "nowrap") s["flex_wrap"] = style["flex-wrap"];
    } else if (textAlign(style) === "center") {
      s["flex_align_items"] = "center";
    }
  }
  s["padding"] = dims(style, "padding") ?? { ...ZERO_PADDING };
  const margin = dims(style, "margin");
  if (nonZero(margin)) s["margin"] = margin;
  const mh = size(style["min-height"]);
  if (mh) s["min_height"] = mh;
  Object.assign(s, background(style), border(style));
  const r = radius(style);
  if (r) s["border_radius"] = r;
  Object.assign(s, boxShadow(style["box-shadow"]));
  const w = size(style["width"]);
  const mw = size(style["max-width"]);
  const centered = style["margin-left"] === "auto" && style["margin-right"] === "auto";
  if (mw && mw.unit === "px" && (centered || !isChild)) {
    s["content_width"] = "boxed";
    s["boxed_width"] = mw;
  } else {
    s["content_width"] = "full";
    if (isChild) {
      const basis = size(style["flex-basis"]);
      const pick = w && ["%", "px", "vw"].includes(w.unit) ? w : basis && basis.unit === "%" ? basis : mw;
      if (pick) s["width"] = pick;
    }
  }
  if (style["overflow"] === "hidden") s["overflow"] = "hidden";
  return s;
}

/** Advanced-tab settings shared by every widget (margin, padding, background, border). */
export function widgetBox(style: Style): Settings {
  const s: Settings = {};
  const pad = dims(style, "padding");
  if (nonZero(pad)) s["_padding"] = pad;
  const margin = dims(style, "margin");
  if (nonZero(margin)) s["_margin"] = margin;
  Object.assign(s, background(style, "_background"), border(style, "_border"));
  const r = radius(style);
  if (nonZero(r)) s["_border_radius"] = r;
  Object.assign(s, boxShadow(style["box-shadow"], "_box_shadow"));
  const mw = size(style["max-width"]);
  if (mw && (mw.unit === "px" || mw.unit === "%")) {
    s["_element_width"] = "initial";
    s["_element_custom_width"] = mw;
  }
  return s;
}
