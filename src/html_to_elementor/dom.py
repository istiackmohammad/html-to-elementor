"""A tiny DOM built on the standard library's html.parser.

Only what the converter needs: element nodes with tag, attributes, children
and parent links, plus text nodes. No external dependencies, so the converter
runs anywhere Python 3.9+ runs.
"""
from __future__ import annotations

from html import escape
from html.parser import HTMLParser
from typing import Iterator, Optional

VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}

# Tags whose open element is implicitly closed by a new sibling of the same kind.
AUTO_CLOSE = {
    "p": {"p", "div", "section", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6",
          "table", "header", "footer", "article", "aside", "nav", "form", "blockquote"},
    "li": {"li"},
    "option": {"option"},
    "tr": {"tr"},
    "td": {"td", "th", "tr"},
    "th": {"td", "th", "tr"},
}


class Text:
    __slots__ = ("data", "parent")

    def __init__(self, data: str, parent: Optional["Element"] = None):
        self.data = data
        self.parent = parent

    def outer_html(self) -> str:
        return escape(self.data, quote=False)


class Element:
    __slots__ = ("tag", "attrs", "children", "parent")

    def __init__(self, tag: str, attrs: Optional[dict] = None, parent: Optional["Element"] = None):
        self.tag = tag
        self.attrs = attrs or {}
        self.children: list = []
        self.parent = parent

    # --- convenience -----------------------------------------------------
    @property
    def classes(self) -> list[str]:
        return self.attrs.get("class", "").split()

    @property
    def id(self) -> str:
        return self.attrs.get("id", "")

    def elements(self) -> list["Element"]:
        return [c for c in self.children if isinstance(c, Element)]

    def iter(self) -> Iterator["Element"]:
        yield self
        for c in self.children:
            if isinstance(c, Element):
                yield from c.iter()

    def find(self, tag: str) -> Optional["Element"]:
        for el in self.iter():
            if el.tag == tag:
                return el
        return None

    def find_all(self, tag: str) -> list["Element"]:
        return [el for el in self.iter() if el.tag == tag]

    def text(self) -> str:
        out = []
        for c in self.children:
            out.append(c.data if isinstance(c, Text) else c.text())
        return "".join(out)

    def inner_html(self) -> str:
        return "".join(c.outer_html() for c in self.children)

    def outer_html(self) -> str:
        attrs = "".join(
            f' {k}' if v is None else f' {k}="{escape(v, quote=True)}"'
            for k, v in self.attrs.items()
        )
        if self.tag in VOID_TAGS:
            return f"<{self.tag}{attrs}>"
        return f"<{self.tag}{attrs}>{self.inner_html()}</{self.tag}>"

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Element {self.tag} {self.attrs}>"


class _Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Element("#document")
        self.stack = [self.root]

    @property
    def current(self) -> Element:
        return self.stack[-1]

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        closers = AUTO_CLOSE.get(self.current.tag)
        if closers and tag in closers:
            self.stack.pop()
        el = Element(tag, {k.lower(): v for k, v in attrs}, self.current)
        self.current.children.append(el)
        if tag not in VOID_TAGS:
            self.stack.append(el)

    def handle_startendtag(self, tag, attrs):
        tag = tag.lower()
        el = Element(tag, {k.lower(): v for k, v in attrs}, self.current)
        self.current.children.append(el)

    def handle_endtag(self, tag):
        tag = tag.lower()
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return
        # stray end tag: ignore

    def handle_data(self, data):
        if data:
            self.current.children.append(Text(data, self.current))


def parse(html: str) -> Element:
    """Parse an HTML string into an Element tree rooted at '#document'."""
    builder = _Builder()
    builder.feed(html)
    builder.close()
    return builder.root
