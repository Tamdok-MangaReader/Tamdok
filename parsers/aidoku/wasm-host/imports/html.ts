import type { FFIResult, WasmEnv } from '../env';
import * as dom from '../html-dom';

enum HtmlResult {
  InvalidDescriptor = -1,
  InvalidString = -2,
  InvalidQuery = -4,
  NoResult = -5,
}

enum Kind {
  Unknown = 0,
  Node = 1,
  TextNode = 2,
  Comment = 4,
  Element = 5,
  ElementList = 6,
  Document = 7,
}

// DOM helpers for Aidoku sources that scrape HTML in WASM.
export function createHtmlImports(env: WasmEnv) {
  return {
    parse: (htmlPtr: number, htmlLen: number, baseUrlPtr: number, baseUrlLen: number): FFIResult => {
      try {
        const text = env.readString(htmlPtr, htmlLen);
        const baseUrl = env.readString(baseUrlPtr, baseUrlLen);
        const document = dom.createDocument(text, baseUrl || undefined);
        return env.store.store({ kind: 'htmlDocument', value: document });
      } catch {
        return HtmlResult.InvalidString;
      }
    },
    parse_fragment: (htmlPtr: number, htmlLen: number, baseUrlPtr: number, baseUrlLen: number): FFIResult => {
      try {
        const text = env.readString(htmlPtr, htmlLen);
        const baseUrl = env.readString(baseUrlPtr, baseUrlLen);
        const document = dom.createFragment(text, baseUrl || undefined);
        return env.store.store({ kind: 'htmlDocument', value: document });
      } catch {
        return HtmlResult.InvalidString;
      }
    },
    escape: (textPtr: number, textLen: number): FFIResult => {
      try {
        const text = env.readString(textPtr, textLen);
        return env.store.store({ kind: 'string', value: dom.escapeHtml(text) });
      } catch {
        return HtmlResult.InvalidString;
      }
    },
    unescape: (textPtr: number, textLen: number): FFIResult => {
      try {
        const text = env.readString(textPtr, textLen);
        return env.store.store({ kind: 'string', value: dom.unescapeHtml(text) });
      } catch {
        return HtmlResult.InvalidString;
      }
    },
    kind: (rid: number): FFIResult => {
      const item = env.store.get(rid);
      if (!item) return HtmlResult.InvalidDescriptor;
      if (item.kind === 'htmlElement') {
        return dom.isElement(item.value) ? Kind.Element : Kind.Node;
      }
      if (item.kind === 'htmlNode') {
        if (dom.isElement(item.value)) return Kind.Element;
        if (dom.isComment(item.value)) return Kind.Comment;
        if (dom.isText(item.value)) return Kind.TextNode;
        if (dom.isDocument(item.value)) return Kind.Document;
        return Kind.Node;
      }
      if (item.kind === 'htmlDocument') return Kind.Document;
      if (item.kind === 'htmlElementList') return Kind.ElementList;
      return Kind.Unknown;
    },
    child_nodes: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind === 'htmlNode' || item?.kind === 'htmlElement') {
        const nodes = dom.childNodes(item.value);
        return env.store.store({ kind: 'htmlNodeList', value: nodes });
      }
      return HtmlResult.InvalidDescriptor;
    },
    has_attr: (rid: number, attrPtr: number, attrLen: number): number => {
      try {
        const attr = env.readString(attrPtr, attrLen);
        const item = env.store.getMut(rid);
        if (item?.kind !== 'htmlElement') return HtmlResult.InvalidDescriptor;
        return dom.hasAttr(item.value, attr) ? 1 : 0;
      } catch {
        return HtmlResult.InvalidString;
      }
    },
    set_attr: () => HtmlResult.InvalidDescriptor,
    remove_attr: () => HtmlResult.InvalidDescriptor,
    set_text: () => HtmlResult.InvalidDescriptor,
    set_html: () => HtmlResult.InvalidDescriptor,
    prepend: () => HtmlResult.InvalidDescriptor,
    append: () => HtmlResult.InvalidDescriptor,
    children: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind !== 'htmlElement') return HtmlResult.InvalidDescriptor;
      const children = dom.elementChildNodes(item.value);
      if (children.length === 0) return HtmlResult.NoResult;
      return env.store.store({ kind: 'htmlElementList', value: children });
    },
    base_uri: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind !== 'htmlElement') return HtmlResult.InvalidDescriptor;
      if (!item.value.baseUri) return HtmlResult.NoResult;
      return env.store.store({ kind: 'string', value: item.value.baseUri });
    },
    own_text: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind !== 'htmlElement') return HtmlResult.InvalidDescriptor;
      const text = dom.ownText(item.value);
      if (text == null) return HtmlResult.NoResult;
      return env.store.store({ kind: 'string', value: text });
    },
    data: () => HtmlResult.InvalidDescriptor,
    id: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind !== 'htmlElement') return HtmlResult.InvalidDescriptor;
      const id = dom.elementId(item.value);
      if (!id) return HtmlResult.NoResult;
      return env.store.store({ kind: 'string', value: id });
    },
    tag_name: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind !== 'htmlElement') return HtmlResult.InvalidDescriptor;
      return env.store.store({ kind: 'string', value: dom.tagName(item.value) });
    },
    class_name: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind !== 'htmlElement') return HtmlResult.InvalidDescriptor;
      return env.store.store({ kind: 'string', value: dom.className(item.value) });
    },
    has_class: (rid: number, classPtr: number, classLen: number): number => {
      try {
        const className = env.readString(classPtr, classLen);
        const item = env.store.getMut(rid);
        if (item?.kind !== 'htmlElement') return HtmlResult.InvalidDescriptor;
        return dom.hasClass(item.value, className) ? 1 : 0;
      } catch {
        return HtmlResult.InvalidString;
      }
    },
    add_class: () => HtmlResult.InvalidDescriptor,
    remove_class: () => HtmlResult.InvalidDescriptor,
    parent: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind === 'htmlElement') {
        const parent = dom.parentNode(item.value);
        if (!parent || !dom.isElement(parent)) return HtmlResult.NoResult;
        return env.store.store({ kind: 'htmlElement', value: parent });
      }
      if (item?.kind === 'htmlNode') {
        const parent = dom.parentNode(item.value);
        if (!parent) return HtmlResult.NoResult;
        return env.store.store({ kind: 'htmlNode', value: parent });
      }
      return HtmlResult.InvalidDescriptor;
    },
    siblings: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind === 'htmlElement') {
        const siblings = dom.elementChildNodes(item.value);
        return env.store.store({ kind: 'htmlElementList', value: siblings });
      }
      if (item?.kind === 'htmlNode') {
        return env.store.store({ kind: 'htmlNodeList', value: dom.siblingNodes(item.value) });
      }
      return HtmlResult.InvalidDescriptor;
    },
    next: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind === 'htmlElement' || item?.kind === 'htmlNode') {
        const next = dom.nextNode(item.value);
        if (!next) return HtmlResult.NoResult;
        if (item.kind === 'htmlElement' && dom.isElement(next)) {
          return env.store.store({ kind: 'htmlElement', value: next });
        }
        return env.store.store({ kind: 'htmlNode', value: next });
      }
      return HtmlResult.InvalidDescriptor;
    },
    previous: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind === 'htmlElement' || item?.kind === 'htmlNode') {
        const prev = dom.previousNode(item.value);
        if (!prev) return HtmlResult.NoResult;
        if (item.kind === 'htmlElement' && dom.isElement(prev)) {
          return env.store.store({ kind: 'htmlElement', value: prev });
        }
        return env.store.store({ kind: 'htmlNode', value: prev });
      }
      return HtmlResult.InvalidDescriptor;
    },
    first: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind !== 'htmlElementList' || item.value.length === 0) return HtmlResult.InvalidDescriptor;
      return env.store.store({ kind: 'htmlElement', value: item.value[0]! });
    },
    last: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind !== 'htmlElementList' || item.value.length === 0) return HtmlResult.InvalidDescriptor;
      return env.store.store({ kind: 'htmlElement', value: item.value[item.value.length - 1]! });
    },
    get: (rid: number, index: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind === 'htmlElementList') {
        const element = item.value[index];
        if (!element) return HtmlResult.InvalidDescriptor;
        return env.store.store({ kind: 'htmlElement', value: element });
      }
      if (item?.kind === 'htmlNodeList') {
        const node = item.value[index];
        if (!node) return HtmlResult.InvalidDescriptor;
        return env.store.store({ kind: 'htmlNode', value: node });
      }
      return HtmlResult.InvalidDescriptor;
    },
    size: (rid: number): FFIResult => {
      const item = env.store.get(rid);
      if (item?.kind === 'htmlElementList') return item.value.length;
      if (item?.kind === 'htmlNodeList') return item.value.length;
      return HtmlResult.InvalidDescriptor;
    },
    attr: (rid: number, keyPtr: number, keyLen: number): FFIResult => {
      try {
        const key = env.readString(keyPtr, keyLen);
        const item = env.store.getMut(rid);
        let value: string | null = null;
        if (item?.kind === 'htmlElement') {
          value = dom.attr(item.value, key);
        } else if (item?.kind === 'htmlElementList') {
          for (const element of item.value) {
            const attr = dom.attr(element, key);
            if (attr) {
              value = attr;
              break;
            }
          }
        } else {
          return HtmlResult.InvalidDescriptor;
        }
        if (!value) return HtmlResult.NoResult;
        return env.store.store({ kind: 'string', value });
      } catch {
        return HtmlResult.InvalidString;
      }
    },
    outer_html: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind === 'htmlElement') {
        return env.store.store({ kind: 'string', value: dom.outerHtml(item.value) });
      }
      if (item?.kind === 'htmlElementList') {
        const html = item.value.map((element) => dom.outerHtml(element)).join('\n');
        return env.store.store({ kind: 'string', value: html });
      }
      return HtmlResult.InvalidDescriptor;
    },
    remove: () => HtmlResult.InvalidDescriptor,
    select: (rid: number, queryPtr: number, queryLen: number): FFIResult => {
      try {
        const selector = env.readString(queryPtr, queryLen);
        const item = env.store.getMut(rid);
        if (item?.kind === 'htmlDocument') {
          const elements = dom.selectElements(item.value, selector);
          return env.store.store({ kind: 'htmlElementList', value: elements });
        }
        if (item?.kind === 'htmlElement') {
          const elements = dom.selectElements(item.value, selector);
          if (elements.length === 0) return HtmlResult.NoResult;
          return env.store.store({ kind: 'htmlElementList', value: elements });
        }
        if (item?.kind === 'htmlElementList') {
          const elements = item.value.flatMap((element) => dom.selectElements(element, selector));
          if (elements.length === 0) return HtmlResult.NoResult;
          return env.store.store({ kind: 'htmlElementList', value: elements });
        }
        return HtmlResult.InvalidDescriptor;
      } catch {
        return HtmlResult.InvalidQuery;
      }
    },
    select_first: (rid: number, queryPtr: number, queryLen: number): FFIResult => {
      try {
        const selector = env.readString(queryPtr, queryLen);
        const item = env.store.getMut(rid);
        if (item?.kind === 'htmlDocument') {
          const element = dom.selectFirstElement(item.value, selector);
          if (!element) return HtmlResult.NoResult;
          return env.store.store({ kind: 'htmlElement', value: element });
        }
        if (item?.kind === 'htmlElement') {
          const element = dom.selectFirstElement(item.value, selector);
          if (!element) return HtmlResult.NoResult;
          return env.store.store({ kind: 'htmlElement', value: element });
        }
        if (item?.kind === 'htmlElementList') {
          for (const element of item.value) {
            const found = dom.selectFirstElement(element, selector);
            if (found) return env.store.store({ kind: 'htmlElement', value: found });
          }
          return HtmlResult.NoResult;
        }
        return HtmlResult.InvalidDescriptor;
      } catch {
        return HtmlResult.InvalidQuery;
      }
    },
    text: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind === 'htmlElement') {
        return env.store.store({ kind: 'string', value: dom.elementText(item.value, true) });
      }
      if (item?.kind === 'htmlNode') {
        const text = dom.nodeText(item.value);
        if (text == null) return HtmlResult.NoResult;
        return env.store.store({ kind: 'string', value: text });
      }
      if (item?.kind === 'htmlElementList') {
        const text = item.value.map((element) => dom.elementText(element, true)).join(' ');
        return env.store.store({ kind: 'string', value: text });
      }
      return HtmlResult.InvalidDescriptor;
    },
    untrimmed_text: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind === 'htmlElement') {
        return env.store.store({ kind: 'string', value: dom.elementText(item.value, false) });
      }
      if (item?.kind === 'htmlElementList') {
        const text = item.value.map((element) => dom.elementText(element, false)).join(' ');
        return env.store.store({ kind: 'string', value: text });
      }
      return HtmlResult.InvalidDescriptor;
    },
    html: (rid: number): FFIResult => {
      const item = env.store.getMut(rid);
      if (item?.kind === 'htmlElement') {
        return env.store.store({ kind: 'string', value: dom.innerHtml(item.value) });
      }
      if (item?.kind === 'htmlElementList') {
        const html = item.value.map((element) => dom.innerHtml(element)).join('\n');
        return env.store.store({ kind: 'string', value: html });
      }
      return HtmlResult.InvalidDescriptor;
    },
  };
}
