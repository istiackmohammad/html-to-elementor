"""Map computed CSS to Elementor control settings.

Every function takes a computed style dict (see css.StyleEngine.computed) and
returns a dict of Elementor settings for one breakpoint. The converter calls
them per viewport and suffixes tablet/mobile differences with _tablet/_mobile.
"""
from __future__ import annotations

import re
from typing import Optional

UNITS = ("px", "em", "rem", "%", "vh", "vw")
_NUM = re.compile(r"^(-?[\d.]+)(px|em|rem|%|vh|vw|pt)?$")


def size(value: Optional[str], allow_unitless: str = "px") -> Optional[dict]:
    """'24px' -> {'unit': 'px', 'size': 24, 'sizes': []}"""
    if not value:
        return None
    v = value.strip().lower()
    m = re.match(r"^clamp\(([^,]+),([^,]+),([^)]+)\)$", v)
    if m:                                   # clamp(min, preferred, max) -> use max on desktop
        v = m.group(3).strip()
    m = _NUM.match(v)
    if not m:
        return None
    num, unit = float(m.group(1)), m.group(2) or allow_unitless
    if unit == "pt":
        num, unit = num * 4 / 3, "px"
    num = int(num) if num == int(num) else round(num, 3)
    return {"unit": unit, "size": num, "sizes": []}


def _clean(n: float):
    return int(n) if n == int(n) else round(n, 3)


def _num_str(value: str) -> tuple:
    s = size(value)
    if s is None:
        return None, None
    return s["unit"], str(s["size"])


def dims(style: dict, prefix: str, suffix: str = "") -> Optional[dict]:
    """Build an Elementor dimensions value from e.g. padding-top/right/bottom/left."""
    sides = ("top", "right", "bottom", "left")
    raw = [style.get(f"{prefix}-{s}{suffix}") for s in sides]
    if all(r is None for r in raw):
        return None
    parsed = []
    for r in raw:
        if r is None or r == "auto":
            parsed.append((None, ""))
        else:
            parsed.append(_num_str(r))
    units = [u for u, n in parsed if u and n not in ("0", "")]
    unit = max(set(units), key=units.count) if units else "px"
    vals = []
    for u, n in parsed:
        if n is None:
            vals.append("")
        elif u == unit or n in ("0", ""):
            vals.append(n)
        elif {u, unit} <= {"px", "rem", "em"}:
            px = float(n) * (16 if u in ("rem", "em") else 1)
            conv = px if unit == "px" else px / 16
            vals.append(str(int(conv) if conv == int(conv) else round(conv, 3)))
        else:
            vals.append(n)
    linked = len(set(vals)) == 1
    return {"unit": unit, "top": vals[0], "right": vals[1], "bottom": vals[2],
            "left": vals[3], "isLinked": linked}


def radius(style: dict) -> Optional[dict]:
    corners = ("top-left", "top-right", "bottom-right", "bottom-left")
    fake = {f"r-{s}": style.get(f"border-{c}-radius")
            for s, c in zip(("top", "right", "bottom", "left"), corners)}
    return dims(fake, "r")


def color(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    v = value.strip()
    if v in ("inherit", "initial", "unset", "currentcolor", "currentColor"):
        return None
    return v


def font_family(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    first = value.split(",")[0].strip().strip("'\"")
    if first.lower() in ("inherit", "sans-serif", "serif", "monospace", "system-ui",
                         "-apple-system", "blinkmacsystemfont", "ui-sans-serif"):
        return None
    return first


def typography(style: dict, prefix: str = "typography") -> dict:
    out = {}
    fam = font_family(style.get("font-family"))
    fs = size(style.get("font-size"))
    fw = style.get("font-weight")
    lh = size(style.get("line-height"), allow_unitless="em")
    ls = size(style.get("letter-spacing"))
    tt = style.get("text-transform")
    fst = style.get("font-style")
    if fam:
        out[f"{prefix}_font_family"] = fam
    if fs:
        out[f"{prefix}_font_size"] = fs
    if fw:
        out[f"{prefix}_font_weight"] = {"bold": "700", "normal": "400"}.get(fw, fw)
    if lh:
        out[f"{prefix}_line_height"] = lh
    if ls:
        out[f"{prefix}_letter_spacing"] = ls
    if tt and tt != "none":
        out[f"{prefix}_text_transform"] = tt
    if fst == "italic":
        out[f"{prefix}_font_style"] = "italic"
    if out:
        out[f"{prefix}_typography"] = "custom"
    return out


def text_align(style: dict) -> Optional[str]:
    a = style.get("text-align")
    return {"start": "left", "end": "right", "justify": "justify",
            "left": "left", "right": "right", "center": "center"}.get(a or "")


_GRADIENT = re.compile(r"linear-gradient\((.*)\)", re.S)
_COLOR_STOP = re.compile(r"(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|\b[a-z]+\b)\s*([\d.]+%)?")


def background(style: dict, prefix: str = "background") -> dict:
    out = {}
    img = style.get("background-image", "")
    bg = color(style.get("background-color"))
    if img and "gradient(" in img:
        m = _GRADIENT.search(img)
        if m:
            parts = [p.strip() for p in _split_commas(m.group(1))]
            angle = 180
            if parts and re.match(r"^-?[\d.]+deg$", parts[0]):
                angle = float(parts.pop(0)[:-3])
            elif parts and parts[0].startswith("to "):
                angle = {"to top": 0, "to right": 90, "to bottom": 180, "to left": 270,
                         "to bottom right": 135, "to right bottom": 135,
                         "to top right": 45, "to bottom left": 225, "to top left": 315}.get(parts.pop(0), 180)
            stops = []
            for p in parts:
                cm = _COLOR_STOP.match(p)
                if cm:
                    stops.append((cm.group(1), cm.group(2)))
            if len(stops) >= 2:
                (c1, s1), (c2, s2) = stops[0], stops[-1]
                out.update({
                    f"{prefix}_background": "gradient",
                    f"{prefix}_color": c1,
                    f"{prefix}_color_stop": {"unit": "%", "size": _clean(float(s1[:-1])) if s1 else 0, "sizes": []},
                    f"{prefix}_color_b": c2,
                    f"{prefix}_color_b_stop": {"unit": "%", "size": _clean(float(s2[:-1])) if s2 else 100, "sizes": []},
                    f"{prefix}_gradient_type": "linear",
                    f"{prefix}_gradient_angle": {"unit": "deg", "size": int(angle), "sizes": []},
                })
                return out
    url = re.search(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", img or "")
    if url:
        out[f"{prefix}_background"] = "classic"
        out[f"{prefix}_image"] = {"url": url.group(1), "id": "", "size": "", "source": "url"}
        pos = style.get("background-position")
        out[f"{prefix}_position"] = _bg_position(pos)
        bsize = style.get("background-size")
        out[f"{prefix}_size"] = bsize if bsize in ("cover", "contain", "auto") else "cover"
        rep = style.get("background-repeat")
        out[f"{prefix}_repeat"] = rep if rep in ("no-repeat", "repeat", "repeat-x", "repeat-y") else "no-repeat"
        if bg:
            out[f"{prefix}_color"] = bg
    elif bg and bg not in ("transparent", "rgba(0,0,0,0)", "rgba(0, 0, 0, 0)"):
        out[f"{prefix}_background"] = "classic"
        out[f"{prefix}_color"] = bg
    return out


def _bg_position(pos: Optional[str]) -> str:
    valid = {"center center", "center left", "center right", "top center", "top left",
             "top right", "bottom center", "bottom left", "bottom right"}
    if not pos:
        return "center center"
    p = pos.strip().lower()
    words = p.split()
    if len(words) == 1:
        w = words[0]
        p = {"center": "center center", "top": "top center", "bottom": "bottom center",
             "left": "center left", "right": "center right"}.get(w, "center center")
    elif len(words) == 2 and words[0] in ("left", "right"):
        p = f"{words[1]} {words[0]}"
    return p if p in valid else "center center"


def _split_commas(text: str) -> list:
    out, depth, buf = [], 0, ""
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(buf); buf = ""
        else:
            buf += ch
    out.append(buf)
    return out


def border(style: dict, prefix: str = "border") -> dict:
    out = {}
    styles = [style.get(f"border-{s}-style") for s in ("top", "right", "bottom", "left")]
    active = [s for s in styles if s and s != "none"]
    if active:
        out[f"{prefix}_border"] = active[0]
        w = dims({f"w-{s}": (style.get(f"border-{s}-width") if st and st != "none" else "0")
                  for s, st in zip(("top", "right", "bottom", "left"), styles)}, "w")
        if w:
            out[f"{prefix}_width"] = w
        for s in ("top", "right", "bottom", "left"):
            c = color(style.get(f"border-{s}-color"))
            if c:
                out[f"{prefix}_color"] = c
                break
    return out


def box_shadow(value: Optional[str], prefix: str = "box_shadow") -> dict:
    if not value or value.strip() == "none":
        return {}
    first = _split_commas(value)[0].strip()
    if first.startswith("inset"):
        return {}
    col = re.search(r"(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))", first)
    nums = re.findall(r"(-?[\d.]+)(?:px)?", re.sub(r"(rgba?|hsla?)\([^)]*\)|#[0-9a-fA-F]+", "", first))
    nums = [_clean(float(n)) for n in nums] + [0, 0, 0, 0]
    return {
        f"{prefix}_box_shadow_type": "yes",
        f"{prefix}_box_shadow": {
            "horizontal": nums[0], "vertical": nums[1], "blur": nums[2], "spread": nums[3],
            "color": col.group(1) if col else "rgba(0,0,0,0.5)",
        },
    }


# --------------------------------------------------------------------------
# Per element-type mappings
# --------------------------------------------------------------------------
FLEX_VALUES = {"flex-start": "flex-start", "start": "flex-start", "left": "flex-start",
               "center": "center", "flex-end": "flex-end", "end": "flex-end", "right": "flex-end",
               "space-between": "space-between", "space-around": "space-around",
               "space-evenly": "space-evenly", "stretch": "stretch"}


def grid_tracks(value: Optional[str]) -> Optional[int]:
    if not value or value == "none":
        return None
    m = re.match(r"repeat\(\s*(\d+)\s*,", value.strip())
    if m:
        return int(m.group(1))
    if "auto-fit" in value or "auto-fill" in value:
        return None
    tracks = [t for t in re.split(r"\s+(?![^(]*\))", value.strip()) if t]
    return len(tracks) or None


def container(style: dict, is_child: bool) -> dict:
    s: dict = {}
    display = style.get("display", "block")
    if display in ("grid", "inline-grid"):
        cols = grid_tracks(style.get("grid-template-columns"))
        s["container_type"] = "grid"
        s["grid_columns_grid"] = {"unit": "fr", "size": cols or 3, "sizes": []}
        rows = grid_tracks(style.get("grid-template-rows"))
        if rows:
            s["grid_rows_grid"] = {"unit": "fr", "size": rows, "sizes": []}
        g = _gap(style)
        s["grid_gaps"] = g
        ai = FLEX_VALUES.get(style.get("align-items", ""))
        if ai:
            s["grid_align_items"] = "start" if ai == "flex-start" else "end" if ai == "flex-end" else ai
        ji = FLEX_VALUES.get(style.get("justify-items", ""))
        if ji:
            s["grid_justify_items"] = "start" if ji == "flex-start" else "end" if ji == "flex-end" else ji
    else:
        flex = display in ("flex", "inline-flex")
        direction = style.get("flex-direction", "row") if flex else "column"
        s["flex_direction"] = direction
        s["flex_gap"] = _gap(style) if flex else _zero_gap()
        jc = FLEX_VALUES.get(style.get("justify-content", ""))
        if jc and flex:
            s["flex_justify_content"] = jc
        ai = FLEX_VALUES.get(style.get("align-items", ""))
        if ai and flex:
            s["flex_align_items"] = ai
        elif not flex:
            ta = text_align(style)
            if ta == "center":
                s["flex_align_items"] = "center"
        if flex and style.get("flex-wrap") in ("wrap", "nowrap"):
            s["flex_wrap"] = style["flex-wrap"]
    pad = dims(style, "padding") or {"unit": "px", "top": "0", "right": "0", "bottom": "0", "left": "0", "isLinked": True}
    s["padding"] = pad
    margin = dims(style, "margin")
    if margin and any(margin[k] not in ("", "0") for k in ("top", "right", "bottom", "left")):
        s["margin"] = margin
    mh = size(style.get("min-height"))
    if mh:
        s["min_height"] = mh
    s.update(background(style))
    s.update(border(style))
    r = radius(style)
    if r:
        s["border_radius"] = r
    s.update(box_shadow(style.get("box-shadow")))
    w = size(style.get("width"))
    mw = size(style.get("max-width"))
    centered = style.get("margin-left") == "auto" and style.get("margin-right") == "auto"
    if mw and mw["unit"] == "px" and (centered or not is_child):
        s["content_width"] = "boxed"
        s["boxed_width"] = mw
    else:
        s["content_width"] = "full"
        if is_child:
            basis = size(style.get("flex-basis"))
            pick = w if w and w["unit"] in ("%", "px", "vw") else basis if basis and basis["unit"] == "%" else mw
            if pick:
                s["width"] = pick
    if style.get("overflow") == "hidden":
        s["overflow"] = "hidden"
    if style.get("position") in ("sticky",):
        s["sticky"] = "top"
    return s


def _gap(style: dict) -> dict:
    row = size(style.get("row-gap"))
    col = size(style.get("column-gap"))
    if not row and not col:
        return _zero_gap()
    unit = (col or row)["unit"]
    r = str((row or col)["size"])
    c = str((col or row)["size"])
    return {"column": c, "row": r, "isLinked": r == c, "unit": unit, "size": float(c) if "." in c else int(c)}


def _zero_gap() -> dict:
    return {"column": "0", "row": "0", "isLinked": True, "unit": "px", "size": 0}


def widget_box(style: dict) -> dict:
    """Advanced-tab settings shared by every widget (margin, padding, background, border)."""
    s: dict = {}
    pad = dims(style, "padding")
    if pad and any(pad[k] not in ("", "0") for k in ("top", "right", "bottom", "left")):
        s["_padding"] = pad
    margin = dims(style, "margin")
    if margin and any(margin[k] not in ("", "0") for k in ("top", "right", "bottom", "left")):
        s["_margin"] = margin
    s.update(background(style, "_background"))
    s.update(border(style, "_border"))
    r = radius(style)
    if r and any(r[k] not in ("", "0") for k in ("top", "right", "bottom", "left")):
        s["_border_radius"] = r
    s.update(box_shadow(style.get("box-shadow"), "_box_shadow"))
    mw = size(style.get("max-width"))
    if mw and mw["unit"] in ("px", "%"):
        s["_element_width"] = "initial"
        s["_element_custom_width"] = mw
    return s
