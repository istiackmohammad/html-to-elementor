"""A small CSS engine: parse stylesheets, match selectors, compute styles.

Styles are computed at three viewport widths that line up with Elementor's
default breakpoints, so media queries (desktop-first or mobile-first) turn
into Elementor's desktop / _tablet / _mobile settings.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from .dom import Element

VIEWPORTS = {"desktop": 1366, "tablet": 900, "mobile": 390}

INHERITED = {
    "color", "font-family", "font-size", "font-weight", "font-style",
    "line-height", "letter-spacing", "text-align", "text-transform",
}

_COMMENT = re.compile(r"/\*.*?\*/", re.S)


# --------------------------------------------------------------------------
# Selectors
# --------------------------------------------------------------------------
@dataclass
class Compound:
    tag: Optional[str] = None
    ids: list = field(default_factory=list)
    classes: list = field(default_factory=list)
    attrs: list = field(default_factory=list)      # (name, op, value)
    pseudos: list = field(default_factory=list)    # structural pseudo-classes
    hover: bool = False
    root: bool = False


@dataclass
class Selector:
    parts: list            # [Compound, combinator, Compound, ...] left to right
    specificity: tuple
    hover: bool            # rule targets the :hover state of the subject


_SUPPORTED_PSEUDO = {"first-child", "last-child", "only-child", "hover", "root",
                     "focus", "active", "link", "visited"}
_TOKEN = re.compile(
    r"\s*([>+~])\s*|(\s+)|(\*)|(#[\w-]+)|(\.[\w-]+)|(\[[^\]]*\])|(::?[\w-]+(?:\([^)]*\))?)|([\w-]+)"
)


def parse_selector(text: str) -> Optional[Selector]:
    text = text.strip()
    if not text:
        return None
    parts: list = []
    cur = Compound()
    started = False
    pos = 0
    a = b = c = 0
    hover = False
    while pos < len(text):
        m = _TOKEN.match(text, pos)
        if not m or m.end() == pos:
            return None
        pos = m.end()
        comb, ws, star, hid, cls, attr, pseudo, tag = m.groups()
        if comb or ws:
            if not started:
                continue
            if ws and pos < len(text) and text[pos] in ">+~":
                continue
            parts += [cur, comb or " "]
            cur, started = Compound(), False
            continue
        started = True
        if star:
            continue
        if hid:
            cur.ids.append(hid[1:]); a += 1
        elif cls:
            cur.classes.append(cls[1:]); b += 1
        elif attr:
            am = re.match(r"\[\s*([\w-]+)\s*(?:([~|^$*]?=)\s*['\"]?([^'\"\]]*)['\"]?)?\s*\]", attr)
            if not am:
                return None
            cur.attrs.append(am.groups()); b += 1
        elif pseudo:
            if pseudo.startswith("::"):
                return None                       # ::before / ::after are not elements
            name = pseudo[1:].lower()
            if name not in _SUPPORTED_PSEUDO:
                return None                       # unsupported -> skip rule entirely
            b += 1
            if name == "hover":
                cur.hover = True
            elif name == "root":
                cur.root = True
            elif name in ("focus", "active", "visited"):
                return None
            elif name != "link":
                cur.pseudos.append(name)
        elif tag:
            cur.tag = tag.lower(); c += 1
    parts.append(cur)
    subject = parts[-1]
    hover = subject.hover
    if any(isinstance(p, Compound) and p.hover for p in parts[:-1]):
        return None                               # ".card:hover .title" is a state we can't express
    return Selector(parts, (a, b, c), hover)


def _match_compound(comp: Compound, el: Element) -> bool:
    if comp.root and el.tag != "html" and not (el.parent is not None and el.parent.tag == "#document"):
        return False
    if comp.tag and comp.tag != el.tag:
        return False
    if comp.ids and el.id not in comp.ids:
        return False
    if comp.classes:
        have = el.classes
        if any(cls not in have for cls in comp.classes):
            return False
    for name, op, val in comp.attrs:
        v = el.attrs.get(name)
        if v is None:
            return False
        if op == "=" and v != val:
            return False
        if op == "~=" and val not in v.split():
            return False
        if op == "^=" and not v.startswith(val):
            return False
        if op == "$=" and not v.endswith(val):
            return False
        if op == "*=" and val not in v:
            return False
    if comp.pseudos:
        sibs = el.parent.elements() if el.parent else [el]
        for p in comp.pseudos:
            if p == "first-child" and sibs[0] is not el:
                return False
            if p == "last-child" and sibs[-1] is not el:
                return False
            if p == "only-child" and len(sibs) != 1:
                return False
    return True


def _match_from(parts: list, idx: int, el: Element) -> bool:
    if not _match_compound(parts[idx], el):
        return False
    if idx == 0:
        return True
    comb = parts[idx - 1]
    target = idx - 2
    if comb == ">":
        p = el.parent
        return p is not None and p.tag != "#document" and _match_from(parts, target, p)
    if comb == " ":
        p = el.parent
        while p is not None and p.tag != "#document":
            if _match_from(parts, target, p):
                return True
            p = p.parent
        return False
    sibs = el.parent.elements() if el.parent else []
    i = next((n for n, s in enumerate(sibs) if s is el), 0)
    if comb == "+":
        return i > 0 and _match_from(parts, target, sibs[i - 1])
    if comb == "~":
        return any(_match_from(parts, target, s) for s in sibs[:i])
    return False


def matches(sel: Selector, el: Element) -> bool:
    return _match_from(sel.parts, len(sel.parts) - 1, el)


# --------------------------------------------------------------------------
# Stylesheets
# --------------------------------------------------------------------------
@dataclass
class Rule:
    selector: Selector
    decls: list        # [(prop, value, important)]
    order: int
    media: Optional[str] = None   # raw media condition, None = always


def parse_declarations(text: str) -> list:
    decls = []
    for chunk in _split_top(text, ";"):
        if ":" not in chunk:
            continue
        prop, _, value = chunk.partition(":")
        prop, value = prop.strip().lower() if not prop.strip().startswith("--") else prop.strip(), value.strip()
        important = False
        if value.lower().endswith("!important"):
            value, important = value[: -len("!important")].strip(), True
        if prop and value:
            decls.append((prop, value, important))
    return decls


def _split_top(text: str, sep: str) -> list:
    """Split on sep, ignoring separators inside parentheses or quotes."""
    out, depth, buf, quote = [], 0, [], None
    for ch in text:
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in "\"'":
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif ch == sep and depth == 0:
            out.append("".join(buf)); buf = []
            continue
        buf.append(ch)
    if "".join(buf).strip():
        out.append("".join(buf))
    return out


def _blocks(text: str):
    """Yield (prelude, body) for each top-level block in a stylesheet."""
    i, n = 0, len(text)
    while i < n:
        brace = text.find("{", i)
        semi = text.find(";", i)
        if semi != -1 and (brace == -1 or semi < brace):   # @import / @charset
            i = semi + 1
            continue
        if brace == -1:
            return
        prelude = text[i:brace].strip()
        depth, j = 1, brace + 1
        while j < n and depth:
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
            j += 1
        yield prelude, text[brace + 1: j - 1]
        i = j


class Stylesheet:
    def __init__(self):
        self.rules: list[Rule] = []
        self._order = 0

    def add(self, css: str, media: Optional[str] = None) -> None:
        css = _COMMENT.sub("", css)
        for prelude, body in _blocks(css):
            low = prelude.lower()
            if low.startswith("@media"):
                cond = prelude[6:].strip()
                self.add(body, f"({media}) and ({cond})" if media else cond)
            elif low.startswith("@supports") or low.startswith("@layer"):
                self.add(body, media)
            elif low.startswith("@"):
                continue                                   # @font-face, @keyframes, ...
            else:
                decls = parse_declarations(body)
                for sel_text in _split_top(prelude, ","):
                    sel = parse_selector(sel_text)
                    if sel:
                        self.rules.append(Rule(sel, decls, self._order, media))
                self._order += 1


def media_applies(cond: Optional[str], width: int) -> bool:
    if not cond:
        return True
    c = cond.lower()
    if re.search(r"\bprint\b|\bspeech\b|prefers-|orientation|hover\s*:|pointer", c):
        return False
    if re.search(r"\bnot\b", c):
        return False
    for kind, num, unit in re.findall(r"(min|max)-width\s*:\s*([\d.]+)\s*(px|em|rem)?", c):
        px = float(num) * (16 if unit in ("em", "rem") else 1)
        if kind == "min" and width < px:
            return False
        if kind == "max" and width > px:
            return False
    return True


# --------------------------------------------------------------------------
# Computed style
# --------------------------------------------------------------------------
_VAR = re.compile(r"var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)")


def resolve_vars(value: str, custom: dict, depth: int = 0) -> str:
    if "var(" not in value or depth > 8:
        return value

    def sub(m):
        name, fallback = m.group(1), m.group(2)
        if name in custom:
            return resolve_vars(custom[name], custom, depth + 1)
        return resolve_vars(fallback.strip(), custom, depth + 1) if fallback else ""

    return _VAR.sub(sub, value)


class StyleEngine:
    """Computes styles for elements, cached per (element, viewport)."""

    def __init__(self, sheet: Stylesheet):
        self.sheet = sheet
        self._cache: dict = {}

    def _matching(self, el: Element, width: int, hover: bool) -> list:
        found = []
        for r in self.sheet.rules:
            if r.selector.hover != hover or not media_applies(r.media, width):
                continue
            if matches(r.selector, el):
                for prop, value, imp in r.decls:
                    found.append(((imp, r.selector.specificity, r.order), prop, value))
        return found

    def computed(self, el: Element, viewport: str = "desktop") -> dict:
        key = (id(el), viewport)
        if key in self._cache:
            return self._cache[key]
        width = VIEWPORTS[viewport]
        parent = el.parent
        inherited = {}
        if parent is not None and parent.tag != "#document":
            pstyle = self.computed(parent, viewport)
            inherited = {k: v for k, v in pstyle.items() if k in INHERITED or k.startswith("--")}
        decls = self._matching(el, width, hover=False)
        inline = parse_declarations(el.attrs.get("style") or "")
        for prop, value, imp in inline:
            decls.append(((imp, (1, 0, 0, 0), 10 ** 9), prop, value))
        decls.sort(key=lambda d: (d[0][0], d[0][1], d[0][2]))
        style = dict(inherited)
        for _, prop, value in decls:                 # custom properties first
            if prop.startswith("--"):
                style[prop] = value
        custom = {k: v for k, v in style.items() if k.startswith("--")}
        for _, prop, value in decls:
            if not prop.startswith("--"):
                for p, v in expand(prop, resolve_vars(value, custom)):
                    style[p] = v
        self._cache[key] = style
        return style

    def hover(self, el: Element) -> dict:
        base = self.computed(el, "desktop")
        custom = {k: v for k, v in base.items() if k.startswith("--")}
        out = {}
        decls = sorted(self._matching(el, VIEWPORTS["desktop"], hover=True), key=lambda d: d[0])
        for _, prop, value in decls:
            for p, v in expand(prop, resolve_vars(value, custom)):
                out[p] = v
        return out


# --------------------------------------------------------------------------
# Shorthand expansion
# --------------------------------------------------------------------------
def split_values(value: str) -> list:
    return [v for v in _split_top(value.strip(), " ") if v.strip()]


def _box(prefix: str, value: str, suffix: str = "") -> list:
    v = split_values(value)
    if not v or len(v) > 4:
        return []
    t, r, b, l = (v * 4)[:1] * 4 if len(v) == 1 else (
        [v[0], v[1], v[0], v[1]] if len(v) == 2 else
        [v[0], v[1], v[2], v[1]] if len(v) == 3 else v)
    return [(f"{prefix}-{s}{suffix}", x) for s, x in zip(("top", "right", "bottom", "left"), (t, r, b, l))]


_COLOR = re.compile(r"(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:transparent|white|black|red|blue|green|gray|grey|orange|yellow|purple|pink|navy|teal)\b)")
_BORDER_STYLES = {"solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset", "none"}


def expand(prop: str, value: str) -> list:
    if prop in ("padding", "margin"):
        return _box(prop, value)
    if prop == "inset":
        return []
    if prop == "border-radius":
        v = split_values(value.split("/")[0])
        corners = ("top-left", "top-right", "bottom-right", "bottom-left")
        if len(v) == 1:
            v = v * 4
        elif len(v) == 2:
            v = [v[0], v[1], v[0], v[1]]
        elif len(v) == 3:
            v = [v[0], v[1], v[2], v[1]]
        return [(f"border-{c}-radius", x) for c, x in zip(corners, v[:4])]
    if prop == "gap" or prop == "grid-gap":
        v = split_values(value)
        return [("row-gap", v[0]), ("column-gap", v[1] if len(v) > 1 else v[0])] if v else []
    if prop == "flex-flow":
        out = []
        for tok in split_values(value):
            out.append(("flex-wrap" if "wrap" in tok else "flex-direction", tok))
        return out
    if prop == "place-items":
        v = split_values(value)
        return [("align-items", v[0]), ("justify-items", v[-1])] if v else []
    if prop == "place-content":
        v = split_values(value)
        return [("align-content", v[0]), ("justify-content", v[-1])] if v else []
    if prop in ("border", "border-top", "border-right", "border-bottom", "border-left"):
        sides = ("top", "right", "bottom", "left") if prop == "border" else (prop.split("-")[1],)
        width = style = color = None
        if value.strip() in ("none", "0"):
            return [(f"border-{s}-style", "none") for s in sides]
        for tok in split_values(value):
            if tok in _BORDER_STYLES:
                style = tok
            elif _COLOR.fullmatch(tok):
                color = tok
            elif re.match(r"^[\d.]", tok) or tok in ("thin", "medium", "thick"):
                width = tok
        out = []
        for s in sides:
            out += [(f"border-{s}-width", width or "medium"), (f"border-{s}-style", style or "none")]
            if color:
                out.append((f"border-{s}-color", color))
        return out
    if prop == "border-width":
        return _box("border", value, "-width")
    if prop == "border-color":
        return [(p, v) for p, v in _box("border", value, "-color")]
    if prop == "border-style":
        return _box("border", value, "-style")
    if prop == "background":
        out = []
        if "gradient(" in value:
            out.append(("background-image", value))
        else:
            url = re.search(r"url\([^)]*\)", value)
            if url:
                out.append(("background-image", url.group(0)))
            rest = value.replace(url.group(0), "") if url else value
            colors = _COLOR.findall(rest)
            if colors:
                out.append(("background-color", colors[-1]))
            for kw in ("cover", "contain"):
                if kw in rest:
                    out.append(("background-size", kw))
            if "no-repeat" in rest:
                out.append(("background-repeat", "no-repeat"))
            if "center" in rest:
                out.append(("background-position", "center center"))
        return out
    if prop == "font":
        return []                       # the font shorthand is rarely used in modern HTML; skip
    return [(prop, value)]
