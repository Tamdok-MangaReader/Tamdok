import { parseHTML } from 'linkedom';

import type { HtmlDocumentState, HtmlElementState, HtmlNodeState } from './env';

let nodeCounter = 1;

export function createDocument(html: string, baseUri?: string): HtmlDocumentState {
  const { document } = parseHTML(html);
  return { document, baseUri };
}

export function createFragment(html: string, baseUri?: string): HtmlDocumentState {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  return { document, baseUri };
}

export function nodeFromDocument(doc: HtmlDocumentState): HtmlNodeState {
  return {
    document: doc.document,
    node: doc.document,
    baseUri: doc.baseUri,
  };
}

export function asElement(node: HtmlNodeState): HtmlElementState | null {
  if (node.node.nodeType === 1) {
    return node;
  }
  return null;
}

export function childNodes(node: HtmlNodeState): HtmlNodeState[] {
  const children: HtmlNodeState[] = [];
  node.node.childNodes.forEach((child) => {
    children.push({
      document: node.document,
      node: child,
      baseUri: node.baseUri,
    });
  });
  return children;
}

export function elementChildNodes(element: HtmlElementState): HtmlElementState[] {
  const children: HtmlElementState[] = [];
  element.node.childNodes.forEach((child) => {
    if (child.nodeType === 1) {
      children.push({
        document: element.document,
        node: child,
        baseUri: element.baseUri,
      });
    }
  });
  return children;
}

export function parentNode(node: HtmlNodeState): HtmlNodeState | null {
  const parent = node.node.parentNode;
  if (!parent) return null;
  return { document: node.document, node: parent, baseUri: node.baseUri };
}

export function siblingNodes(node: HtmlNodeState): HtmlNodeState[] {
  const parent = node.node.parentNode;
  if (!parent) return [];
  const siblings: HtmlNodeState[] = [];
  parent.childNodes.forEach((child) => {
    siblings.push({ document: node.document, node: child, baseUri: node.baseUri });
  });
  return siblings;
}

export function nextNode(node: HtmlNodeState): HtmlNodeState | null {
  const next = node.node.nextSibling;
  if (!next) return null;
  return { document: node.document, node: next, baseUri: node.baseUri };
}

export function previousNode(node: HtmlNodeState): HtmlNodeState | null {
  const prev = node.node.previousSibling;
  if (!prev) return null;
  return { document: node.document, node: prev, baseUri: node.baseUri };
}

export function selectElements(root: HtmlDocumentState | HtmlElementState, selector: string): HtmlElementState[] {
  const scope = 'node' in root ? (root.node as Element) : root.document;
  const elements = scope.querySelectorAll(selector);
  return Array.from(elements).map((element) => ({
    document: 'document' in root && !('node' in root) ? root.document : (root as HtmlElementState).document,
    node: element,
    baseUri: root.baseUri,
  }));
}

export function selectFirstElement(root: HtmlDocumentState | HtmlElementState, selector: string): HtmlElementState | null {
  const scope = 'node' in root ? (root.node as Element) : root.document;
  const element = scope.querySelector(selector);
  if (!element) return null;
  return {
    document: 'document' in root ? root.document : (root as HtmlElementState).document,
    node: element,
    baseUri: 'baseUri' in root ? root.baseUri : (root as HtmlElementState).baseUri,
  };
}

export function attr(element: HtmlElementState, name: string): string | null {
  const hasAbsPrefix = name.startsWith('abs:');
  const attrName = hasAbsPrefix ? name.slice(4) : name;
  const el = element.node as Element;
  const value = el.getAttribute(attrName);
  if (value == null) return null;
  if (!hasAbsPrefix) return value;
  try {
    return new URL(value).toString();
  } catch {
    if (!element.baseUri) return value;
    try {
      return new URL(value, element.baseUri).toString();
    } catch {
      return value;
    }
  }
}

export function elementText(element: HtmlElementState, trimmed: boolean): string {
  const text = (element.node as Element).textContent ?? '';
  return trimmed ? text.trim() : text;
}

export function nodeText(node: HtmlNodeState): string | null {
  if (node.node.nodeType === 3) {
    return node.node.textContent ?? '';
  }
  return null;
}

export function innerHtml(element: HtmlElementState): string {
  return (element.node as Element).innerHTML;
}

export function outerHtml(element: HtmlElementState): string {
  return (element.node as Element).outerHTML;
}

export function ownText(element: HtmlElementState): string | null {
  const first = element.node.childNodes[0];
  if (!first || first.nodeType !== 3) return null;
  return first.textContent ?? '';
}

export function elementId(element: HtmlElementState): string | null {
  const id = (element.node as Element).id;
  return id || null;
}

export function tagName(element: HtmlElementState): string {
  return (element.node as Element).tagName.toLowerCase();
}

export function className(element: HtmlElementState): string {
  return (element.node as Element).className ?? '';
}

export function hasClass(element: HtmlElementState, className: string): boolean {
  return (element.node as Element).classList.contains(className);
}

export function hasAttr(element: HtmlElementState, name: string): boolean {
  return (element.node as Element).hasAttribute(name);
}

export function isElement(node: HtmlNodeState): boolean {
  return node.node.nodeType === 1;
}

export function isDocument(node: HtmlNodeState): boolean {
  return node.node.nodeType === 9;
}

export function isText(node: HtmlNodeState): boolean {
  return node.node.nodeType === 3;
}

export function isComment(node: HtmlNodeState): boolean {
  return node.node.nodeType === 8;
}

export function nextNodeId(): number {
  nodeCounter += 1;
  return nodeCounter;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function unescapeHtml(text: string): string {
  let unescaped = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '&') {
      let entity = '&';
      while (i + entity.length < text.length) {
        entity += text[i + entity.length];
        if (entity.endsWith(';') || entity.length > 10) break;
      }
      if (entity === '&amp;') unescaped += '&';
      else if (entity === '&lt;') unescaped += '<';
      else if (entity === '&gt;') unescaped += '>';
      else unescaped += entity;
      i += entity.length;
      continue;
    }
    unescaped += text[i]!;
    i += 1;
  }
  return unescaped;
}
