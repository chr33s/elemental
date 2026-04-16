import { afterEach, describe, expect, it, vi } from "vitest";
import type { BuildManifest, BuildManifestRoute } from "../../src/build/manifest.ts";
import {
  getRouteScriptAssets,
  getRouteStylesheetAssets,
  installNavigationInterceptors,
  refreshCurrentRoute,
  syncCurrentRouteStylesheets,
  type BootstrapState,
} from "../../src/runtime/client/navigation.ts";
import {
  FakeNavigationApi,
  createFakeBrowser,
  flushTasks,
  stubFakeBrowserGlobals,
} from "./test-helpers/fake-browser.ts";

describe("client navigation helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes same-origin clicks through the Navigation API when available", () => {
    const browser = createFakeBrowser();
    const anchor = browser.document.createElement("a");
    const navigation = new FakeNavigationApi();
    const preventDefault = vi.fn<() => void>();
    const state = createBootstrapState(createManifest([createRoute("/about")]));

    browser.window.navigation = navigation;
    browser.document.body.appendChild(anchor);
    anchor.setAttribute("href", "/about");
    stubFakeBrowserGlobals(browser);

    installNavigationInterceptors(state);
    browser.document.dispatch("click", createMouseEvent(anchor, preventDefault));

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(navigation.navigate).toHaveBeenCalledWith("http://example.com/about");
  });

  it("does not intercept hash-only clicks", () => {
    const browser = createFakeBrowser("http://example.com/docs?tab=1#old");
    const anchor = browser.document.createElement("a");
    const preventDefault = vi.fn<() => void>();
    const fetchMock = vi.fn<typeof fetch>();

    browser.document.body.appendChild(anchor);
    anchor.setAttribute("href", "/docs?tab=1#new");
    stubFakeBrowserGlobals(browser);
    vi.stubGlobal("fetch", fetchMock);

    installNavigationInterceptors(createBootstrapState(createManifest([])));
    browser.document.dispatch("click", createMouseEvent(anchor, preventDefault));

    expect(preventDefault).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(browser.window.history.pushCalls).toEqual([]);
    expect(browser.window.location.hash).toBe("#old");
  });

  it("falls back to a full document reload when refreshCurrentRoute receives HTML", async () => {
    const browser = createFakeBrowser("http://example.com/guides");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html></html>", {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      }),
    );

    stubFakeBrowserGlobals(browser);
    vi.stubGlobal("fetch", fetchMock);

    await refreshCurrentRoute(createBootstrapState(createManifest([])));

    expect(fetchMock).toHaveBeenCalledWith(new URL("http://example.com/guides"), {
      cache: "no-store",
      headers: {
        "X-Elemental-Router": "true",
      },
    });
    expect(browser.window.location.reloadCalls).toBe(1);
  });

  it("falls back to a full document reload when the current route no longer matches", async () => {
    const browser = createFakeBrowser("http://example.com/missing");

    stubFakeBrowserGlobals(browser);

    await syncCurrentRouteStylesheets(createBootstrapState(createManifest([])));

    expect(browser.window.location.reloadCalls).toBe(1);
  });

  it("listens for popstate when the Navigation API is unavailable", async () => {
    const browser = createFakeBrowser("http://example.com/about");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html></html>", {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      }),
    );

    stubFakeBrowserGlobals(browser);
    vi.stubGlobal("fetch", fetchMock);

    installNavigationInterceptors(createBootstrapState(createManifest([createRoute("/about")])));
    browser.window.dispatch("popstate", {});
    await flushTasks();

    expect(fetchMock).toHaveBeenCalledWith(new URL("http://example.com/about"), {
      headers: {
        "X-Elemental-Router": "true",
      },
    });
    expect(browser.window.location.reloadCalls).toBe(1);
  });

  it("intercepts same-origin navigation events from the Navigation API", () => {
    const browser = createFakeBrowser();
    const intercept =
      vi.fn<
        (options: {
          handler: () => Promise<void> | void;
          scroll?: "after-transition" | "manual";
        }) => void
      >();

    browser.window.navigation = new FakeNavigationApi();
    stubFakeBrowserGlobals(browser);

    installNavigationInterceptors(createBootstrapState(createManifest([createRoute("/about")])));
    browser.window.navigation.dispatch("navigate", {
      canIntercept: true,
      destination: {
        url: "http://example.com/about",
      },
      hashChange: false,
      intercept,
    });

    expect(intercept).toHaveBeenCalledOnce();
    expect(intercept).toHaveBeenCalledWith({
      handler: expect.any(Function),
      scroll: "after-transition",
    });
  });

  it("reads script and stylesheet assets from current and legacy manifest keys", () => {
    const browser = createFakeBrowser();
    const modernRoute = createRoute("/modern", {
      css: ["assets/modern.css"],
      js: ["assets/modern.js"],
    });
    const legacyRoute = createRoute("/legacy", {
      layoutCss: ["assets/legacy.css"],
      scripts: ["assets/legacy.js"],
    });

    stubFakeBrowserGlobals(browser);

    const modernStylesheets = getRouteStylesheetAssets(modernRoute);
    const legacyStylesheets = getRouteStylesheetAssets(legacyRoute);

    expect(getRouteScriptAssets(modernRoute)).toEqual(["assets/modern.js"]);
    expect(getRouteScriptAssets(legacyRoute)).toEqual(["assets/legacy.js"]);
    expect(modernStylesheets).toEqual(["http://example.com/assets/modern.css"]);
    expect(legacyStylesheets).toEqual(["http://example.com/assets/legacy.css"]);
  });
});

function createBootstrapState(manifest: BuildManifest): BootstrapState {
  return {
    loadedScriptModules: new Set<string>(),
    manifest,
  };
}

function createManifest(routes: BuildManifestRoute[]): BuildManifest {
  return {
    appDir: "app/src",
    assets: {},
    generatedAt: "2026-04-16T00:00:00.000Z",
    routes,
  };
}

function createMouseEvent(target: unknown, preventDefault: () => void) {
  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    preventDefault,
    shiftKey: false,
    target,
  };
}

function createRoute(
  pattern: string,
  assets: BuildManifestRoute["assets"] = {
    layoutCss: [],
    scripts: [],
  },
): BuildManifestRoute {
  return {
    assets,
    browser: {
      errorBoundaries: [],
      layouts: [],
      route: "assets/route.js",
    },
    errorBoundaries: [],
    layoutStylesheets: [],
    layouts: [],
    pattern,
    server: {
      layouts: [],
      route: "server/route.js",
      serverErrorBoundaries: [],
    },
    source: `app/src${pattern === "/" ? "/index.ts" : `${pattern}/index.ts`}`,
    serverErrorBoundaries: [],
  };
}
