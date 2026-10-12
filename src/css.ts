/**
 * A small CSS engine: parse stylesheets, match selectors, compute styles.
 *
 * Styles are computed at three viewport widths that line up with Elementor's
 * default breakpoints, so media queries (desktop-first or mobile-first) turn
 * into Elementor's desktop / _tablet / _mobile settings.
 */
import type { ElementNode } from "./dom.js";

export const VIEWPORTS = { desktop: 1366, tablet: 900, mobile: 390 } as const;
export type Viewport = keyof typeof VIEWPORTS;
export const VIEWPORT_NAMES = Object.keys(VIEWPORTS) as Viewport[];

export type Style = Record<string, string>;

const INHERITED = new Set([
  "color", "font-family", "font-size", "font-weight", "font-style",
  "line-height", "letter-spacing", "text-align", "text-transform",
]);

// ---------------------------------------------------------------- selectors
interface Compound {
  tag: string | null;
  ids: string[];
  classes: string[];
  attrs: Array<[string, string | undefined, string | undefined]>;
  pseudos: string[];
  hover: boolean;
  root: boolean;
}

type Combinator = " " | ">" | "+" | "~";

export interface Selector {
  compounds: Compound[];
  combinators: Combinator[]; // combinators[i] sits between compounds[i] and compounds[i+1]
  specificity: [number, number, number];
  hover: boolean;
}

const SUPPORTED_PSEUDO = new Set(["first-child", "last-child", "only-child", "hover", "root", "link"]);
const TOKEN =
  /\s*([>+~])\s*|(\s+)|(\*)|(#[\w-]+)|(\.[\w-]+)|(\[[^\]]*\])|(::?[\w-]+(?:\([^)]*\))?)|([\w-]+)/y;

const newCompound = (): Compound => ({
  tag: null, ids: [], classes: [], attrs: [], pseudos: [], hover: false, root: false,
});

export function parseSelector(text: string): Selector | null {
  text = text.trim();
  if (!text) return null;
  const compounds: Compound[] = [];
  const combinators: Combinator[] = [];
  let cur = newCompound();
  let started = false;
  let a = 0, b = 0, c = 0;
  TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < text.length) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(text);
    if (!m || m.index !== pos || TOKEN.lastIndex === pos) return null;
    pos = TOKEN.lastIndex;
    const [, comb, ws, star, hid, cls, attr, pseudo, tag] = m;
    if (comb || ws) {
      if (!started) continue;
      if (ws && pos < text.length && ">+~".includes(text[pos]!)) continue;
      compounds.push(cur);
      combinators.push((comb as Combinator) || " ");
      cur = newCompound();
      started = false;
      continue;
    }
    started = true;
    if (star) continue;
    if (hid) { cur.ids.push(hid.slice(1)); a++; }
    else if (cls) { cur.classes.push(cls.slice(1)); b++; }
    else if (attr) {
      const am = /^\[\s*([\w-]+)\s*(?:([~|^$*]?=)\s*['"]?([^'"\]]*)['"]?)?\s*\]$/.exec(attr);
      if (!am) return null;
      cur.attrs.push([am[1]!, am[2], am[3]]);
      b++;
    } else if (pseudo) {
      if (pseudo.startsWith("::")) return null; // ::before / ::after are not elements
      const name = pseudo.slice(1).toLowerCase();
      if (!SUPPORTED_PSEUDO.has(name)) return null; // unsupported -> skip the rule
      b++;
      if (name === "hover") cur.hover = true;
      else if (name === "root") cur.root = true;
      else if (name !== "link") cur.pseudos.push(name);
    } else if (tag) {
      cur.tag = tag.toLowerCase();
      c++;
    }
  }
  compounds.push(cur);
  // ".card:hover .title" describes a state we cannot express in Elementor
  if (compounds.slice(0, -1).some((x) => x.hover)) return null;
  return { compounds, combinators, specificity: [a, b, c], hover: cur.hover };
}

function matchCompound(comp: Compound, el: ElementNode): boolean {
  if (comp.root && el.tag !== "html") return false;
  if (comp.tag && comp.tag !== el.tag) return false;
  if (comp.ids.length && !comp.ids.includes(el.id)) return false;
  if (comp.classes.length) {
    const have = el.classes;
    if (comp.classes.some((k) => !have.includes(k))) return false;
  }
  for (const [name, op, val = ""] of comp.attrs) {
    const v = el.attrs[name];
    if (v === undefined) return false;
    if (op === "=" && v !== val) return false;
    if (op === "~=" && !v.split(/\s+/).includes(val)) return false;
    if (op === "^=" && !v.startsWith(val)) return false;
    if (op === "$=" && !v.endsWith(val)) return false;
    if (op === "*=" && !v.includes(val)) return false;
  }
  if (comp.pseudos.length) {
    const sibs = el.parent ? el.parent.elements() : [el];
    for (const p of comp.pseudos) {
      if (p === "first-child" && sibs[0] !== el) return false;
      if (p === "last-child" && sibs[sibs.length - 1] !== el) return false;
      if (p === "only-child" && sibs.length !== 1) return false;
    }
  }
  return true;
}

function matchFrom(sel: Selector, idx: number, el: ElementNode): boolean {
  if (!matchCompound(sel.compounds[idx]!, el)) return false;
  if (idx === 0) return true;
  const comb = sel.combinators[idx - 1]!;
  const isEl = (p: ElementNode | null): p is ElementNode => p !== null && p.tag !== "#document";
  if (comb === ">") return isEl(el.parent) && matchFrom(sel, idx - 1, el.parent);
  if (comb === " ") {
    for (let p = el.parent; isEl(p); p = p.parent) if (matchFrom(sel, idx - 1, p)) return true;
    return false;
  }
  const sibs = el.parent ? el.parent.elements() : [];
  const i = sibs.indexOf(el);
  if (comb === "+") return i > 0 && matchFrom(sel, idx - 1, sibs[i - 1]!);
  return sibs.slice(0, Math.max(i, 0)).some((s) => matchFrom(sel, idx - 1, s));
}

export function matches(sel: Selector, el: ElementNode): boolean {
  return matchFrom(sel, sel.compounds.length - 1, el);
}

// -------------------------------------------------------------- stylesheet
export type Declaration = [prop: string, value: string, important: boolean];

interface Rule {
  selector: Selector;
  decls: Declaration[];
  order: number;
  media: string | null;
}

/** Split on sep, ignoring separators inside parentheses or quotes. */
export function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, buf = "", quote: string | null = null;
  for (const ch of text) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === sep && depth === 0) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

export function parseDeclarations(text: string): Declaration[] {
  const decls: Declaration[] = [];
  for (const chunk of splitTop(text, ";")) {
    const i = chunk.indexOf(":");
    if (i < 0) continue;
    let prop = chunk.slice(0, i).trim();
    let value = chunk.slice(i + 1).trim();
    if (!prop.startsWith("--")) prop = prop.toLowerCase();
    let important = false;
    if (/!important$/i.test(value)) {
      value = value.replace(/!important$/i, "").trim();
      important = true;
    }
    if (prop && value) decls.push([prop, value, important]);
  }
  return decls;
}

function* blocks(text: string): Generator<[string, string]> {
  let i = 0;
  const n = text.length;
  while (i < n) {
    const brace = text.indexOf("{", i);
    const semi = text.indexOf(";", i);
    if (semi !== -1 && (brace === -1 || semi < brace)) { // @import / @charset
      i = semi + 1;
      continue;
    }
    if (brace === -1) return;
    const prelude = text.slice(i, brace).trim();
    let depth = 1, j = brace + 1;
    while (j < n && depth) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") depth--;
      j++;
    }
    yield [prelude, text.slice(brace + 1, j - 1)];
    i = j;
  }
}

export class Stylesheet {
  rules: Rule[] = [];
  private order = 0;

  add(css: string, media: string | null = null): void {
    css = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [prelude, body] of blocks(css)) {
      const low = prelude.toLowerCase();
      if (low.startsWith("@media")) {
        const cond = prelude.slice(6).trim();
        this.add(body, media ? `(${media}) and (${cond})` : cond);
      } else if (low.startsWith("@supports") || low.startsWith("@layer") || low.startsWith("@container")) {
        this.add(body, media);
      } else if (low.startsWith("@")) {
        continue; // @font-face, @keyframes, ...
      } else {
        const decls = parseDeclarations(body);
        for (const selText of splitTop(prelude, ",")) {
          const selector = parseSelector(selText);
          if (selector) this.rules.push({ selector, decls, order: this.order, media });
        }
        this.order++;
      }
    }
  }
}

export function mediaApplies(cond: string | null, width: number): boolean {
  if (!cond) return true;
  const c = cond.toLowerCase();
  if (/\bprint\b|\bspeech\b|prefers-|orientation|hover\s*:|pointer|\bnot\b/.test(c)) return false;
  for (const m of c.matchAll(/(min|max)-width\s*:\s*([\d.]+)\s*(px|em|rem)?/g)) {
    const px = parseFloat(m[2]!) * (m[3] === "em" || m[3] === "rem" ? 16 : 1);
    if (m[1] === "min" && width < px) return false;
    if (m[1] === "max" && width > px) return false;
  }
  return true;
}

// ----------------------------------------------------------- computed style
const VAR = /var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g;

export function resolveVars(value: string, custom: Style, depth = 0): string {
  if (!value.includes("var(") || depth > 8) return value;
  return value.replace(VAR, (_m, name: string, fallback?: string) => {
    if (name in custom) return resolveVars(custom[name]!, custom, depth + 1);
    return fallback ? resolveVars(fallback.trim(), custom, depth + 1) : "";
  });
}

type Weighted = { key: [number, [number, number, number, number], number]; prop: string; value: string };

function cmp(x: Weighted, y: Weighted): number {
  if (x.key[0] !== y.key[0]) return x.key[0] - y.key[0];
  for (let i = 0; i < 4; i++) if (x.key[1][i] !== y.key[1][i]) return x.key[1][i]! - y.key[1][i]!;
  return x.key[2] - y.key[2];
}

/** Computes styles for elements, cached per (element, viewport). */
export class StyleEngine {
  private cache = new Map<ElementNode, Partial<Record<Viewport, Style>>>();

  constructor(private sheet: Stylesheet) {}

  private matching(el: ElementNode, width: number, hover: boolean): Weighted[] {
    const found: Weighted[] = [];
    for (const r of this.sheet.rules) {
      if (r.selector.hover !== hover || !mediaApplies(r.media, width)) continue;
      if (!matches(r.selector, el)) continue;
      const [a, b, c] = r.selector.specificity;
      for (const [prop, value, imp] of r.decls) {
        found.push({ key: [imp ? 1 : 0, [0, a, b, c], r.order], prop, value });
      }
    }
    return found;
  }

  computed(el: ElementNode, vp: Viewport = "desktop"): Style {
    const cached = this.cache.get(el)?.[vp];
    if (cached) return cached;
    const style: Style = {};
    const parent = el.parent;
    if (parent && parent.tag !== "#document") {
      for (const [k, v] of Object.entries(this.computed(parent, vp))) {
        if (INHERITED.has(k) || k.startsWith("--")) style[k] = v;
      }
    }
    const decls = this.matching(el, VIEWPORTS[vp], false);
    for (const [prop, value, imp] of parseDeclarations(el.attrs["style"] ?? "")) {
      decls.push({ key: [imp ? 1 : 0, [1, 0, 0, 0], Number.MAX_SAFE_INTEGER], prop, value });
    }
    decls.sort(cmp);
    for (const d of decls) if (d.prop.startsWith("--")) style[d.prop] = d.value;
    const custom = Object.fromEntries(Object.entries(style).filter(([k]) => k.startsWith("--")));
    for (const d of decls) {
      if (d.prop.startsWith("--")) continue;
      for (const [p, v] of expand(d.prop, resolveVars(d.value, custom))) style[p] = v;
    }
    const entry = this.cache.get(el) ?? {};
    entry[vp] = style;
    this.cache.set(el, entry);
    return style;
  }

  hover(el: ElementNode): Style {
    const base = this.computed(el, "desktop");
    const custom = Object.fromEntries(Object.entries(base).filter(([k]) => k.startsWith("--")));
    const out: Style = {};
    for (const d of this.matching(el, VIEWPORTS.desktop, true).sort(cmp)) {
      for (const [p, v] of expand(d.prop, resolveVars(d.value, custom))) out[p] = v;
    }
    return out;
  }
}

// ------------------------------------------------------- shorthand expansion
export function splitValues(value: string): string[] {
  return splitTop(value.trim(), " ").map((v) => v.trim()).filter(Boolean);
}

const SIDES = ["top", "right", "bottom", "left"] as const;

function fourSides(v: string[]): string[] | null {
  if (v.length === 1) return [v[0]!, v[0]!, v[0]!, v[0]!];
  if (v.length === 2) return [v[0]!, v[1]!, v[0]!, v[1]!];
  if (v.length === 3) return [v[0]!, v[1]!, v[2]!, v[1]!];
  if (v.length === 4) return v;
  return null;
}

function box(prefix: string, value: string, suffix = ""): Array<[string, string]> {
  const v = fourSides(splitValues(value));
  return v ? SIDES.map((s, i) => [`${prefix}-${s}${suffix}`, v[i]!]) : [];
}

export const COLOR_RE =
  /(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:transparent|white|black|red|blue|green|gray|grey|orange|yellow|purple|pink|navy|teal)\b)/;
const BORDER_STYLES = new Set(["solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset", "none"]);

export function expand(prop: string, value: string): Array<[string, string]> {
  switch (prop) {
    case "padding":
    case "margin":
      return box(prop, value);
    case "border-radius": {
      const v = fourSides(splitValues(value.split("/")[0]!));
      const corners = ["top-left", "top-right", "bottom-right", "bottom-left"];
      return v ? corners.map((c, i) => [`border-${c}-radius`, v[i]!]) : [];
    }
    case "gap":
    case "grid-gap": {
      const v = splitValues(value);
      return v.length ? [["row-gap", v[0]!], ["column-gap", v[1] ?? v[0]!]] : [];
    }
    case "flex-flow":
      return splitValues(value).map((t) => [t.includes("wrap") ? "flex-wrap" : "flex-direction", t]);
    case "place-items": {
      const v = splitValues(value);
      return v.length ? [["align-items", v[0]!], ["justify-items", v[v.length - 1]!]] : [];
    }
    case "place-content": {
      const v = splitValues(value);
      return v.length ? [["align-content", v[0]!], ["justify-content", v[v.length - 1]!]] : [];
    }
    case "border":
    case "border-top":
    case "border-right":
    case "border-bottom":
    case "border-left": {
      const sides = prop === "border" ? [...SIDES] : [prop.split("-")[1]!];
      if (value.trim() === "none" || value.trim() === "0") return sides.map((s) => [`border-${s}-style`, "none"]);
      let width: string | null = null, style: string | null = null, color: string | null = null;
      for (const tok of splitValues(value)) {
        if (BORDER_STYLES.has(tok)) style = tok;
        else if (new RegExp(`^${COLOR_RE.source}$`).test(tok)) color = tok;
        else if (/^[\d.]/.test(tok) || ["thin", "medium", "thick"].includes(tok)) width = tok;
      }
      const out: Array<[string, string]> = [];
      for (const s of sides) {
        out.push([`border-${s}-width`, width ?? "medium"], [`border-${s}-style`, style ?? "none"]);
        if (color) out.push([`border-${s}-color`, color]);
      }
      return out;
    }
    case "border-width":
      return box("border", value, "-width");
    case "border-color":
      return box("border", value, "-color");
    case "border-style":
      return box("border", value, "-style");
    case "background": {
      if (value.includes("gradient(")) return [["background-image", value]];
      const out: Array<[string, string]> = [];
      const url = /url\([^)]*\)/.exec(value);
      if (url) out.push(["background-image", url[0]]);
      const rest = url ? value.replace(url[0], "") : value;
      const colors = rest.match(new RegExp(COLOR_RE.source, "g"));
      if (colors?.length) out.push(["background-color", colors[colors.length - 1]!]);
      for (const kw of ["cover", "contain"]) if (rest.includes(kw)) out.push(["background-size", kw]);
      if (rest.includes("no-repeat")) out.push(["background-repeat", "no-repeat"]);
      if (rest.includes("center")) out.push(["background-position", "center center"]);
      return out;
    }
    case "inset":
    case "font":
      return []; // rarely used in modern HTML; skipped
    default:
      return [[prop, value]];
  }
}
