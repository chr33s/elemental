import { describe, expect, it } from "vitest";
import {
  resolveNearestBrowserErrorBoundaryForPathname,
  resolveNearestBrowserErrorBoundaryForRoute,
  resolveNearestServerErrorBoundaryForPathname,
} from "../../src/runtime/shared/error-boundaries.ts";
import { createManifest, createRoute } from "./test-helpers/manifest-fixtures.ts";

describe("error boundary resolution", () => {
  it("resolves pathname lookups through the nearest dynamic browser boundary", () => {
    const boundary = resolveNearestBrowserErrorBoundaryForPathname(
      createManifest([
        createRoute({
          browserBoundaryModules: ["assets/root-error.js", "assets/blog-slug-error.js"],
          browserBoundarySources: ["app/src/error.ts", "app/src/blog/[slug]/error.ts"],
          pattern: "/blog/:slug/comments",
          source: "app/src/blog/[slug]/comments/index.ts",
        }),
      ]),
      "/blog/alpha/missing",
    );

    expect(boundary).toEqual({
      directoryPath: "app/src/blog/[slug]",
      modulePath: "assets/blog-slug-error.js",
      params: {
        slug: "alpha",
      },
      sourcePath: "app/src/blog/[slug]/error.ts",
    });
  });

  it("prefers more specific static server boundaries over dynamic alternatives", () => {
    const boundary = resolveNearestServerErrorBoundaryForPathname(
      createManifest([
        createRoute({
          pattern: "/docs/settings",
          serverBoundaryModules: ["server/docs-settings-error.js"],
          serverBoundarySources: ["app/src/docs/settings/error.server.ts"],
          source: "app/src/docs/settings/index.ts",
        }),
        createRoute({
          pattern: "/docs/:slug",
          serverBoundaryModules: ["server/docs-slug-error.js"],
          serverBoundarySources: ["app/src/docs/[slug]/error.server.ts"],
          source: "app/src/docs/[slug]/index.ts",
        }),
      ]),
      "/docs/settings/missing",
    );

    expect(boundary?.sourcePath).toBe("app/src/docs/settings/error.server.ts");
    expect(boundary?.modulePath).toBe("server/docs-settings-error.js");
  });

  it("normalizes directory paths while resolving nearest server boundaries", () => {
    const boundary = resolveNearestServerErrorBoundaryForPathname(
      {
        ...createManifest([
          createRoute({
            serverBoundaryModules: ["server/blog-error.js"],
            serverBoundarySources: ["app/src/blog/./[slug]/error.server.ts"],
            source: "app/src/blog/./[slug]/index.ts",
          }),
        ]),
        appDir: "app/src/",
      },
      "/blog/alpha/missing",
    );

    expect(boundary).toEqual({
      directoryPath: "app/src/blog/[slug]",
      modulePath: "server/blog-error.js",
      params: {
        slug: "alpha",
      },
      sourcePath: "app/src/blog/./[slug]/error.server.ts",
    });
  });

  it("uses the last aligned boundary pair for route-based lookups", () => {
    const boundary = resolveNearestBrowserErrorBoundaryForRoute(
      createRoute({
        browserBoundaryModules: ["assets/root-error.js"],
        browserBoundarySources: ["app/src/error.ts", "app/src/blog/error.ts"],
        pattern: "/blog/:slug",
        source: "app/src/blog/[slug]/index.ts",
      }),
      {
        slug: "alpha",
      },
    );

    expect(boundary).toEqual({
      directoryPath: "app/src",
      modulePath: "assets/root-error.js",
      params: {
        slug: "alpha",
      },
      sourcePath: "app/src/error.ts",
    });
  });
});
