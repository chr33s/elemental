import { html } from "elemental";
import { describe, expect, it, vi } from "vitest";
import {
  recoverFromClientError,
  renderClientErrorBoundary,
} from "../../src/runtime/client/errors.ts";
import type { ClientErrorProps } from "../../src/runtime/shared/types.ts";
import {
  createManifest as createBaseManifest,
  createRoute,
} from "./test-helpers/manifest-fixtures.ts";

describe("client error recovery helpers", () => {
  it("renders the nearest matched-route browser boundary and updates head after outlet", async () => {
    const route = createRoute({
      browserBoundaryModules: ["assets/root-error.js", "assets/blog-error.js"],
      browserBoundarySources: ["app/src/error.ts", "app/src/blog/[slug]/error.ts"],
      pattern: "/blog/:slug",
      source: "app/src/blog/[slug]/index.ts",
    });
    const manifest = createManifest([route]);
    const calls: string[] = [];

    const recovered = await recoverFromClientError({
      error: new Error("boom"),
      fallback: () => {
        calls.push("fallback");
      },
      manifest,
      matchedRoute: {
        params: {
          slug: "alpha",
        },
        route,
      },
      renderHead: (head) => {
        calls.push(`head:${head}`);
      },
      renderOutlet: (outlet) => {
        calls.push(`outlet:${outlet}`);
      },
      resolver: async (modulePath) => {
        expect(modulePath).toBe("assets/blog-error.js");

        return {
          default(props: ClientErrorProps) {
            return html`<main>${String(props.params.slug)}</main>`;
          },
          head(props: ClientErrorProps) {
            return html`<title>${String(props.params.slug)}</title>`;
          },
        };
      },
      url: new URL("http://example.com/blog/alpha"),
    });

    expect(recovered).toBe(true);
    expect(calls).toEqual(["outlet:<main>alpha</main>", "head:<title>alpha</title>"]);
  });

  it("renders declarative shadow DOM from browser error boundaries", async () => {
    const route = createRoute({
      browserBoundaryModules: ["assets/error.js"],
      browserBoundarySources: ["app/src/error.ts"],
      pattern: "/recover",
      source: "app/src/recover/index.ts",
    });
    const manifest = createManifest([route]);
    const calls: string[] = [];

    const recovered = await recoverFromClientError({
      error: new Error("boom"),
      fallback: () => {
        calls.push("fallback");
      },
      manifest,
      matchedRoute: {
        params: {},
        route,
      },
      renderHead: (head) => {
        calls.push(`head:${head}`);
      },
      renderOutlet: (outlet) => {
        calls.push(`outlet:${outlet}`);
      },
      resolver: async () => ({
        default() {
          return html`<error-card
            ><template shadowrootmode="open"><p>Recovered</p></template></error-card
          >`;
        },
      }),
      url: new URL("http://example.com/recover"),
    });

    expect(recovered).toBe(true);
    expect(compactHtml(calls[0] ?? "")).toBe(
      'outlet:<error-card><template shadowrootmode="open"><p>Recovered</p></template></error-card>',
    );
    expect(calls[1]).toBe("head:");
  });

  it("resolves unmatched client failures through the nearest dynamic ancestor boundary", async () => {
    const route = createRoute({
      browserBoundaryModules: ["assets/root-error.js", "assets/blog-slug-error.js"],
      browserBoundarySources: ["app/src/error.ts", "app/src/blog/[slug]/error.ts"],
      pattern: "/blog/:slug/comments",
      source: "app/src/blog/[slug]/comments/index.ts",
    });
    const manifest = createManifest([route]);

    const renderedBoundary = await renderClientErrorBoundary({
      error: new Error("failed navigation"),
      manifest,
      resolver: async () => ({
        default(props: ClientErrorProps) {
          return html`<main>${String(props.params.slug)}</main>`;
        },
      }),
      url: new URL("http://example.com/blog/alpha/missing"),
    });

    expect(renderedBoundary?.boundary.sourcePath).toBe("app/src/blog/[slug]/error.ts");
    expect(renderedBoundary?.outlet).toBe("<main>alpha</main>");
  });

  it("falls back to a full navigation when no browser boundary exists", async () => {
    const route = createRoute({
      browserBoundaryModules: [],
      browserBoundarySources: [],
      pattern: "/blog/:slug",
      source: "app/src/blog/[slug]/index.ts",
    });
    const manifest = createManifest([route]);
    const fallback = vi.fn<() => void>();
    const logger = {
      error: vi.fn<(...args: unknown[]) => void>(),
    };

    const recovered = await recoverFromClientError({
      error: new Error("boom"),
      fallback,
      logger,
      manifest,
      matchedRoute: {
        params: {
          slug: "alpha",
        },
        route,
      },
      renderHead: vi.fn<(head: string) => void>(),
      renderOutlet: vi.fn<(outlet: string) => void>(),
      resolver: async () => ({}),
      url: new URL("http://example.com/blog/alpha"),
    });

    expect(recovered).toBe(false);
    expect(fallback).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs and falls back when the chosen browser boundary throws", async () => {
    const route = createRoute({
      browserBoundaryModules: ["assets/root-error.js"],
      browserBoundarySources: ["app/src/error.ts"],
      pattern: "/boom",
      source: "app/src/boom/index.ts",
    });
    const manifest = createManifest([route]);
    const fallback = vi.fn<() => void>();
    const logger = {
      error: vi.fn<(...args: unknown[]) => void>(),
    };

    const recovered = await recoverFromClientError({
      error: new Error("boom"),
      fallback,
      logger,
      manifest,
      matchedRoute: {
        params: {},
        route,
      },
      renderHead: vi.fn<(head: string) => void>(),
      renderOutlet: vi.fn<(outlet: string) => void>(),
      resolver: async () => ({
        default() {
          throw new Error("boundary exploded");
        },
      }),
      url: new URL("http://example.com/boom"),
    });

    expect(recovered).toBe(false);
    expect(fallback).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

function createManifest(routes: ReturnType<typeof createBaseManifest>["routes"]) {
  return createBaseManifest(routes, {
    assets: {
      clientEntry: "assets/client.js",
    },
    generatedAt: "2026-04-12T00:00:00.000Z",
  });
}

function compactHtml(value: string): string {
  return value.replaceAll(/>\s+</g, "><").replaceAll(/\s+>/g, ">").trim();
}
