import { afterEach, describe, expect, it, vi } from "vitest";
import { renderManagedHead, syncManagedStylesheets } from "../../src/runtime/client/head.ts";
import {
  ELEMENTAL_HEAD_END_NAME,
  ELEMENTAL_HEAD_START_NAME,
  ELEMENTAL_MANAGED_ATTRIBUTE,
  ELEMENTAL_MANAGED_SCRIPT,
  ELEMENTAL_MANAGED_STYLESHEET,
} from "../../src/runtime/shared/browser-runtime.ts";
import {
  FakeHTMLLinkElement,
  createFakeBrowser,
  describeNode,
  stubFakeBrowserGlobals,
} from "./test-helpers/fake-browser.ts";

describe("client head helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replaces managed head content between markers while preserving managed assets", () => {
    const browser = createFakeBrowser();

    stubFakeBrowserGlobals(browser);

    const start = createMeta(browser, ELEMENTAL_HEAD_START_NAME);
    const stale = browser.document.createElement("meta");
    const end = createMeta(browser, ELEMENTAL_HEAD_END_NAME);
    const script = browser.document.createElement("script");

    stale.setAttribute("name", "stale");
    script.setAttribute(ELEMENTAL_MANAGED_ATTRIBUTE, ELEMENTAL_MANAGED_SCRIPT);
    browser.document.head.appendChild(start);
    browser.document.head.appendChild(stale);
    browser.document.head.appendChild(end);
    browser.document.head.appendChild(script);

    renderManagedHead("<title>Updated</title>");

    expect(browser.document.head.childNodes.map(describeNode)).toEqual([
      `meta[content=,name=${ELEMENTAL_HEAD_START_NAME}]`,
      "markup:<title>Updated</title>",
      `meta[content=,name=${ELEMENTAL_HEAD_END_NAME}]`,
      `script[data-elemental-managed=${ELEMENTAL_MANAGED_SCRIPT}]`,
    ]);
  });

  it("repairs reversed managed head markers before rendering", () => {
    const browser = createFakeBrowser();

    stubFakeBrowserGlobals(browser);

    const start = createMeta(browser, ELEMENTAL_HEAD_START_NAME);
    const end = createMeta(browser, ELEMENTAL_HEAD_END_NAME);

    browser.document.head.appendChild(end);
    browser.document.head.appendChild(start);

    renderManagedHead("");

    expect(browser.document.head.childNodes.map(describeNode)).toEqual([
      `meta[content=,name=${ELEMENTAL_HEAD_START_NAME}]`,
      `meta[content=,name=${ELEMENTAL_HEAD_END_NAME}]`,
    ]);
  });

  it("reuses desired stylesheets and removes obsolete links after the transition finishes", async () => {
    const browser = createFakeBrowser();

    stubFakeBrowserGlobals(browser);

    const oldStylesheet = createManagedLink(browser, "/old.css");
    const keptStylesheet = createManagedLink(browser, "/keep.css");
    const scriptAnchor = browser.document.createElement("script");

    oldStylesheet.sheet = {};
    keptStylesheet.sheet = {};
    scriptAnchor.setAttribute(ELEMENTAL_MANAGED_ATTRIBUTE, ELEMENTAL_MANAGED_SCRIPT);
    browser.document.head.appendChild(oldStylesheet);
    browser.document.head.appendChild(keptStylesheet);
    browser.document.head.appendChild(scriptAnchor);

    const pendingRemoval = syncManagedStylesheets(["/keep.css", "/fresh.css"]);
    const freshStylesheet = browser.document.head.querySelectorAll(
      `link[${ELEMENTAL_MANAGED_ATTRIBUTE}="${ELEMENTAL_MANAGED_STYLESHEET}"]`,
    )[2] as FakeHTMLLinkElement;

    freshStylesheet.dispatch("load", {});

    const removeObsoleteStylesheets = await pendingRemoval;

    expect(browser.document.head.childNodes.map(describeNode)).toEqual([
      `link[rel=stylesheet,href=/old.css,data-elemental-managed=${ELEMENTAL_MANAGED_STYLESHEET}]`,
      `link[rel=stylesheet,href=/keep.css,data-elemental-managed=${ELEMENTAL_MANAGED_STYLESHEET}]`,
      `link[rel=stylesheet,href=http://example.com/fresh.css,data-elemental-managed=${ELEMENTAL_MANAGED_STYLESHEET}]`,
      `script[data-elemental-managed=${ELEMENTAL_MANAGED_SCRIPT}]`,
    ]);

    removeObsoleteStylesheets();

    expect(browser.document.head.childNodes.map(describeNode)).toEqual([
      `link[rel=stylesheet,href=/keep.css,data-elemental-managed=${ELEMENTAL_MANAGED_STYLESHEET}]`,
      `link[rel=stylesheet,href=http://example.com/fresh.css,data-elemental-managed=${ELEMENTAL_MANAGED_STYLESHEET}]`,
      `script[data-elemental-managed=${ELEMENTAL_MANAGED_SCRIPT}]`,
    ]);
  });

  it("surfaces stylesheet load failures", async () => {
    const browser = createFakeBrowser();

    stubFakeBrowserGlobals(browser);

    const pendingRemoval = syncManagedStylesheets(["/broken.css"]);
    const brokenStylesheet = browser.document.head.querySelector(
      `link[${ELEMENTAL_MANAGED_ATTRIBUTE}="${ELEMENTAL_MANAGED_STYLESHEET}"]`,
    ) as FakeHTMLLinkElement;

    brokenStylesheet.dispatch("error", {});

    await expect(pendingRemoval).rejects.toThrow(
      "Failed to load stylesheet http://example.com/broken.css",
    );
  });
});

function createManagedLink(
  browser: ReturnType<typeof createFakeBrowser>,
  href: string,
): FakeHTMLLinkElement {
  const link = browser.document.createElement("link") as FakeHTMLLinkElement;

  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute(ELEMENTAL_MANAGED_ATTRIBUTE, ELEMENTAL_MANAGED_STYLESHEET);

  return link;
}

function createMeta(browser: ReturnType<typeof createFakeBrowser>, name: string) {
  const meta = browser.document.createElement("meta");

  meta.setAttribute("content", "");
  meta.setAttribute("name", name);

  return meta;
}
