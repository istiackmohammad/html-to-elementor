"""Builders for Elementor widgets.

Each builder returns (content_settings, style_fn). content_settings never
change between breakpoints (text, URLs). style_fn(style, ctx) returns the
style settings for one breakpoint; the converter calls it for desktop, tablet
and mobile and keeps only the differences for the smaller screens.
"""
from __future__ import annotations

import re
from urllib.parse import urljoin

from . import styles as S
from .dom import Element, Text

INLINE_TAGS = {
    "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn", "em", "i",
    "kbd", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time",
    "u", "var", "wbr", "del", "ins", "label", "font",
}

ICON_CLASS = re.compile(r"\b(fa[srlbd]?|fa-solid|fa-regular|fa-brands|fa-light)\b")


def collapse(html: str) -> str:
    return re.sub(r"\s+", " ", html).strip()


def absolute(url: str, base: str) -> str:
    if not url or not base or re.match(r"^(https?:|data:|mailto:|tel:|#|//)", url):
        return url
    return urljoin(base, url)


def link_value(url: str, target: str = "") -> dict:
    return {"url": url or "", "is_external": "on" if target == "_blank" else "",
            "nofollow": "", "custom_attributes": ""}


def fa_icon(el: Element) -> dict | None:
    """<i class="fa-solid fa-star"> -> {'value': 'fas fa-star', 'library': 'fa-solid'}"""
    cls = el.classes
    names = [c for c in cls if c.startswith("fa-") and c not in
             ("fa-solid", "fa-regular", "fa-brands", "fa-light", "fa-fw", "fa-lg", "fa-2x", "fa-3x")]
    if not names or not any(ICON_CLASS.fullmatch(c) for c in cls):
        return None
    if "fab" in cls or "fa-brands" in cls:
        return {"value": f"fab {names[0]}", "library": "fa-brands"}
    if "far" in cls or "fa-regular" in cls:
        return {"value": f"far {names[0]}", "library": "fa-regular"}
    return {"value": f"fas {names[0]}", "library": "fa-solid"}


# --------------------------------------------------------------------------
def heading(el: Element):
    content = {"title": collapse(el.inner_html()), "header_size": el.tag if el.tag[0] == "h" else "div"}

    def style(st, ctx):
        s = S.widget_box(st)
        s["title_color"] = S.color(st.get("color")) or "#000000"    # else Elementor's global primary
        a = S.text_align(st)
        if a:
            s["align"] = a
        s.update(S.typography(st))
        return s
    return content, style


def text_editor(html: str):
    content = {"editor": html.strip()}

    def style(st, ctx):
        s = S.widget_box(st)
        s["text_color"] = S.color(st.get("color")) or "#000000"     # else Elementor's global text grey
        a = S.text_align(st)
        if a:
            s["align"] = a
        s.update(S.typography(st))
        return s
    return content, style


def button(el: Element, base: str, engine):
    text = collapse(el.text()) or "Click"
    url = el.attrs.get("href", "#") if el.tag == "a" else "#"
    content = {"text": text, "link": link_value(absolute(url, base), el.attrs.get("target", ""))}
    icon_el = next((c for c in el.elements() if c.tag == "i" and fa_icon(c)), None)
    if icon_el is not None:
        content["selected_icon"] = fa_icon(icon_el)
        first = el.elements()[0] is icon_el and not (el.children[0].data.strip() if isinstance(el.children[0], Text) else "")
        content["icon_align"] = "left" if first else "right"
        content["icon_indent"] = {"unit": "px", "size": 8, "sizes": []}
    hover = engine.hover(el)

    def style(st, ctx):
        s = {}
        margin = S.dims(st, "margin")
        if margin and any(margin[k] not in ("", "0") for k in ("top", "right", "bottom", "left")):
            s["_margin"] = margin
        c = S.color(st.get("color"))
        if c:
            s["button_text_color"] = c
        s.update(S.background(st, "background") or {
            "background_background": "classic", "background_color": "#00000000"})  # not the global accent
        pad = S.dims(st, "padding")
        if pad:
            s["text_padding"] = pad
        s.update(S.border(st, "border"))
        r = S.radius(st)
        if r:
            s["border_radius"] = r
        s.update(S.box_shadow(st.get("box-shadow"), "button_box_shadow"))
        s.update(S.typography(st))
        w = st.get("width")
        if st.get("display") == "block" or w == "100%":
            s["align"] = "justify"
        elif ctx.get("align"):
            s["align"] = ctx["align"]
        if ctx.get("viewport") == "desktop" and hover:
            hc = S.color(hover.get("color"))
            if hc:
                s["hover_color"] = hc
            hb = S.color(hover.get("background-color"))
            if hb:
                s["button_background_hover_color"] = hb
            hbc = S.color(hover.get("border-top-color"))
            if hbc:
                s["button_hover_border_color"] = hbc
        return s
    return content, style


def image(img: Element, base: str, link: Element | None = None):
    src = img.attrs.get("src") or img.attrs.get("data-src") or ""
    content = {
        "image": {"url": absolute(src, base), "id": "", "size": "", "alt": img.attrs.get("alt", ""),
                  "source": "url"},
        "image_size": "full",
    }
    if link is not None:
        content["link_to"] = "custom"
        content["link"] = link_value(absolute(link.attrs.get("href", ""), base), link.attrs.get("target", ""))

    def style(st, ctx):
        s = S.widget_box({k: v for k, v in st.items() if k != "max-width"})
        w = S.size(st.get("width")) or S.size(img.attrs.get("width") and img.attrs["width"] + "px")
        if w and w["unit"] in ("px", "%", "vw"):
            s["width"] = w
        mw = S.size(st.get("max-width"))
        if mw and mw["unit"] in ("px", "%", "vw") and not (mw["unit"] == "%" and mw["size"] == 100):
            s["space"] = mw
        h = S.size(st.get("height"))
        if h and h["unit"] in ("px", "vh"):
            s["height"] = h
            fit = st.get("object-fit")
            if fit in ("cover", "contain", "fill"):
                s["object-fit"] = fit
        r = S.radius(st)
        if r:
            s["image_border_radius"] = r
        s.update(S.border(st, "image_border"))
        s.update(S.box_shadow(st.get("box-shadow"), "image_box_shadow"))
        if ctx.get("align"):
            s["align"] = ctx["align"]
        return s
    return content, style


def divider(el: Element):
    def style(st, ctx):
        s = {"style": st.get("border-top-style") if st.get("border-top-style") not in (None, "none") else "solid"}
        c = S.color(st.get("border-top-color") or st.get("background-color"))
        if c:
            s["color"] = c
        w = S.size(st.get("border-top-width") or st.get("height"))
        if w:
            s["weight"] = w
        width = S.size(st.get("width"))
        if width:
            s["width"] = width
        margin = S.dims(st, "margin")
        if margin:
            s["gap"] = {"unit": margin["unit"], "size": S._clean(float(margin["top"] or 0)), "sizes": []}
        return s
    return {}, style


def icon(el: Element):
    content = {"selected_icon": fa_icon(el)}

    def style(st, ctx):
        s = S.widget_box(st)
        c = S.color(st.get("color"))
        if c:
            s["primary_color"] = c
        fs = S.size(st.get("font-size"))
        if fs:
            s["size"] = fs
        if ctx.get("align"):
            s["align"] = ctx["align"]
        return s
    return content, style


def icon_list(ul: Element, base: str, inline: bool, rng):
    items = []
    for li in ul.elements():
        if li.tag != "li":
            continue
        a = li.find("a")
        ic = next((c for c in li.iter() if c.tag == "i" and fa_icon(c)), None)
        item = {
            "text": collapse(li.text()),
            "selected_icon": fa_icon(ic) if ic is not None else {"value": "", "library": ""},
            "_id": rng(),
        }
        if a is not None:
            item["link"] = link_value(absolute(a.attrs.get("href", ""), base), a.attrs.get("target", ""))
        items.append(item)
    content = {"icon_list": items, "view": "inline" if inline else "traditional"}
    first_li = next((c for c in ul.elements() if c.tag == "li"), None)
    first_a = first_li.find("a") if first_li is not None else None

    def style(st, ctx):
        s = S.widget_box(st)
        txt = ctx["engine"].computed(first_a or first_li or ul, ctx["viewport"]) if (first_a or first_li) else st
        c = S.color(txt.get("color"))
        if c:
            s["text_color"] = c
        s.update(S.typography(txt, "icon_typography"))
        gap = S.size(st.get("column-gap") or st.get("row-gap"))
        if gap:
            s["space_between"] = gap
        if ctx.get("align"):
            s["icon_align"] = ctx["align"]
        return s
    return content, style


VIDEO_RE = {
    "youtube": re.compile(r"(?:youtube\.com/(?:embed/|watch\?v=)|youtu\.be/)([\w-]{6,})"),
    "vimeo": re.compile(r"vimeo\.com/(?:video/)?(\d+)"),
}


def video(el: Element, base: str):
    src = el.attrs.get("src", "")
    if el.tag == "video" and not src:
        source = el.find("source")
        src = source.attrs.get("src", "") if source is not None else ""
    m = VIDEO_RE["youtube"].search(src)
    if m:
        content = {"video_type": "youtube", "youtube_url": f"https://www.youtube.com/watch?v={m.group(1)}"}
    else:
        m = VIDEO_RE["vimeo"].search(src)
        if m:
            content = {"video_type": "vimeo", "vimeo_url": f"https://vimeo.com/{m.group(1)}"}
        else:
            content = {"video_type": "hosted", "hosted_url": {"url": absolute(src, base), "id": ""}}
    if el.tag == "video":
        for attr, key in (("autoplay", "autoplay"), ("muted", "mute"), ("loop", "loop")):
            if attr in el.attrs:
                content[key] = "yes"
        if "controls" not in el.attrs:
            content["controls"] = ""

    def style(st, ctx):
        return S.widget_box(st)
    return content, style


def is_video_iframe(el: Element) -> bool:
    src = el.attrs.get("src", "")
    return any(r.search(src) for r in VIDEO_RE.values())


def html_widget(markup: str):
    content = {"html": markup}

    def style(st, ctx):
        return {}
    return content, style
