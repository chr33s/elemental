import { describe, expect, it } from "vitest";
import type { BuildManifest } from "../../src/build/manifest.ts";
import {
  classifyDevUpdate,
  hasRouteGraphChanged,
  injectDevClientScript,
} from "../../src/dev/index.ts";

const baseManifest: BuildManifest = {
  appDir: "spec/fixtures/basic-app/src",
  assets: {
    clientEntry: "assets/bootstrap.js",
  },
  generatedAt: "2026-04-13T00:00:00.000Z",
  routes: [
    {
      assets: {
        css: ["assets/root.css"],
        js: ["assets/root.js"],
        layoutCss: ["assets/root.css"],
        scripts: ["assets/root.js"],
      },
      browser: {
        errorBoundaries: ["assets/error.js"],
        layouts: ["assets/layout.js"],
        route: "assets/root.js",
      },
      errorBoundaries: ["spec/fixtures/basic-app/src/error.ts"],
      layoutStylesheets: ["spec/fixtures/basic-app/src/layout.css"],
      layouts: ["spec/fixtures/basic-app/src/layout.ts"],
      pattern: "/",
      server: {
        layouts: ["server/layout.js"],
        route: "server/root.js",
        serverErrorBoundaries: ["server/error.js"],
      },
      serverErrorBoundaries: ["spec/fixtures/basic-app/src/error.server.ts"],
      serverSource: undefined,
      source: "spec/fixtures/basic-app/src/index.ts",
    },
  ],
};

describe("dev helpers", () => {
  it("injects the dev client script into the document head once", () => {
    const html = "<html><head><title>Test</title></head><body>Hello</body></html>";
    const injected = injectDevClientScript(html, "/assets/dev-client.js");

    expect(injected).toContain('data-elemental-dev-client="true"');
    expect(injectDevClientScript(injected, "/assets/dev-client.js")).toBe(injected);
  });

  it("detects route graph changes separately from asset churn", () => {
    expect(
      hasRouteGraphChanged(baseManifest, {
        ...baseManifest,
        generatedAt: "2026-04-13T00:00:01.000Z",
      }),
    ).toBe(false);
    expect(
      hasRouteGraphChanged(baseManifest, {
        ...baseManifest,
        routes: baseManifest.routes.map((route) => ({
          ...route,
          pattern: "/about",
        })),
      }),
    ).toBe(true);
  });

  it("classifies layout.css edits as stylesheet hot swaps", async () => {
    await expect(
      classifyDevUpdate({
        appDir: "/workspace/app",
        changedFiles: ["/workspace/app/layout.css"],
        nextManifest: baseManifest,
        previousManifest: baseManifest,
      }),
    ).resolves.toBe("css");
  });

  it("classifies safe route render edits as route rerenders", async () => {
    await expect(
      classifyDevUpdate({
        appDir: "/workspace/app",
        changedFiles: ["/workspace/app/about/index.ts"],
        nextManifest: baseManifest,
        previousManifest: baseManifest,
        readTextFile: async () => 'export default function route() { return "ok"; }',
      }),
    ).resolves.toBe("route");
  });

  it("falls back to full reload for server and custom element changes", async () => {
    await expect(
      classifyDevUpdate({
        appDir: "/workspace/app",
        changedFiles: ["/workspace/app/about/index.server.ts"],
        nextManifest: baseManifest,
        previousManifest: baseManifest,
      }),
    ).resolves.toBe("reload");
    await expect(
      classifyDevUpdate({
        appDir: "/workspace/app",
        changedFiles: ["/workspace/app/about/index.ts"],
        nextManifest: baseManifest,
        previousManifest: baseManifest,
        readTextFile: async () =>
          'export class DemoCard extends HTMLElement { static tagName = "demo-card"; }',
      }),
    ).resolves.toBe("reload");
  });
});
