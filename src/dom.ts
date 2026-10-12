/**
 * A small DOM the converter walks: elements with parent links and text nodes.
 * Parsing is done by parse5 (WHATWG-compliant), so malformed real-world HTML
 * is handled the same way a browser would handle it.
 */
import { parse as parseHtml } from "parse5";

export const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);

export function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export class TextNode {
  readonly kind = "text" as const;
  constructor(public data: string, public parent: ElementNode | null = null) {}
  outerHtml(): string {
    return escapeText(this.data);
  }
}

export class ElementNode {
  readonly kind = "element" as const;
  children: Array<ElementNode | TextNode> = [];
  constructor(
    public tag: string,
    public attrs: Record<string, string> = {},
    public parent: ElementNode | null = null,
  ) {}

  get classes(): string[] {
    return (this.attrs["class"] ?? "").split(/\s+/).filter(Boolean);
  }

  get id(): string {
    return this.attrs["id"] ?? "";
  }

  elements(): ElementNode[] {
    return this.children.filter((c): c is ElementNode => c.kind === "element");
  }

  *iter(): Generator<ElementNode> {
    yield this;
    for (const c of this.children) if (c.kind === "element") yield* c.iter();
  }

  find(tag: string): ElementNode | null {
    for (const el of this.iter()) if (el.tag === tag) return el;
    return null;
  }

  findAll(tag: string): ElementNode[] {
    return [...this.iter()].filter((el) => el.tag === tag);
  }

  text(): string {
    return this.children.map((c) => (c.kind === "text" ? c.data : c.text())).join("");
  }

  innerHtml(): string {
    if (this.tag === "style" || this.tag === "script") return this.text();
    return this.children.map((c) => c.outerHtml()).join("");
  }

  outerHtml(): string {
    const attrs = Object.entries(this.attrs)
      .map(([k, v]) => (v === "" && BOOLEAN_ATTRS.has(k) ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`))
      .join("");
    if (VOID_TAGS.has(this.tag)) return `<${this.tag}${attrs}>`;
    return `<${this.tag}${attrs}>${this.innerHtml()}</${this.tag}>`;
  }
}

const BOOLEAN_ATTRS = new Set([
  "allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "defer",
  "disabled", "hidden", "loop", "multiple", "muted", "novalidate", "open", "playsinline", "readonly",
  "required", "reversed", "selected",
]);

export type DomNode = ElementNode | TextNode;

interface P5Node {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: P5Node[];
  content?: P5Node;
}

function adopt(src: P5Node, parent: ElementNode): void {
  for (const child of src.childNodes ?? []) {
    if (child.nodeName === "#text") {
      parent.children.push(new TextNode(child.value ?? "", parent));
    } else if (child.tagName) {
      const attrs: Record<string, string> = {};
      for (const a of child.attrs ?? []) attrs[a.name.toLowerCase()] = a.value;
      const el = new ElementNode(child.tagName.toLowerCase(), attrs, parent);
      parent.children.push(el);
      adopt(child.content ?? child, el);
    }
    // comments and doctypes are dropped
  }
}

/** Parse an HTML string into an element tree rooted at "#document". */
export function parse(html: string): ElementNode {
  const root = new ElementNode("#document");
  adopt(parseHtml(html) as unknown as P5Node, root);
  return root;
}
