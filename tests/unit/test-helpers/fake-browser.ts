import { vi } from "vitest";

export const DOCUMENT_POSITION_PRECEDING = 0x02;

type EventListener = (event: any) => void;

class FakeEventTarget {
  private readonly listeners = new Map<string, EventListener[]>();

  addEventListener(type: string, listener: EventListener): void {
    const existingListeners = this.listeners.get(type) ?? [];

    existingListeners.push(listener);
    this.listeners.set(type, existingListeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    const existingListeners = this.listeners.get(type) ?? [];
    const nextListeners = existingListeners.filter(
      (registeredListener) => registeredListener !== listener,
    );

    if (nextListeners.length === 0) {
      this.listeners.delete(type);
      return;
    }

    this.listeners.set(type, nextListeners);
  }

  dispatch(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

export class FakeNode extends FakeEventTarget {
  parentNode: FakeParentNode | undefined;

  get isConnected(): boolean {
    return this.parentNode !== undefined && this.parentNode.isConnected;
  }

  get nextSibling(): FakeNode | null {
    const siblings = this.parentNode?.childNodes ?? [];
    const currentIndex = siblings.indexOf(this);

    if (currentIndex < 0 || currentIndex + 1 >= siblings.length) {
      return null;
    }

    return siblings[currentIndex + 1] ?? null;
  }

  before(node: FakeNode): void {
    this.parentNode?.insertBefore(node, this);
  }

  compareDocumentPosition(otherNode: FakeNode): number {
    if (this.parentNode === undefined || this.parentNode !== otherNode.parentNode) {
      return 0;
    }

    const siblings = this.parentNode.childNodes;

    return siblings.indexOf(this) > siblings.indexOf(otherNode) ? DOCUMENT_POSITION_PRECEDING : 0;
  }

  remove(): void {
    if (this.parentNode === undefined) {
      return;
    }

    const currentIndex = this.parentNode.childNodes.indexOf(this);

    if (currentIndex >= 0) {
      this.parentNode.childNodes.splice(currentIndex, 1);
    }

    this.parentNode = undefined;
  }
}

class FakeParentNode extends FakeNode {
  readonly childNodes: FakeNode[] = [];

  append(child: FakeNode): void {
    this.insertBefore(child, null);
  }

  appendChild(child: FakeNode): void {
    this.insertBefore(child, null);
  }

  insertBefore(child: FakeNode, referenceNode: FakeNode | null): void {
    const insertionIndex =
      referenceNode === null ? this.childNodes.length : this.childNodes.indexOf(referenceNode);

    this.insertAt(child, insertionIndex < 0 ? this.childNodes.length : insertionIndex);
  }

  prepend(child: FakeNode): void {
    this.insertAt(child, 0);
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const matches: FakeElement[] = [];

    for (const childNode of this.childNodes) {
      if (!(childNode instanceof FakeElement)) {
        continue;
      }

      if (matchesSelector(childNode, selector)) {
        matches.push(childNode);
      }

      matches.push(...childNode.querySelectorAll(selector));
    }

    return matches;
  }

  private insertAt(child: FakeNode, insertionIndex: number): void {
    if (child instanceof FakeDocumentFragment) {
      const fragmentChildren = [...child.childNodes];

      for (const [offset, fragmentChild] of fragmentChildren.entries()) {
        fragmentChild.remove();
        this.insertAt(fragmentChild, insertionIndex + offset);
      }

      return;
    }

    child.remove();
    child.parentNode = this;
    this.childNodes.splice(insertionIndex, 0, child);
  }
}

export class FakeElement extends FakeParentNode {
  readonly attributes = new Map<string, string>();
  innerHTML = "";
  readonly tagName: string;

  constructor(tagName: string) {
    super();
    this.tagName = tagName;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  closest(selector: string): FakeElement | null {
    if (matchesSelector(this, selector)) {
      return this;
    }

    return this.parentNode instanceof FakeElement ? this.parentNode.closest(selector) : null;
  }
}

export class FakeHTMLElement extends FakeElement {}

export class FakeHTMLAnchorElement extends FakeHTMLElement {
  get href(): string {
    return this.getAttribute("href") ?? "";
  }

  set href(value: string) {
    this.setAttribute("href", value);
  }

  get target(): string {
    return this.getAttribute("target") ?? "";
  }

  set target(value: string) {
    this.setAttribute("target", value);
  }
}

export class FakeHTMLFormElement extends FakeHTMLElement {
  get action(): string {
    return this.getAttribute("action") ?? "";
  }

  set action(value: string) {
    this.setAttribute("action", value);
  }

  get method(): string {
    return this.getAttribute("method") ?? "";
  }

  set method(value: string) {
    this.setAttribute("method", value);
  }
}

export class FakeHTMLLinkElement extends FakeHTMLElement {
  sheet: object | null = null;

  get href(): string {
    return this.getAttribute("href") ?? "";
  }

  set href(value: string) {
    this.setAttribute("href", value);
  }

  get rel(): string {
    return this.getAttribute("rel") ?? "";
  }

  set rel(value: string) {
    this.setAttribute("rel", value);
  }
}

export class FakeHTMLMetaElement extends FakeHTMLElement {
  get content(): string {
    return this.getAttribute("content") ?? "";
  }

  set content(value: string) {
    this.setAttribute("content", value);
  }

  get name(): string {
    return this.getAttribute("name") ?? "";
  }

  set name(value: string) {
    this.setAttribute("name", value);
  }
}

export class FakeHTMLScriptElement extends FakeHTMLElement {
  get src(): string {
    return this.getAttribute("src") ?? "";
  }

  set src(value: string) {
    this.setAttribute("src", value);
  }

  get type(): string {
    return this.getAttribute("type") ?? "";
  }

  set type(value: string) {
    this.setAttribute("type", value);
  }
}

class FakeMarkupNode extends FakeNode {
  readonly markup: string;

  constructor(markup: string) {
    super();
    this.markup = markup;
  }
}

class FakeDocumentFragment extends FakeParentNode {}

class FakeConnectedRoot extends FakeParentNode {
  get isConnected(): boolean {
    return true;
  }
}

export class FakeDocument extends FakeEventTarget {
  readonly body = new FakeHTMLElement("body");
  readonly documentElement = new FakeHTMLElement("html");
  readonly head = new FakeHTMLElement("head");
  writtenMarkup = "";

  constructor() {
    super();
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    const rootNode = new FakeConnectedRoot();

    rootNode.appendChild(this.documentElement);
  }

  createElement(tagName: string): FakeElement {
    const normalizedTagName = tagName.toLowerCase();

    if (normalizedTagName === "a") {
      return new FakeHTMLAnchorElement(normalizedTagName);
    }

    if (normalizedTagName === "form") {
      return new FakeHTMLFormElement(normalizedTagName);
    }

    if (normalizedTagName === "link") {
      return new FakeHTMLLinkElement(normalizedTagName);
    }

    if (normalizedTagName === "meta") {
      return new FakeHTMLMetaElement(normalizedTagName);
    }

    if (normalizedTagName === "script") {
      return new FakeHTMLScriptElement(normalizedTagName);
    }

    return new FakeHTMLElement(normalizedTagName);
  }

  createRange(): {
    createContextualFragment: (markup: string) => FakeDocumentFragment;
    selectNode: (_node: FakeElement) => void;
  } {
    return {
      createContextualFragment(markup) {
        const fragment = new FakeDocumentFragment();

        fragment.appendChild(new FakeMarkupNode(markup));
        return fragment;
      },
      selectNode() {},
    };
  }

  open(): void {
    this.writtenMarkup = "";
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === "html") {
      return this.documentElement;
    }

    return this.documentElement.querySelector(selector);
  }

  write(markup: string): void {
    this.writtenMarkup += markup;
  }

  close(): void {}
}

export class FakeLocation {
  assignCalls: string[] = [];
  reloadCalls = 0;
  replaceCalls: string[] = [];
  private currentUrl: URL;

  constructor(initialHref: string) {
    this.currentUrl = new URL(initialHref);
  }

  get hash(): string {
    return this.currentUrl.hash;
  }

  set hash(value: string) {
    this.currentUrl.hash = value;
  }

  get href(): string {
    return this.currentUrl.href;
  }

  get origin(): string {
    return this.currentUrl.origin;
  }

  get pathname(): string {
    return this.currentUrl.pathname;
  }

  get search(): string {
    return this.currentUrl.search;
  }

  assign(nextUrl: string): void {
    this.assignCalls.push(nextUrl);
    this.currentUrl = new URL(nextUrl, this.currentUrl);
  }

  reload(): void {
    this.reloadCalls += 1;
  }

  replace(nextUrl: string): void {
    this.replaceCalls.push(nextUrl);
    this.currentUrl = new URL(nextUrl, this.currentUrl);
  }

  update(nextUrl: string): void {
    this.currentUrl = new URL(nextUrl, this.currentUrl);
  }
}

class FakeHistory {
  readonly pushCalls: string[] = [];
  readonly replaceCalls: string[] = [];
  private readonly location: FakeLocation;

  constructor(location: FakeLocation) {
    this.location = location;
  }

  pushState(_state: unknown, _title: string, nextUrl: string): void {
    this.pushCalls.push(nextUrl);
    this.location.update(nextUrl);
  }

  replaceState(_state: unknown, _title: string, nextUrl: string): void {
    this.replaceCalls.push(nextUrl);
    this.location.update(nextUrl);
  }
}

export class FakeNavigationApi extends FakeEventTarget {
  readonly navigate = vi.fn<(url: string) => void>();
}

export class FakeWindow extends FakeEventTarget {
  readonly history: FakeHistory;
  readonly location: FakeLocation;
  navigation?: FakeNavigationApi;

  constructor(initialHref: string) {
    super();
    this.location = new FakeLocation(initialHref);
    this.history = new FakeHistory(this.location);
  }

  setTimeout(callback: () => void, _delay: number): number {
    callback();
    return 1;
  }
}

export function createFakeBrowser(initialHref = "http://example.com/"): {
  document: FakeDocument;
  window: FakeWindow;
} {
  return {
    document: new FakeDocument(),
    window: new FakeWindow(initialHref),
  };
}

export function describeNode(node: FakeNode): string {
  if (node instanceof FakeMarkupNode) {
    return `markup:${node.markup}`;
  }

  if (node instanceof FakeElement) {
    const attributeText = [...node.attributes.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join(",");

    return `${node.tagName}${attributeText.length === 0 ? "" : `[${attributeText}]`}`;
  }

  return "node";
}

export function flushTasks(): Promise<void> {
  return Promise.resolve().then(() => {});
}

export function stubFakeBrowserGlobals(browser: {
  document: FakeDocument;
  window: FakeWindow;
}): void {
  vi.stubGlobal("Node", {
    DOCUMENT_POSITION_PRECEDING,
  });
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("HTMLElement", FakeHTMLElement);
  vi.stubGlobal("HTMLAnchorElement", FakeHTMLAnchorElement);
  vi.stubGlobal("HTMLFormElement", FakeHTMLFormElement);
  vi.stubGlobal("HTMLLinkElement", FakeHTMLLinkElement);
  vi.stubGlobal("document", browser.document);
  vi.stubGlobal("window", browser.window);
}

function matchesSelector(element: FakeElement, selector: string): boolean {
  if (selector === "[data-route-outlet]") {
    return element.hasAttribute("data-route-outlet");
  }

  if (selector === "a[href]") {
    return element.tagName === "a" && element.hasAttribute("href");
  }

  const attributeSelectorMatch = /^([a-z]+)\[([^=\]]+)(?:="([^"]*)")?\]$/u.exec(
    selector.toLowerCase(),
  );

  if (attributeSelectorMatch === null) {
    return element.tagName === selector.toLowerCase();
  }

  const [, tagName, attributeName, expectedValue] = attributeSelectorMatch;

  if (element.tagName !== tagName || !element.hasAttribute(attributeName)) {
    return false;
  }

  return expectedValue === undefined || element.getAttribute(attributeName) === expectedValue;
}
