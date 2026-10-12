"""Convert an HTML document into Elementor container + widget JSON."""
from __future__ import annotations

import random
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from . import styles as S
from . import widgets as W
from .css import Stylesheet, StyleEngine, VIEWPORTS
from .dom import Element, Text, parse

SKIP_TAGS = {"script", "style", "link", "meta", "head", "title", "noscript", "template", "base"}
CONTAINER_TAGS = {"div", "section", "header", "footer", "main", "article", "aside", "nav",
                  "figure", "body", "a", "li", "ul", "ol", "span", "label", "blockquote", "form"}
HTML_TAG_OK = {"div", "header", "footer", "main", "article", "section", "aside", "nav", "a"}
TEXT_BLOCKS = {"p", "blockquote", "pre", "address", "figcaption", "dl"}
RAW_HTML_TAGS = {"table", "form", "svg", "canvas", "select", "input", "textarea", "details",
                 "iframe", "object", "embed", "audio", "map", "math", "dialog"}
BUTTON_CLASS = re.compile(r"(^|[-_\s])(btn|button|cta)([-_\s]|$)", re.I)

# Settings Elementor allows per breakpoint. Others are written once (desktop).
RESPONSIVE = re.compile(
    r"^(_?padding|_?margin|text_padding|flex_direction|flex_gap|flex_justify_content|"
    r"flex_align_items|flex_wrap|grid_columns_grid|grid_rows_grid|grid_gaps|grid_align_items|"
    r"grid_justify_items|boxed_width|width|min_height|space|height|align|icon_align|"
    r"space_between|_element_width|_element_custom_width|border_radius|_border_radius|"
    r"image_border_radius|(\w+_)?typography_(font_size|line_height|letter_spacing)|weight|gap)$")


@dataclass
class Options:
    title: str = "Converted page"
    base_url: str = ""
    keep_css: bool = False          # also embed the page's original CSS in an HTML widget
    canvas: bool = True             # page template: Elementor Canvas (no theme header/footer)
    seed: Optional[int] = None


@dataclass
class Report:
    widgets: dict = field(default_factory=dict)
    containers: int = 0
    html_fallbacks: list = field(default_factory=list)
    warnings: list = field(default_factory=list)

    def count(self, kind: str) -> None:
        self.widgets[kind] = self.widgets.get(kind, 0) + 1

    def as_dict(self) -> dict:
        return {"containers": self.containers, "widgets": self.widgets,
                "html_fallbacks": self.html_fallbacks, "warnings": self.warnings}


class Converter:
    def __init__(self, html: str, options: Options, extra_css: str = "", read_hrefs: tuple = ()):
        self.opt = options
        self.read_hrefs = set(read_hrefs)
        self.rng = random.Random(options.seed)
        self.report = Report()
        self.doc = parse(html)
        sheet = Stylesheet()
        self.raw_css = []
        for st in self.doc.find_all("style"):
            css = st.text()
            self.raw_css.append(css)
            sheet.add(css)
        if extra_css:
            self.raw_css.append(extra_css)
            sheet.add(extra_css)
        self.engine = StyleEngine(sheet)
        self._warn_about_inputs()

    # ------------------------------------------------------------------ utils
    def new_id(self) -> str:
        return "%07x" % self.rng.randrange(16 ** 7)

    def style(self, el: Element, vp: str = "desktop") -> dict:
        return self.engine.computed(el, vp)

    def hidden(self, el: Element, vp: str) -> bool:
        return self.style(el, vp).get("display") == "none"

    def _warn_about_inputs(self) -> None:
        links = [l for l in self.doc.find_all("link") if "stylesheet" in (l.attrs.get("rel") or "")]
        ext = [l.attrs.get("href", "") for l in links if l.attrs.get("href", "") not in self.read_hrefs
               and "fonts.googleapis" not in l.attrs.get("href", "")
               and "font-awesome" not in l.attrs.get("href", "") and "fontawesome" not in l.attrs.get("href", "")]
        if ext:
            self.report.warnings.append(
                "External stylesheets were not read: " + ", ".join(ext[:5]) +
                ". Inline them in a <style> tag (or pass --css) for full styling.")
        if any("tailwind" in (s.attrs.get("src") or "") for s in self.doc.find_all("script")):
            self.report.warnings.append(
                "Tailwind CDN detected. Utility classes are not interpreted; compile Tailwind to plain CSS first.")
        for img in self.doc.find_all("img"):
            src = img.attrs.get("src", "")
            if src and not re.match(r"^(https?:|data:|//)", src) and not self.opt.base_url:
                self.report.warnings.append(
                    "Relative image paths found (e.g. %s). Upload the images and pass --base-url." % src)
                break

    # ------------------------------------------------------------- building
    def element(self, kind: str, content: dict, style_fn, el: Element, ctx: dict, is_widget=True) -> dict:
        settings = dict(content)
        per_vp = {}
        for vp in VIEWPORTS:
            c = dict(ctx, viewport=vp, engine=self.engine)
            c["align"] = ctx.get("align_" + vp, ctx.get("align"))
            per_vp[vp] = style_fn(self.style(el, vp), c)
        settings.update(per_vp["desktop"])
        prev = per_vp["desktop"]
        for vp in ("tablet", "mobile"):
            for k, v in per_vp[vp].items():
                if RESPONSIVE.match(k) and prev.get(k) != v:
                    settings[f"{k}_{vp}"] = v
            prev = {**prev, **{k: v for k, v in per_vp[vp].items() if RESPONSIVE.match(k)}}
        for vp, flag in (("tablet", "hide_tablet"), ("mobile", "hide_mobile")):
            if self.hidden(el, vp) and not self.hidden(el, "desktop"):
                settings[flag] = f"hidden-{vp}"
        if self.opt.keep_css:
            cls = " ".join(el.classes)
            if cls:
                settings["_css_classes" if is_widget else "css_classes"] = cls
            if el.id:
                settings["_element_id"] = el.id
        node = {"id": self.new_id(), "elType": "widget" if is_widget else "container",
                "settings": settings or [], "elements": []}
        if is_widget:
            node["widgetType"] = kind
            self.report.count(kind)
        else:
            node["isInner"] = ctx.get("inner", False)
            self.report.containers += 1
        return node

    def widget(self, kind: str, built, el: Element, ctx: dict) -> dict:
        content, style_fn = built
        return self.element(kind, content, style_fn, el, ctx)

    def html_fallback(self, el: Element, ctx: dict) -> dict:
        self.report.html_fallbacks.append(el.tag)
        return self.widget("html", W.html_widget(el.outer_html()), el, ctx)

    # ------------------------------------------------------- classification
    def is_inline_only(self, el: Element) -> bool:
        for c in el.children:
            if isinstance(c, Element):
                if c.tag in SKIP_TAGS:
                    continue
                if c.tag not in W.INLINE_TAGS or self.is_button(c):
                    return False
                d = self.style(c).get("display", "")
                if d in ("block", "flex", "grid", "inline-flex", "inline-grid") or not self.is_inline_only(c):
                    return False
        return True

    def has_text(self, el: Element) -> bool:
        return bool(el.text().strip())

    def is_button(self, el: Element) -> bool:
        if el.tag == "button" or (el.tag == "input" and el.attrs.get("type") in ("submit", "button")):
            return True
        if el.tag != "a" or not self.is_inline_only(el) or el.find("img") is not None:
            return False
        if any(BUTTON_CLASS.search(c) for c in el.classes) or "button" == el.attrs.get("role"):
            return True
        st = self.style(el)
        bg = S.color(st.get("background-color"))
        has_bg = bg and bg not in ("transparent", "none") and not bg.replace(" ", "").endswith(",0)")
        has_border = any(st.get(f"border-{s}-style") not in (None, "none") for s in ("top", "bottom"))
        pad = S.size(st.get("padding-left"))
        return bool((has_bg or has_border) and pad and pad["size"] >= 6)

    def is_link_list(self, el: Element) -> bool:
        if el.tag not in ("ul", "ol"):
            return False
        lis = [c for c in el.elements()]
        if not lis or any(li.tag != "li" for li in lis):
            return False
        for li in lis:
            if not self.is_inline_only(li):
                return False
        return True

    def align_for(self, parent: Element, vp: str) -> Optional[str]:
        st = self.style(parent, vp)
        if st.get("display") in ("flex", "inline-flex") and st.get("flex-direction", "row").startswith("row"):
            return None
        ai = st.get("align-items")
        if st.get("display") in ("flex", "inline-flex") and ai in ("center", "flex-end", "end"):
            return "center" if ai == "center" else "right"
        return S.text_align(st)

    # ------------------------------------------------------------ the walk
    def convert_children(self, parent: Element, ctx: dict) -> list:
        out, pending_text = [], []
        child_ctx = dict(ctx, inner=True)
        for vp in VIEWPORTS:
            child_ctx["align_" + vp] = self.align_for(parent, vp)
        child_ctx["align"] = child_ctx["align_desktop"]

        def flush():
            html = "".join(pending_text).strip()
            if html and re.sub(r"<[^>]+>", "", html).strip():
                out.append(self.widget("text-editor", W.text_editor(html), parent, child_ctx))
            pending_text.clear()

        for child in parent.children:
            if isinstance(child, Text):
                if child.data.strip():
                    pending_text.append(W.collapse(child.outer_html()) + " ")
                continue
            if child.tag in SKIP_TAGS or self.hidden(child, "desktop") and self.hidden(child, "mobile"):
                continue
            if child.tag == "p" and not (self.is_button_wrapper(child)):
                pending_text.append(child.outer_html())
                continue
            flush()
            out.extend(self.convert(child, child_ctx))
        flush()
        return out

    def is_button_wrapper(self, el: Element) -> bool:
        kids = el.elements()
        return bool(kids) and all(self.is_button(k) for k in kids) and not any(
            isinstance(c, Text) and c.data.strip() for c in el.children)

    def convert(self, el: Element, ctx: dict) -> list:
        tag = el.tag
        if tag in SKIP_TAGS:
            return []
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            return [self.widget("heading", W.heading(el), el, ctx)]
        if tag == "img":
            return [self.widget("image", W.image(el, self.opt.base_url), el, ctx)]
        if tag == "picture":
            img = el.find("img")
            return [self.widget("image", W.image(img, self.opt.base_url), img, ctx)] if img else []
        if tag == "hr":
            return [self.widget("divider", W.divider(el), el, ctx)]
        if tag == "video" or (tag == "iframe" and W.is_video_iframe(el)):
            return [self.widget("video", W.video(el, self.opt.base_url), el, ctx)]
        if tag == "i" and W.fa_icon(el):
            return [self.widget("icon", W.icon(el), el, ctx)]
        if self.is_button(el):
            return [self.widget("button", W.button(el, self.opt.base_url, self.engine), el, ctx)]
        if tag == "a" and len(el.elements()) == 1 and el.elements()[0].tag == "img" and not el.text().strip():
            img = el.elements()[0]
            return [self.widget("image", W.image(img, self.opt.base_url, link=el), img, ctx)]
        if tag in RAW_HTML_TAGS:
            return [self.html_fallback(el, ctx)]
        if self.is_link_list(el):
            st = self.style(el)
            inline = (st.get("display") in ("flex", "inline-flex") and
                      not st.get("flex-direction", "row").startswith("column")) or \
                (el.parent is not None and el.parent.tag == "nav" and st.get("display") == "flex")
            return [self.widget("icon-list", W.icon_list(el, self.opt.base_url, inline, self.new_id), el, ctx)]
        if tag in TEXT_BLOCKS or tag in ("ul", "ol"):
            return [self.widget("text-editor", W.text_editor(el.outer_html()), el, ctx)]
        if self.is_inline_only(el):
            if not self.has_text(el):
                return []
            if tag in HTML_TAG_OK and tag not in ("div", "a"):   # keep <footer>, <section> ... as a box
                return [self.container(el, ctx)]
            st = self.style(el)
            if tag in W.INLINE_TAGS and st.get("display") not in ("block", "flex", "inline-block", "grid"):
                return [self.widget("text-editor", W.text_editor(el.outer_html()), el, ctx)]
            return [self.widget("text-editor", W.text_editor("<p>%s</p>" % W.collapse(el.inner_html())), el, ctx)]
        return [self.container(el, ctx)]

    def container(self, el: Element, ctx: dict) -> dict:
        inner = ctx.get("inner", False)
        target = el
        wrapper = self.single_wrapper(el)
        if wrapper is not None:
            target = wrapper
        children = self.convert_children(target, ctx)

        def style_fn(st, c):
            vp = c["viewport"]
            s = S.container(st, is_child=inner)
            if wrapper is not None:
                ws = self.style(wrapper, vp)
                inner_s = S.container(ws, is_child=False)
                for k in list(inner_s):
                    if k.startswith(("flex_", "grid_", "container_type")):
                        s[k] = inner_s[k]
                if "boxed_width" in inner_s:
                    s["content_width"], s["boxed_width"] = "boxed", inner_s["boxed_width"]
                wp = inner_s.get("padding")
                if wp:
                    op = s["padding"]
                    s["padding"] = {k: (op[k] if op.get(k) not in ("", "0") or k in ("unit", "isLinked") else wp[k])
                                    for k in op}
                    s["padding"]["isLinked"] = len({s["padding"][x] for x in ("top", "right", "bottom", "left")}) == 1
            return s

        tag = el.tag if el.tag in HTML_TAG_OK else "div"
        content = {}
        if tag != "div":
            content["html_tag"] = tag
        if el.tag == "a":
            content["link"] = W.link_value(W.absolute(el.attrs.get("href", ""), self.opt.base_url),
                                           el.attrs.get("target", ""))
        node = self.element("container", content, style_fn, el, ctx, is_widget=False)
        node["elements"] = children
        return node

    def single_wrapper(self, el: Element) -> Optional[Element]:
        """<section><div class="container" style="max-width:1200px;margin:auto">...</div></section>"""
        kids = el.elements()
        if len(kids) != 1 or any(isinstance(c, Text) and c.data.strip() for c in el.children):
            return None
        k = kids[0]
        if k.tag not in CONTAINER_TAGS or k.tag in ("a", "ul", "ol", "li", "span", "label"):
            return None
        st = self.style(k)
        mw = S.size(st.get("max-width"))
        bg = S.background(st)
        if mw and mw["unit"] == "px" and not bg and not S.border(st) and not self.is_inline_only(k):
            return k
        return None

    # ------------------------------------------------------------- output
    def body(self) -> Element:
        body = self.doc.find("body") or self.doc
        while True:
            kids = [k for k in body.elements() if k.tag not in SKIP_TAGS]
            if len(kids) == 1 and kids[0].tag in ("div", "main") and not S.background(self.style(kids[0])) \
                    and not self.single_wrapper(body) and not any(isinstance(c, Text) and c.data.strip() for c in body.children):
                body = kids[0]
            else:
                return body

    def run(self) -> list:
        body = self.body()
        ctx = {"inner": False}
        top = []
        for node in self.convert_children(body, ctx):
            if node["elType"] == "container":
                node["isInner"] = False
                top.append(node)
            else:                                     # stray top-level widget -> wrap it
                wrap = {"id": self.new_id(), "elType": "container", "isInner": False,
                        "settings": {"content_width": "boxed", "flex_direction": "column",
                                     "flex_gap": S._zero_gap(),
                                     "padding": {"unit": "px", "top": "0", "right": "0", "bottom": "0",
                                                 "left": "0", "isLinked": True}},
                        "elements": [node]}
                self.report.containers += 1
                if top and top[-1].get("_wrap"):
                    top[-1]["elements"].append(node)
                else:
                    wrap["_wrap"] = True
                    top.append(wrap)
        for t in top:
            t.pop("_wrap", None)
        if self.opt.keep_css and self.raw_css and top:
            css = "\n".join(self.raw_css)
            top[0]["elements"].insert(0, {"id": self.new_id(), "elType": "widget", "widgetType": "html",
                                          "settings": {"html": f"<style>\n{css}\n</style>"}, "elements": []})
        self._mark_inner(top, inner=False)
        return top

    def _mark_inner(self, nodes: list, inner: bool) -> None:
        for n in nodes:
            if n["elType"] == "container":
                n["isInner"] = inner
                self._mark_inner(n["elements"], True)
            else:
                n["isInner"] = False

    def page_settings(self) -> dict:
        ps = {"hide_title": "yes"}
        if self.opt.canvas:
            ps["template"] = "elementor_canvas"
        body = self.doc.find("body")
        if body is not None:
            ps.update(S.background(self.style(body)))
        return ps


def convert(html: str, options: Optional[Options] = None, extra_css: str = "",
            read_hrefs: tuple = ()) -> tuple:
    """Return (elements, page_settings, report)."""
    conv = Converter(html, options or Options(), extra_css, read_hrefs)
    elements = conv.run()
    return elements, conv.page_settings(), conv.report


def to_template(elements: list, page_settings: dict, title: str, type_: str = "page") -> dict:
    """Wrap elements in Elementor's template export format (Templates > Import)."""
    return {"content": elements, "page_settings": page_settings, "version": "0.4",
            "title": title, "type": type_}


def convert_file(path: str, options: Optional[Options] = None, css_files: tuple = ()) -> tuple:
    p = Path(path)
    html = p.read_text(encoding="utf-8", errors="replace")
    extra, read = [], []
    for c in css_files:
        extra.append(Path(c).read_text(encoding="utf-8", errors="replace"))
    # also read <link rel=stylesheet href="local.css"> next to the HTML file
    for m in re.finditer(r"<link[^>]+href=[\"']([^\"']+\.css)[\"'][^>]*>", html, re.I):
        href = m.group(1)
        local = (p.parent / href).resolve()
        if not re.match(r"^(https?:)?//", href) and local.is_file():
            extra.append(local.read_text(encoding="utf-8", errors="replace"))
            read.append(href)
    return convert(html, options, "\n".join(extra), tuple(read))
