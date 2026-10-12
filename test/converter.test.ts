import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { convert, toTemplate, templateZip, type ConvertOptions, type ElementorElement } from "../src/index.js";
import { Stylesheet, StyleEngine, type Viewport } from "../src/css.js";
import { parse } from "../src/dom.js";

const EXAMPLE = readFileSync(new URL("../examples/landing.html", import.meta.url), "utf8");

const run = (html: string, opts: ConvertOptions = {}) => convert(html, { seed: 1, ...opts });

function* walk(nodes: ElementorElement[]): Generator<ElementorElement> {
  for (const n of nodes) {
    yield n;
    yield* walk(n.elements);
  }
}
const widgets = (nodes: ElementorElement[], kind: string) => [...walk(nodes)].filter((n) => n.widgetType === kind);
const settings = (n: ElementorElement) => n.settings as Record<string, any>;

function computed(html: string, tag: string, vp: Viewport = "desktop") {
  const doc = parse(html);
  const sheet = new Stylesheet();
  for (const st of doc.findAll("style")) sheet.add(st.text());
  return new StyleEngine(sheet).computed(doc.find(tag)!, vp);
}

describe("css engine", () => {
  it("orders by specificity, then source order, with inline styles last", () => {
    const st = computed(`<style>p{color:red} .a{color:green} #x{color:blue} p{color:black}</style>
      <p id="x" class="a" style="font-size:20px">t</p>`, "p");
    expect(st["color"]).toBe("blue");
    expect(st["font-size"]).toBe("20px");
  });

  it("lets !important beat inline styles", () => {
    expect(computed(`<style>p{color:red !important}</style><p style="color:blue">t</p>`, "p")["color"]).toBe("red");
  });

  it("resolves CSS variables, fallbacks and inheritance", () => {
    const st = computed(`<style>:root{--c:#123456} body{color:var(--c)} .x{padding:var(--p, 8px)}</style>
      <body><p class=x>t</p></body>`, "p");
    expect(st["color"]).toBe("#123456");
    expect(st["padding-top"]).toBe("8px");
    expect(st["padding-left"]).toBe("8px");
  });

  it("evaluates desktop-first media queries per viewport", () => {
    const html = `<style>h1{font-size:50px} @media (max-width:1024px){h1{font-size:40px}}
      @media (max-width:767px){h1{font-size:30px}}</style><h1>t</h1>`;
    expect(computed(html, "h1", "desktop")["font-size"]).toBe("50px");
    expect(computed(html, "h1", "tablet")["font-size"]).toBe("40px");
    expect(computed(html, "h1", "mobile")["font-size"]).toBe("30px");
  });

  it("evaluates mobile-first media queries per viewport", () => {
    const html = `<style>h1{font-size:30px} @media (min-width:768px){h1{font-size:40px}}
      @media (min-width:1025px){h1{font-size:50px}}</style><h1>t</h1>`;
    expect(computed(html, "h1", "mobile")["font-size"]).toBe("30px");
    expect(computed(html, "h1", "tablet")["font-size"]).toBe("40px");
    expect(computed(html, "h1", "desktop")["font-size"]).toBe("50px");
  });

  it("matches descendant and child combinators", () => {
    const html = `<style>.a > p{color:red} .a span{color:blue}</style><div class=a><p><span>t</span></p></div>`;
    expect(computed(html, "p")["color"]).toBe("red");
    expect(computed(html, "span")["color"]).toBe("blue");
  });
});

describe("converter", () => {
  it("maps headings and text with responsive font sizes", () => {
    const { elements } = run(`<style>h1{font-size:48px;color:#111} @media (max-width:767px){h1{font-size:32px}}</style>
      <section><h1>Hello <em>world</em></h1><p>Body copy</p></section>`);
    const h = settings(widgets(elements, "heading")[0]!);
    expect(h["title"]).toBe("Hello <em>world</em>");
    expect(h["header_size"]).toBe("h1");
    expect(h["title_color"]).toBe("#111");
    expect(h["typography_font_size"].size).toBe(48);
    expect(h["typography_font_size_mobile"].size).toBe(32);
    expect(h["typography_font_size_tablet"]).toBeUndefined();
    expect(settings(widgets(elements, "text-editor")[0]!)["editor"]).toBe("<p>Body copy</p>");
  });

  it("detects buttons with hover colours inside a flex row", () => {
    const { elements } = run(`<style>.row{display:flex;gap:12px;justify-content:center}
      .btn{background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px} .btn:hover{background:#3730a3}</style>
      <section><div class=row><a class=btn href="/a">One</a><a class=btn href="/b">Two</a></div></section>`);
    const buttons = widgets(elements, "button");
    expect(buttons.map((b) => settings(b)["text"])).toEqual(["One", "Two"]);
    const b = settings(buttons[0]!);
    expect(b["background_color"]).toBe("#4f46e5");
    expect(b["button_background_hover_color"]).toBe("#3730a3");
    expect(b["text_padding"]).toMatchObject({ top: "12", left: "24" });
    const row = [...walk(elements)].find((n) => n.elType === "container" && settings(n)["flex_direction"] === "row")!;
    expect(settings(row)["flex_justify_content"]).toBe("center");
    expect(settings(row)["flex_gap"].size).toBe(12);
  });

  it("gives transparent buttons an explicit transparent background", () => {
    const { elements } = run(`<style>.ghost{border:2px solid #000;padding:10px 20px;color:#000}</style>
      <section><a class="btn ghost" href="#">Ghost</a></section>`);
    expect(settings(widgets(elements, "button")[0]!)["background_color"]).toBe("#00000000");
  });

  it("maps grid columns per breakpoint", () => {
    const { elements } = run(`<style>.g{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
      @media (max-width:767px){.g{grid-template-columns:1fr}}</style>
      <section><div class=g><div><h3>a</h3></div><div><h3>b</h3></div><div><h3>c</h3></div></div></section>`);
    const grid = [...walk(elements)].find((n) => settings(n)["container_type"] === "grid")!;
    expect(settings(grid)["grid_columns_grid"].size).toBe(3);
    expect(settings(grid)["grid_columns_grid_mobile"].size).toBe(1);
    expect(grid.elements).toHaveLength(3);
  });

  it("collapses a max-width wrapper into a boxed container", () => {
    const { elements } = run(`<style>.wrap{max-width:1200px;margin:0 auto;padding:0 20px}
      section{padding:80px 0;background:#eee}</style><section><div class=wrap><h2>t</h2></div></section>`);
    const sec = settings(elements[0]!);
    expect(sec["content_width"]).toBe("boxed");
    expect(sec["boxed_width"].size).toBe(1200);
    expect(sec["padding"]).toMatchObject({ top: "80", left: "20" });
    expect(elements[0]!.elements[0]!.widgetType).toBe("heading");
  });

  it("turns a nav list into an inline icon list hidden on mobile", () => {
    const { elements } = run(`<style>.nav{display:flex;gap:20px;list-style:none}
      @media (max-width:767px){.nav{display:none}}</style>
      <header><ul class=nav><li><a href="#a">A</a></li><li><a href="#b">B</a></li></ul></header>`);
    const il = settings(widgets(elements, "icon-list")[0]!);
    expect(il["view"]).toBe("inline");
    expect(il["icon_list"].map((i: any) => i.link.url)).toEqual(["#a", "#b"]);
    expect(il["hide_mobile"]).toBe("hidden-mobile");
  });

  it("maps images, icons, dividers and videos", () => {
    const { elements } = run(`<section><img src="/img/a.jpg" alt="A"><i class="fa-solid fa-star"></i><hr>
      <iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe></section>`, { baseUrl: "https://cdn.example.com" });
    expect(settings(widgets(elements, "image")[0]!)["image"].url).toBe("https://cdn.example.com/img/a.jpg");
    expect(settings(widgets(elements, "icon")[0]!)["selected_icon"]).toEqual({ value: "fas fa-star", library: "fa-solid" });
    expect(widgets(elements, "divider")).toHaveLength(1);
    expect(settings(widgets(elements, "video")[0]!)["youtube_url"]).toMatch(/abcdefghijk$/);
  });

  it("falls back to HTML widgets for markup without a native widget", () => {
    const { elements, report } = run(`<section><form><input name=q><button>Go</button></form>
      <table><tr><td>1</td></tr></table></section>`);
    expect(widgets(elements, "html")).toHaveLength(2);
    expect(report.htmlFallbacks).toEqual(["form", "table"]);
  });

  it("wraps stray top-level widgets and keeps ids unique", () => {
    const { elements, pageSettings } = run("<h1>Loose heading</h1><p>loose text</p>");
    expect(elements.every((n) => n.elType === "container" && n.isInner === false)).toBe(true);
    const ids = [...walk(elements)].map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pageSettings["template"]).toBe("elementor_canvas");
  });

  it("is deterministic with a seed", () => {
    expect(JSON.stringify(run(EXAMPLE).elements)).toBe(JSON.stringify(run(EXAMPLE).elements));
  });

  it("embeds the stylesheet and keeps class names with keepCss", () => {
    const { elements } = run("<style>.a{color:red}</style><section class=a><h2>t</h2></section>", { keepCss: true });
    const first = elements[0]!.elements[0]!;
    expect(first.widgetType).toBe("html");
    expect(settings(first)["html"]).toContain(".a{color:red}");
    expect(settings(elements[0]!)["css_classes"]).toBe("a");
  });

  it("warns about Tailwind, external CSS and relative images", () => {
    const { report } = run(`<link rel="stylesheet" href="https://x.com/site.css">
      <script src="https://cdn.tailwindcss.com"></script><img src="img/a.png">`);
    expect(report.warnings).toHaveLength(3);
  });
});

describe("output", () => {
  it("produces Elementor's template export shape", () => {
    const tpl = toTemplate(run("<section><h2>t</h2></section>"), "My page");
    expect(Object.keys(tpl).sort()).toEqual(["content", "page_settings", "title", "type", "version"]);
    expect(tpl.version).toBe("0.4");
  });

  it("zips the template as <slug>.json", () => {
    const tpl = toTemplate(run("<section><h2>t</h2></section>"), "My Landing Page!");
    const files = unzipSync(templateZip(tpl));
    expect(Object.keys(files)).toEqual(["my-landing-page.json"]);
    expect(JSON.parse(strFromU8(files["my-landing-page.json"]!)).title).toBe("My Landing Page!");
  });

  it("converts the example landing page cleanly", () => {
    const { elements, report } = run(EXAMPLE);
    expect(report.htmlFallbacks).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(widgets(elements, "button")).toHaveLength(3);
    expect(widgets(elements, "heading")).toHaveLength(7);
    expect(settings(elements[elements.length - 1]!)["html_tag"]).toBe("footer");
  });
});
