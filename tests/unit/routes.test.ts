import { describe, expect, it } from "vitest";
import type { BuildManifestRoute } from "../../src/build/manifest.ts";
import {
  matchManifestRoute,
  matchRoutePattern,
  splitPathSegments,
} from "../../src/runtime/shared/routes.ts";

describe("route matching", () => {
  it("matches static, dynamic, and catch-all patterns with decoded params", () => {
    expect(matchRoutePattern("/docs/:slug", splitPathSegments("/docs/router%20guide"))).toEqual({
      slug: "router guide",
    });
    expect(
      matchRoutePattern("/docs/*parts", splitPathSegments("/docs/guides/install/cli")),
    ).toEqual({
      parts: ["guides", "install", "cli"],
    });
  });

  it("respects manifest specificity ordering when matching routes", () => {
    const routes: BuildManifestRoute[] = [
      createRoute("/docs/install"),
      createRoute("/docs/:slug"),
      createRoute("/docs/*parts"),
    ];

    expect(matchManifestRoute("/docs/install", routes)?.route.pattern).toBe("/docs/install");
    expect(matchManifestRoute("/docs/router", routes)).toEqual({
      params: {
        slug: "router",
      },
      route: routes[1],
    });
    expect(matchManifestRoute("/docs/guides/install", routes)).toEqual({
      params: {
        parts: ["guides", "install"],
      },
      route: routes[2],
    });
  });
});

function createRoute(pattern: string): BuildManifestRoute {
  return {
    assets: {
      layoutCss: [],
      scripts: [],
    },
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
    serverErrorBoundaries: [],
    source: `app/src${pattern === "/" ? "/index.ts" : `${pattern}/index.ts`}`,
  };
}
