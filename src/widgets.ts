/**
 * Builders for Elementor widgets.
 *
 * Each builder returns { content, style }: content settings never change
 * between breakpoints (text, URLs); style(computedStyle, ctx) returns the
 * style settings for one breakpoint.
 */
import type { StyleEngine, Style, Viewport } from "./css.js";
import type { ElementNode } from "./dom.js";
import * as S from "./styles.js";
import type { Settings } from "./styles.js";

export interface StyleContext {
  viewport: Viewport;
  align: string | null;
  engine: StyleEngine;
}

export interface Built {
  content: Settings;
  style: (st: Style, ctx: StyleContext) => Settings;
}

export const INLINE_TAGS = new Set([
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn", "em", "i", "kbd", "mark",
  "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "del",
  "ins", "label", "font",
]);

export const collapse = (html: string) => html.replace(/\s+/g, " ").trim();

export function absolute(url: string, base: string): string {
  if (!url || !base || /^(https?:|data:|mailto:|tel:|#|\/\/)/i.test(url)) return url;
  try {
    return new URL(url, base.endsWith("/") ? base : base + "/").toString();
  } catch {
    return url;
  }
}

export function linkValue(url: string, target = "") {
  return { url: url || "", is_external: target === "_blank" ? "on" : "", nofollow: "", custom_attributes: "" };
}

const FA_STYLE_CLASSES = new Set(["fa", "fas", "far", "fab", "fal", "fad", "fa-solid", "fa-regular", "fa-brands", "fa-light"]);
const FA_MODIFIERS = new Set(["fa-solid", "fa-regular", "fa-brands", "fa-light", "fa-fw", "fa-lg", "fa-xl", "fa-2x", "fa-3x", "fa-spin"]);

/** <i class="fa-solid fa-star"> -> { value: "fas fa-star", library: "fa-solid" } */
export function faIcon(el: ElementNode): { value: string; library: string } | null {
  const cls = el.classes;
  if (!cls.some((c) => FA_STYLE_CLASSES.has(c))) return null;
  const name = cls.find((c) => c.startsWith("fa-") && !FA_MODIFIERS.has(c));
  if (!name) return null;
  if (cls.includes("fab") || cls.includes("fa-brands")) return { value: `fab ${name}`, library: "fa-brands" };
  if (cls.includes("far") || cls.includes("fa-regular")) return { value: `far ${name}`, library: "fa-regular" };
  return { value: `fas ${name}`, library: "fa-solid" };
}

// --------------------------------------------------------------------------
export function heading(el: ElementNode): Built {
  return {
    content: { title: collapse(el.innerHtml()), header_size: /^h[1-6]$/.test(el.tag) ? el.tag : "div" },
    style(st) {
      const s = S.widgetBox(st);
      s["title_color"] = S.color(st["color"]) ?? "#000000"; // else Elementor's global primary colour
      const a = S.textAlign(st);
      if (a) s["align"] = a;
      return Object.assign(s, S.typography(st));
    },
  };
}

export function textEditor(html: string): Built {
  return {
    content: { editor: html.trim() },
    style(st) {
      const s = S.widgetBox(st);
      s["text_color"] = S.color(st["color"]) ?? "#000000"; // else Elementor's global text grey
      const a = S.textAlign(st);
      if (a) s["align"] = a;
      return Object.assign(s, S.typography(st));
    },
  };
}

export function button(el: ElementNode, base: string, engine: StyleEngine): Built {
  const url = el.tag === "a" ? (el.attrs["href"] ?? "#") : "#";
  const content: Settings = {
    text: collapse(el.text()) || "Click",
    link: linkValue(absolute(url, base), el.attrs["target"]),
  };
  const iconEl = el.elements().find((c) => c.tag === "i" && faIcon(c));
  if (iconEl) {
    content["selected_icon"] = faIcon(iconEl);
    const firstText = el.children[0]?.kind === "text" ? el.children[0].data.trim() : "";
    content["icon_align"] = el.elements()[0] === iconEl && !firstText ? "left" : "right";
    content["icon_indent"] = { unit: "px", size: 8, sizes: [] };
  }
  const hover = engine.hover(el);
  return {
    content,
    style(st, ctx) {
      const s: Settings = {};
      const margin = S.dims(st, "margin");
      if (margin && [margin.top, margin.right, margin.bottom, margin.left].some((v) => v && v !== "0")) s["_margin"] = margin;
      const c = S.color(st["color"]);
      if (c) s["button_text_color"] = c;
      const bg = S.background(st, "background");
      // an empty background would fall back to Elementor's global accent colour
      Object.assign(s, Object.keys(bg).length ? bg : { background_background: "classic", background_color: "#00000000" });
      const pad = S.dims(st, "padding");
      if (pad) s["text_padding"] = pad;
      Object.assign(s, S.border(st, "border"));
      const r = S.radius(st);
      if (r) s["border_radius"] = r;
      Object.assign(s, S.boxShadow(st["box-shadow"], "button_box_shadow"), S.typography(st));
      if (st["display"] === "block" || st["width"] === "100%") s["align"] = "justify";
      else if (ctx.align) s["align"] = ctx.align;
      if (ctx.viewport === "desktop") {
        const hc = S.color(hover["color"]);
        if (hc) s["hover_color"] = hc;
        const hb = S.color(hover["background-color"]);
        if (hb) s["button_background_hover_color"] = hb;
        const hbc = S.color(hover["border-top-color"]);
        if (hbc) s["button_hover_border_color"] = hbc;
      }
      return s;
    },
  };
}

export function image(img: ElementNode, base: string, link: ElementNode | null = null): Built {
  const src = img.attrs["src"] || img.attrs["data-src"] || "";
  const content: Settings = {
    image: { url: absolute(src, base), id: "", size: "", alt: img.attrs["alt"] ?? "", source: "url" },
    image_size: "full",
  };
  if (link) {
    content["link_to"] = "custom";
    content["link"] = linkValue(absolute(link.attrs["href"] ?? "", base), link.attrs["target"]);
  }
  return {
    content,
    style(st, ctx) {
      const { "max-width": _mw, ...rest } = st;
      const s = S.widgetBox(rest);
      const attrW = img.attrs["width"];
      const w = S.size(st["width"]) ?? (attrW && /^\d+$/.test(attrW) ? S.size(`${attrW}px`) : null);
      if (w && ["px", "%", "vw"].includes(w.unit)) s["width"] = w;
      const mw = S.size(st["max-width"]);
      if (mw && ["px", "%", "vw"].includes(mw.unit) && !(mw.unit === "%" && mw.size === 100)) s["space"] = mw;
      const h = S.size(st["height"]);
      if (h && (h.unit === "px" || h.unit === "vh")) {
        s["height"] = h;
        const fit = st["object-fit"];
        if (fit === "cover" || fit === "contain" || fit === "fill") s["object-fit"] = fit;
      }
      const r = S.radius(st);
      if (r) s["image_border_radius"] = r;
      Object.assign(s, S.border(st, "image_border"), S.boxShadow(st["box-shadow"], "image_box_shadow"));
      if (ctx.align) s["align"] = ctx.align;
      return s;
    },
  };
}

export function divider(): Built {
  return {
    content: {},
    style(st) {
      const ts = st["border-top-style"];
      const s: Settings = { style: ts && ts !== "none" ? ts : "solid" };
      const c = S.color(st["border-top-color"] ?? st["background-color"]);
      if (c) s["color"] = c;
      const w = S.size(st["border-top-width"] ?? st["height"]);
      if (w) s["weight"] = w;
      const width = S.size(st["width"]);
      if (width) s["width"] = width;
      const margin = S.dims(st, "margin");
      if (margin) s["gap"] = { unit: margin.unit, size: S.clean(parseFloat(margin.top || "0")), sizes: [] };
      return s;
    },
  };
}

export function icon(el: ElementNode): Built {
  return {
    content: { selected_icon: faIcon(el) },
    style(st, ctx) {
      const s = S.widgetBox(st);
      const c = S.color(st["color"]);
      if (c) s["primary_color"] = c;
      const fs = S.size(st["font-size"]);
      if (fs) s["size"] = fs;
      if (ctx.align) s["align"] = ctx.align;
      return s;
    },
  };
}

export function iconList(ul: ElementNode, base: string, inline: boolean, newId: () => string): Built {
  const lis = ul.elements().filter((c) => c.tag === "li");
  const items = lis.map((li) => {
    const a = li.find("a");
    const ic = [...li.iter()].find((c) => c.tag === "i" && faIcon(c));
    const item: Settings = {
      text: collapse(li.text()),
      selected_icon: ic ? faIcon(ic) : { value: "", library: "" },
      _id: newId(),
    };
    if (a) item["link"] = linkValue(absolute(a.attrs["href"] ?? "", base), a.attrs["target"]);
    return item;
  });
  const sample = lis[0]?.find("a") ?? lis[0] ?? null;
  return {
    content: { icon_list: items, view: inline ? "inline" : "traditional" },
    style(st, ctx) {
      const s = S.widgetBox(st);
      const txt = sample ? ctx.engine.computed(sample, ctx.viewport) : st;
      const c = S.color(txt["color"]);
      if (c) s["text_color"] = c;
      Object.assign(s, S.typography(txt, "icon_typography"));
      const g = S.size(st["column-gap"] ?? st["row-gap"]);
      if (g) s["space_between"] = g;
      if (ctx.align) s["icon_align"] = ctx.align;
      return s;
    },
  };
}

const VIDEO_RE = {
  youtube: /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/,
  vimeo: /vimeo\.com\/(?:video\/)?(\d+)/,
};

export const isVideoIframe = (el: ElementNode) =>
  Object.values(VIDEO_RE).some((r) => r.test(el.attrs["src"] ?? ""));

export function video(el: ElementNode, base: string): Built {
  let src = el.attrs["src"] ?? "";
  if (el.tag === "video" && !src) src = el.find("source")?.attrs["src"] ?? "";
  let content: Settings;
  const yt = VIDEO_RE.youtube.exec(src);
  const vm = VIDEO_RE.vimeo.exec(src);
  if (yt) content = { video_type: "youtube", youtube_url: `https://www.youtube.com/watch?v=${yt[1]}` };
  else if (vm) content = { video_type: "vimeo", vimeo_url: `https://vimeo.com/${vm[1]}` };
  else content = { video_type: "hosted", hosted_url: { url: absolute(src, base), id: "" } };
  if (el.tag === "video") {
    for (const [attr, key] of [["autoplay", "autoplay"], ["muted", "mute"], ["loop", "loop"]] as const) {
      if (attr in el.attrs) content[key] = "yes";
    }
    if (!("controls" in el.attrs)) content["controls"] = "";
  }
  return { content, style: (st) => S.widgetBox(st) };
}

export function htmlWidget(markup: string): Built {
  return { content: { html: markup }, style: () => ({}) };
}
