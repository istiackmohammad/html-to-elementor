import json
from pathlib import Path

from html_to_elementor import Options, convert, to_template
from html_to_elementor.css import Stylesheet, StyleEngine
from html_to_elementor.dom import parse

EXAMPLE = Path(__file__).resolve().parent.parent / "examples" / "landing.html"


def run(html, **kw):
    elements, page_settings, report = convert(html, Options(seed=1, **kw))
    return elements, page_settings, report


def walk(nodes):
    for n in nodes:
        yield n
        yield from walk(n["elements"])


def widgets(nodes, kind):
    return [n for n in walk(nodes) if n.get("widgetType") == kind]


# ---------------------------------------------------------------- css engine
def computed(html, selector_tag, vp="desktop"):
    doc = parse(html)
    sheet = Stylesheet()
    for st in doc.find_all("style"):
        sheet.add(st.text())
    return StyleEngine(sheet).computed(doc.find(selector_tag), vp)


def test_specificity_and_inline_order():
    html = """<style>p{color:red} .a{color:green} #x{color:blue} p{color:black}</style>
              <p id="x" class="a" style="font-size:20px">t</p>"""
    st = computed(html, "p")
    assert st["color"] == "blue"
    assert st["font-size"] == "20px"


def test_important_beats_inline():
    st = computed('<style>p{color:red !important}</style><p style="color:blue">t</p>', "p")
    assert st["color"] == "red"


def test_css_variables_and_inheritance():
    html = "<style>:root{--c:#123456} body{color:var(--c)} .x{padding:var(--p, 8px)}</style><body><p class=x>t</p></body>"
    st = computed(html, "p")
    assert st["color"] == "#123456"
    assert st["padding-top"] == "8px" and st["padding-left"] == "8px"


def test_media_queries_by_viewport():
    html = "<style>h1{font-size:50px} @media (max-width:1024px){h1{font-size:40px}} @media (max-width:767px){h1{font-size:30px}}</style><h1>t</h1>"
    assert computed(html, "h1", "desktop")["font-size"] == "50px"
    assert computed(html, "h1", "tablet")["font-size"] == "40px"
    assert computed(html, "h1", "mobile")["font-size"] == "30px"


def test_mobile_first_media_queries():
    html = "<style>h1{font-size:30px} @media (min-width:768px){h1{font-size:40px}} @media (min-width:1025px){h1{font-size:50px}}</style><h1>t</h1>"
    assert computed(html, "h1", "mobile")["font-size"] == "30px"
    assert computed(html, "h1", "tablet")["font-size"] == "40px"
    assert computed(html, "h1", "desktop")["font-size"] == "50px"


def test_descendant_and_child_combinators():
    html = "<style>.a > p{color:red} .a span{color:blue}</style><div class=a><p><span>t</span></p></div>"
    assert computed(html, "p")["color"] == "red"
    assert computed(html, "span")["color"] == "blue"


# ---------------------------------------------------------------- converter
def test_heading_text_and_responsive_font_size():
    html = """<style>h1{font-size:48px;color:#111} @media (max-width:767px){h1{font-size:32px}}</style>
              <section><h1>Hello <em>world</em></h1><p>Body copy</p></section>"""
    els, _, _ = run(html)
    h = widgets(els, "heading")[0]["settings"]
    assert h["title"] == "Hello <em>world</em>"
    assert h["header_size"] == "h1"
    assert h["title_color"] == "#111"
    assert h["typography_font_size"]["size"] == 48
    assert h["typography_font_size_mobile"]["size"] == 32
    assert "typography_font_size_tablet" not in h
    assert widgets(els, "text-editor")[0]["settings"]["editor"] == "<p>Body copy</p>"


def test_buttons_detected_with_hover_and_row_layout():
    html = """<style>.row{display:flex;gap:12px;justify-content:center}
              .btn{background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px}
              .btn:hover{background:#3730a3}</style>
              <section><div class=row><a class=btn href="/a">One</a><a class=btn href="/b">Two</a></div></section>"""
    els, _, _ = run(html)
    buttons = widgets(els, "button")
    assert [b["settings"]["text"] for b in buttons] == ["One", "Two"]
    b = buttons[0]["settings"]
    assert b["background_color"] == "#4f46e5"
    assert b["button_background_hover_color"] == "#3730a3"
    assert b["text_padding"]["top"] == "12" and b["text_padding"]["left"] == "24"
    row = next(n for n in walk(els) if n["elType"] == "container" and n["settings"].get("flex_direction") == "row")
    assert row["settings"]["flex_justify_content"] == "center"
    assert row["settings"]["flex_gap"]["size"] == 12


def test_grid_columns_per_breakpoint():
    html = """<style>.g{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
              @media (max-width:767px){.g{grid-template-columns:1fr}}</style>
              <section><div class=g><div><h3>a</h3></div><div><h3>b</h3></div><div><h3>c</h3></div></div></section>"""
    els, _, _ = run(html)
    grid = next(n for n in walk(els) if n["settings"].get("container_type") == "grid")
    assert grid["settings"]["grid_columns_grid"]["size"] == 3
    assert grid["settings"]["grid_columns_grid_mobile"]["size"] == 1
    assert len(grid["elements"]) == 3


def test_wrapper_collapses_into_boxed_container():
    html = """<style>.wrap{max-width:1200px;margin:0 auto;padding:0 20px} section{padding:80px 0;background:#eee}</style>
              <section><div class=wrap><h2>t</h2></div></section>"""
    els, _, _ = run(html)
    sec = els[0]["settings"]
    assert sec["content_width"] == "boxed" and sec["boxed_width"]["size"] == 1200
    assert sec["padding"]["top"] == "80" and sec["padding"]["left"] == "20"
    assert els[0]["elements"][0]["widgetType"] == "heading"


def test_nav_list_becomes_inline_icon_list_hidden_on_mobile():
    html = """<style>.nav{display:flex;gap:20px;list-style:none} @media (max-width:767px){.nav{display:none}}</style>
              <header><ul class=nav><li><a href="#a">A</a></li><li><a href="#b">B</a></li></ul></header>"""
    els, _, _ = run(html)
    il = widgets(els, "icon-list")[0]["settings"]
    assert il["view"] == "inline"
    assert [i["link"]["url"] for i in il["icon_list"]] == ["#a", "#b"]
    assert il["hide_mobile"] == "hidden-mobile"


def test_media_and_icons():
    html = """<section><img src="/img/a.jpg" alt="A"><i class="fa-solid fa-star"></i><hr>
              <iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe></section>"""
    els, _, _ = run(html, base_url="https://cdn.example.com")
    assert widgets(els, "image")[0]["settings"]["image"]["url"] == "https://cdn.example.com/img/a.jpg"
    assert widgets(els, "icon")[0]["settings"]["selected_icon"] == {"value": "fas fa-star", "library": "fa-solid"}
    assert widgets(els, "divider")
    assert widgets(els, "video")[0]["settings"]["youtube_url"].endswith("abcdefghijk")


def test_unsupported_markup_falls_back_to_html_widget():
    html = "<section><form><input name=q><button>Go</button></form><table><tr><td>1</td></tr></table></section>"
    els, _, report = run(html)
    assert len(widgets(els, "html")) == 2
    assert report.html_fallbacks == ["form", "table"]


def test_top_level_is_containers_with_unique_ids():
    els, ps, _ = run("<h1>Loose heading</h1><p>loose text</p>")
    assert all(n["elType"] == "container" and n["isInner"] is False for n in els)
    ids = [n["id"] for n in walk(els)]
    assert len(ids) == len(set(ids))
    assert ps["template"] == "elementor_canvas"


def test_keep_css_embeds_stylesheet_and_classes():
    els, _, _ = run("<style>.a{color:red}</style><section class=a><h2>t</h2></section>", keep_css=True)
    first = els[0]["elements"][0]
    assert first["widgetType"] == "html" and ".a{color:red}" in first["settings"]["html"]
    assert els[0]["settings"]["css_classes"] == "a"


def test_template_format():
    els, ps, _ = run("<section><h2>t</h2></section>")
    tpl = to_template(els, ps, "My page")
    assert set(tpl) == {"content", "page_settings", "version", "title", "type"}
    json.dumps(tpl)


def test_example_landing_page_converts_cleanly():
    els, _, report = run(EXAMPLE.read_text(encoding="utf-8"))
    assert report.html_fallbacks == []
    assert report.warnings == []
    assert len(widgets(els, "button")) == 3
    assert len(widgets(els, "heading")) == 7
    footer = els[-1]
    assert footer["settings"]["html_tag"] == "footer"
