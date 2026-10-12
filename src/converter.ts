/** Convert an HTML document into Elementor container + widget JSON. */
import { Stylesheet, StyleEngine, VIEWPORT_NAMES, type Style, type Viewport } from "./css.js";
import { parse, type ElementNode } from "./dom.js";
import * as S from "./styles.js";
import type { Settings } from "./styles.js";
import * as W from "./widgets.js";

const SKIP_TAGS = new Set(["script", "style", "link", "meta", "head", "title", "noscript", "template", "base"]);
const CONTAINER_TAGS = new Set(["div", "section", "header", "footer", "main", "article", "aside", "nav", "figure", "body"]);
const HTML_TAG_OK = new Set(["div", "header", "footer", "main", "article", "section", "aside", "nav", "a"]);
const TEXT_BLOCKS = new Set(["p", "blockquote", "pre", "address", "figcaption", "dl", "ul", "ol"]);
const RAW_HTML_TAGS = new Set(["table", "form", "svg", "canvas", "select", "input", "textarea", "details",
  "iframe", "object", "embed", "audio", "map", "math", "dialog"]);
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const BUTTON_CLASS = /(^|[-_])(btn|button|cta)([-_]|$)/i;
const BLOCKISH = new Set(["block", "flex", "grid", "inline-flex", "inline-grid"]);

/** Settings Elementor accepts per breakpoint. Others are written once (desktop). */
const RESPONSIVE = new RegExp(
  "^(_?padding|_?margin|text_padding|flex_direction|flex_gap|flex_justify_content|flex_align_items|" +
    "flex_wrap|grid_columns_grid|grid_rows_grid|grid_gaps|grid_align_items|grid_justify_items|" +
    "boxed_width|width|min_height|space|height|align|icon_align|space_between|_element_width|" +
    "_element_custom_width|border_radius|_border_radius|image_border_radius|" +
    "(\\w+_)?typography_(font_size|line_height|letter_spacing)|weight|gap)$",
);

export interface ConvertOptions {
  /** Template title. */
  title?: string;
  /** Prefix for relative image and link URLs. */
  baseUrl?: string;
  /** Also embed the original CSS in an HTML widget and keep class names / ids. */
  keepCss?: boolean;
  /** Page template Elementor Canvas (no theme header/footer). Default true. */
  canvas?: boolean;
  /** Seed for element ids, for reproducible output. */
  seed?: number;
  /** Extra CSS applied after the page's own <style> blocks. */
  extraCss?: string;
  /** hrefs of <link> stylesheets already supplied via extraCss (no warning for them). */
  suppliedStylesheets?: string[];
}

export interface ElementorElement {
  id: string;
  elType: "container" | "widget";
  widgetType?: string;
  isInner: boolean;
  settings: Settings | [];
  elements: ElementorElement[];
}

export interface ConversionReport {
  containers: number;
  widgets: Record<string, number>;
  htmlFallbacks: string[];
  warnings: string[];
}

export interface ConversionResult {
  elements: ElementorElement[];
  pageSettings: Settings;
  report: ConversionReport;
}

export interface ElementorTemplate {
  content: ElementorElement[];
  page_settings: Settings;
  version: string;
  title: string;
  type: "page" | "section";
}

interface Ctx {
  inner: boolean;
  align: Partial<Record<Viewport, string | null>>;
}

/** Small deterministic PRNG (mulberry32) so seeded runs give identical ids. */
function makeRng(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Converter {
  readonly report: ConversionReport = { containers: 0, widgets: {}, htmlFallbacks: [], warnings: [] };
  private readonly doc: ElementNode;
  private readonly engine: StyleEngine;
  private readonly rawCss: string[] = [];
  private readonly rng: () => number;
  private readonly usedIds = new Set<string>();
  private readonly opt: Required<Omit<ConvertOptions, "seed">> & { seed?: number };

  constructor(html: string, options: ConvertOptions = {}) {
    this.opt = {
      title: options.title ?? "Converted page",
      baseUrl: options.baseUrl ?? "",
      keepCss: options.keepCss ?? false,
      canvas: options.canvas ?? true,
      extraCss: options.extraCss ?? "",
      suppliedStylesheets: options.suppliedStylesheets ?? [],
      seed: options.seed,
    };
    this.rng = makeRng(options.seed);
    this.doc = parse(html);
    const sheet = new Stylesheet();
    for (const st of this.doc.findAll("style")) {
      this.rawCss.push(st.text());
      sheet.add(st.text());
    }
    if (this.opt.extraCss) {
      this.rawCss.push(this.opt.extraCss);
      sheet.add(this.opt.extraCss);
    }
    this.engine = new StyleEngine(sheet);
    this.warnAboutInputs();
  }

  // --------------------------------------------------------------- utils
  private newId = (): string => {
    let id: string;
    do id = Math.floor(this.rng() * 0xfffffff).toString(16).padStart(7, "0");
    while (this.usedIds.has(id));
    this.usedIds.add(id);
    return id;
  };

  private style(el: ElementNode, vp: Viewport = "desktop"): Style {
    return this.engine.computed(el, vp);
  }

  private hidden(el: ElementNode, vp: Viewport): boolean {
    return this.style(el, vp)["display"] === "none";
  }

  private warnAboutInputs(): void {
    const supplied = new Set(this.opt.suppliedStylesheets);
    const external = this.doc
      .findAll("link")
      .filter((l) => (l.attrs["rel"] ?? "").includes("stylesheet"))
      .map((l) => l.attrs["href"] ?? "")
      .filter((h) => h && !supplied.has(h) && !/fonts\.googleapis|font-?awesome/i.test(h));
    if (external.length) {
      this.report.warnings.push(
        `External stylesheets were not read: ${external.slice(0, 5).join(", ")}. ` +
          "Inline them in a <style> tag or pass them as extra CSS for full styling.",
      );
    }
    if (this.doc.findAll("script").some((s) => /tailwind/i.test(s.attrs["src"] ?? ""))) {
      this.report.warnings.push("Tailwind CDN detected. Utility classes are not interpreted; compile Tailwind to plain CSS first.");
    }
    const rel = this.doc.findAll("img").find((i) => i.attrs["src"] && !/^(https?:|data:|\/\/)/i.test(i.attrs["src"]));
    if (rel && !this.opt.baseUrl) {
      this.report.warnings.push(`Relative image paths found (e.g. ${rel.attrs["src"]}). Upload the images and set a base URL.`);
    }
  }

  // ------------------------------------------------------------ building
  private element(kind: string, built: W.Built, el: ElementNode, ctx: Ctx, isWidget = true): ElementorElement {
    const settings: Settings = { ...built.content };
    const perVp = {} as Record<Viewport, Settings>;
    for (const vp of VIEWPORT_NAMES) {
      perVp[vp] = built.style(this.style(el, vp), { viewport: vp, align: ctx.align[vp] ?? null, engine: this.engine });
    }
    Object.assign(settings, perVp.desktop);
    let prev: Settings = perVp.desktop;
    for (const vp of ["tablet", "mobile"] as const) {
      const next: Settings = { ...prev };
      for (const [k, v] of Object.entries(perVp[vp])) {
        if (!RESPONSIVE.test(k)) continue;
        if (JSON.stringify(prev[k]) !== JSON.stringify(v)) settings[`${k}_${vp}`] = v;
        next[k] = v;
      }
      prev = next;
    }
    for (const vp of ["tablet", "mobile"] as const) {
      if (this.hidden(el, vp) && !this.hidden(el, "desktop")) settings[`hide_${vp}`] = `hidden-${vp}`;
    }
    if (this.opt.keepCss) {
      if (el.classes.length) settings[isWidget ? "_css_classes" : "css_classes"] = el.classes.join(" ");
      if (el.id) settings["_element_id"] = el.id;
    }
    const node: ElementorElement = {
      id: this.newId(),
      elType: isWidget ? "widget" : "container",
      isInner: isWidget ? false : ctx.inner,
      settings: Object.keys(settings).length ? settings : [],
      elements: [],
    };
    if (isWidget) {
      node.widgetType = kind;
      this.report.widgets[kind] = (this.report.widgets[kind] ?? 0) + 1;
    } else {
      this.report.containers++;
    }
    return node;
  }

  private htmlFallback(el: ElementNode, ctx: Ctx): ElementorElement {
    this.report.htmlFallbacks.push(el.tag);
    return this.element("html", W.htmlWidget(el.outerHtml()), el, ctx);
  }

  // ------------------------------------------------------ classification
  private isInlineOnly(el: ElementNode): boolean {
    for (const c of el.elements()) {
      if (SKIP_TAGS.has(c.tag)) continue;
      if (!W.INLINE_TAGS.has(c.tag) || this.isButton(c)) return false;
      if (BLOCKISH.has(this.style(c)["display"] ?? "") || !this.isInlineOnly(c)) return false;
    }
    return true;
  }

  private isButton(el: ElementNode): boolean {
    if (el.tag === "button" || (el.tag === "input" && ["submit", "button"].includes(el.attrs["type"] ?? ""))) return true;
    if (el.tag !== "a" || el.find("img")) return false;
    if (!el.elements().every((c) => W.INLINE_TAGS.has(c.tag))) return false;
    if (el.classes.some((c) => BUTTON_CLASS.test(c)) || el.attrs["role"] === "button") return true;
    const st = this.style(el);
    const hasBg = S.isVisibleColor(S.color(st["background-color"])) || /gradient\(/.test(st["background-image"] ?? "");
    const hasBorder = ["top", "bottom"].some((s) => (st[`border-${s}-style`] ?? "none") !== "none");
    const pad = S.size(st["padding-left"]);
    return (hasBg || hasBorder) && !!pad && pad.size >= 6;
  }

  private isLinkList(el: ElementNode): boolean {
    if (el.tag !== "ul" && el.tag !== "ol") return false;
    const lis = el.elements();
    return lis.length > 0 && lis.every((li) => li.tag === "li" && this.isInlineOnly(li));
  }

  private alignFor(parent: ElementNode, vp: Viewport): string | null {
    const st = this.style(parent, vp);
    const flex = st["display"] === "flex" || st["display"] === "inline-flex";
    if (flex && (st["flex-direction"] ?? "row").startsWith("row")) return null;
    const ai = st["align-items"];
    if (flex && (ai === "center" || ai === "flex-end" || ai === "end")) return ai === "center" ? "center" : "right";
    return S.textAlign(st);
  }

  private hasLooseText(el: ElementNode): boolean {
    return el.children.some((c) => c.kind === "text" && c.data.trim());
  }

  // ----------------------------------------------------------- the walk
  private convertChildren(parent: ElementNode, ctx: Ctx): ElementorElement[] {
    const out: ElementorElement[] = [];
    const pending: string[] = [];
    const align: Ctx["align"] = {};
    for (const vp of VIEWPORT_NAMES) align[vp] = this.alignFor(parent, vp);
    const childCtx: Ctx = { inner: true, align };
    const flush = () => {
      const html = pending.join("").trim();
      if (html && html.replace(/<[^>]+>/g, "").trim()) {
        out.push(this.element("text-editor", W.textEditor(html), parent, childCtx));
      }
      pending.length = 0;
    };
    for (const child of parent.children) {
      if (child.kind === "text") {
        if (child.data.trim()) pending.push(W.collapse(child.outerHtml()) + " ");
        continue;
      }
      if (SKIP_TAGS.has(child.tag) || (this.hidden(child, "desktop") && this.hidden(child, "mobile"))) continue;
      if (child.tag === "p" && !this.isButtonRow(child)) {
        pending.push(child.outerHtml());
        continue;
      }
      flush();
      out.push(...this.convert(child, childCtx));
    }
    flush();
    return out;
  }

  private isButtonRow(el: ElementNode): boolean {
    const kids = el.elements();
    return kids.length > 0 && kids.every((k) => this.isButton(k)) && !this.hasLooseText(el);
  }

  private convert(el: ElementNode, ctx: Ctx): ElementorElement[] {
    const tag = el.tag;
    const base = this.opt.baseUrl;
    if (SKIP_TAGS.has(tag)) return [];
    if (HEADINGS.has(tag)) return [this.element("heading", W.heading(el), el, ctx)];
    if (tag === "img") return [this.element("image", W.image(el, base), el, ctx)];
    if (tag === "picture") {
      const img = el.find("img");
      return img ? [this.element("image", W.image(img, base), img, ctx)] : [];
    }
    if (tag === "hr") return [this.element("divider", W.divider(), el, ctx)];
    if (tag === "video" || (tag === "iframe" && W.isVideoIframe(el))) return [this.element("video", W.video(el, base), el, ctx)];
    if (tag === "i" && W.faIcon(el)) return [this.element("icon", W.icon(el), el, ctx)];
    if (this.isButton(el)) return [this.element("button", W.button(el, base, this.engine), el, ctx)];
    const kids = el.elements();
    if (tag === "a" && kids.length === 1 && kids[0]!.tag === "img" && !el.text().trim()) {
      return [this.element("image", W.image(kids[0]!, base, el), kids[0]!, ctx)];
    }
    if (RAW_HTML_TAGS.has(tag)) return [this.htmlFallback(el, ctx)];
    if (this.isLinkList(el)) {
      const st = this.style(el);
      const inline = (st["display"] === "flex" || st["display"] === "inline-flex") &&
        !(st["flex-direction"] ?? "row").startsWith("column");
      return [this.element("icon-list", W.iconList(el, base, inline, this.newId), el, ctx)];
    }
    if (TEXT_BLOCKS.has(tag)) return [this.element("text-editor", W.textEditor(el.outerHtml()), el, ctx)];
    if (this.isInlineOnly(el)) {
      if (!el.text().trim()) return [];
      if (HTML_TAG_OK.has(tag) && tag !== "div" && tag !== "a") return [this.container(el, ctx)];
      const display = this.style(el)["display"] ?? "";
      const html = W.INLINE_TAGS.has(tag) && !["block", "flex", "inline-block", "grid"].includes(display)
        ? el.outerHtml()
        : `<p>${W.collapse(el.innerHtml())}</p>`;
      return [this.element("text-editor", W.textEditor(html), el, ctx)];
    }
    return [this.container(el, ctx)];
  }

  private container(el: ElementNode, ctx: Ctx): ElementorElement {
    const wrapper = this.singleWrapper(el);
    const children = this.convertChildren(wrapper ?? el, ctx);
    const isChild = ctx.inner;
    const content: Settings = {};
    const tag = HTML_TAG_OK.has(el.tag) ? el.tag : "div";
    if (tag !== "div") content["html_tag"] = tag;
    if (el.tag === "a") content["link"] = W.linkValue(W.absolute(el.attrs["href"] ?? "", this.opt.baseUrl), el.attrs["target"]);
    const built: W.Built = {
      content,
      style: (st, c) => {
        const s = S.container(st, isChild);
        if (!wrapper) return s;
        const inner = S.container(this.style(wrapper, c.viewport), false);
        for (const k of Object.keys(inner)) {
          if (k.startsWith("flex_") || k.startsWith("grid_") || k === "container_type") s[k] = inner[k];
        }
        if (inner["boxed_width"]) {
          s["content_width"] = "boxed";
          s["boxed_width"] = inner["boxed_width"];
        }
        const op = s["padding"] as S.Dimensions;
        const wp = inner["padding"] as S.Dimensions;
        const merged = { ...op };
        for (const side of ["top", "right", "bottom", "left"] as const) {
          if ((op[side] === "" || op[side] === "0") && wp[side] && wp[side] !== "0") merged[side] = wp[side];
        }
        if (op.unit !== wp.unit && [op.top, op.right, op.bottom, op.left].every((v) => v === "0" || v === "")) {
          merged.unit = wp.unit;
        }
        merged.isLinked = new Set([merged.top, merged.right, merged.bottom, merged.left]).size === 1;
        s["padding"] = merged;
        return s;
      },
    };
    const node = this.element("container", built, el, ctx, false);
    node.elements = children;
    return node;
  }

  /** <section><div class="container" style="max-width:1200px;margin:auto">…</div></section> */
  private singleWrapper(el: ElementNode): ElementNode | null {
    const kids = el.elements().filter((k) => !SKIP_TAGS.has(k.tag));
    if (kids.length !== 1 || this.hasLooseText(el)) return null;
    const k = kids[0]!;
    if (!CONTAINER_TAGS.has(k.tag)) return null;
    const st = this.style(k);
    const mw = S.size(st["max-width"]);
    if (mw && mw.unit === "px" && !Object.keys(S.background(st)).length &&
        !Object.keys(S.border(st)).length && !this.isInlineOnly(k)) return k;
    return null;
  }

  // ------------------------------------------------------------- output
  private body(): ElementNode {
    let body = this.doc.find("body") ?? this.doc;
    for (;;) {
      const kids = body.elements().filter((k) => !SKIP_TAGS.has(k.tag));
      const only = kids[0];
      if (kids.length === 1 && only && (only.tag === "div" || only.tag === "main") &&
          !Object.keys(S.background(this.style(only))).length && !this.singleWrapper(body) && !this.hasLooseText(body)) {
        body = only;
      } else {
        return body;
      }
    }
  }

  run(): ElementorElement[] {
    const top: ElementorElement[] = [];
    let wrap: ElementorElement | null = null;
    for (const node of this.convertChildren(this.body(), { inner: false, align: {} })) {
      if (node.elType === "container") {
        top.push(node);
        wrap = null;
        continue;
      }
      if (!wrap) { // a stray top-level widget: Elementor needs a container around it
        wrap = {
          id: this.newId(), elType: "container", isInner: false, elements: [],
          settings: { content_width: "boxed", flex_direction: "column", flex_gap: S.zeroGap(), padding: { ...S.ZERO_PADDING } },
        };
        this.report.containers++;
        top.push(wrap);
      }
      wrap.elements.push(node);
    }
    if (this.opt.keepCss && this.rawCss.length && top.length) {
      top[0]!.elements.unshift({
        id: this.newId(), elType: "widget", widgetType: "html", isInner: false, elements: [],
        settings: { html: `<style>\n${this.rawCss.join("\n")}\n</style>` },
      });
    }
    markInner(top, false);
    return top;
  }

  pageSettings(): Settings {
    const ps: Settings = { hide_title: "yes" };
    if (this.opt.canvas) ps["template"] = "elementor_canvas";
    const body = this.doc.find("body");
    if (body) Object.assign(ps, S.background(this.style(body)));
    return ps;
  }
}

function markInner(nodes: ElementorElement[], inner: boolean): void {
  for (const n of nodes) {
    n.isInner = n.elType === "container" ? inner : false;
    if (n.elType === "container") markInner(n.elements, true);
  }
}

/** Convert an HTML string. Returns the elements (the `_elementor_data` value), page settings and a report. */
export function convert(html: string, options: ConvertOptions = {}): ConversionResult {
  const conv = new Converter(html, options);
  const elements = conv.run();
  return { elements, pageSettings: conv.pageSettings(), report: conv.report };
}

/** Wrap elements in Elementor's template export format (Templates › Import). */
export function toTemplate(result: ConversionResult, title: string, type: "page" | "section" = "page"): ElementorTemplate {
  return { content: result.elements, page_settings: result.pageSettings, version: "0.4", title, type };
}

/** The page <title>, if any. */
export function htmlTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m?.[1]?.trim() || null;
}
