import { html, renderToString } from "elemental";
import { describe, expect, it } from "vitest";
import type { BuildManifest, BuildManifestRoute } from "../../src/build/manifest.ts";
import { composeAssetHead, createResolvedAssets } from "../../src/runtime/server/assets.ts";

describe("server asset helpers", () => {
  it("resolves current manifest asset keys and prepends the client entry", () => {
    const assets = createResolvedAssets(
      createManifest("assets/client.js"),
      createRoute({
        css: ["assets/route.css"],
        js: ["assets/route.js"],
      }),
    );

    expect(assets).toEqual({
      scripts: ["/assets/client.js", "/assets/route.js"],
      stylesheets: ["/assets/route.css"],
    });
  });

  it("falls back to legacy manifest asset keys when current keys are absent", () => {
    const assets = createResolvedAssets(
      createManifest(),
      createRoute({
        layoutCss: ["assets/layout.css"],
        scripts: ["assets/legacy-route.js"],
      }),
    );

    expect(assets).toEqual({
      scripts: ["/assets/legacy-route.js"],
      stylesheets: ["/assets/layout.css"],
    });
  });

  it("composes managed head markup around route head and asset tags", () => {
    const renderedHead = renderToString(
      composeAssetHead(html`<title>${'Fish & "Chips"'}</title>`, {
        scripts: ["/assets/client.js"],
        stylesheets: ["/assets/route.css"],
      }),
    );

    expect(renderedHead).toContain('<meta name="elemental-head-start" content="" />');
    expect(renderedHead).toContain("<title>Fish &amp; &quot;Chips&quot;</title>");
    expect(renderedHead).toMatch(
      /<meta name="elemental-head-end" content="" \/>\s*<link\s+data-elemental-managed="stylesheet"\s+rel="stylesheet"\s+href="\/assets\/route\.css"\s*\/>/u,
    );
    expect(renderedHead).toMatch(
      /<script\s+data-elemental-managed="script"\s+type="module"\s+src="\/assets\/client\.js"\s*><\/script>/u,
    );
  });
});

function createManifest(clientEntry?: string): BuildManifest {
  return {
    appDir: "app/src",
    assets: {
      clientEntry,
    },
    generatedAt: "2026-04-16T00:00:00.000Z",
    routes: [],
  };
}

function createRoute(assets: BuildManifestRoute["assets"]): BuildManifestRoute {
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
    pattern: "/",
    server: {
      layouts: [],
      route: "server/route.js",
      serverErrorBoundaries: [],
    },
    source: "app/src/index.ts",
    serverErrorBoundaries: [],
  };
}
