import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { DiscoveredRoute } from "../../src/build/discover.ts";
import { discoverRoutes } from "../../src/build/discover.ts";
import { buildProject } from "../../src/build/index.ts";
import type { BuildManifest } from "../../src/build/manifest.ts";

const rootDir = fileURLToPath(new URL("../../", import.meta.url));
const temporaryPaths = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...temporaryPaths].map((temporaryPath) =>
      rm(temporaryPath, {
        force: true,
        recursive: true,
      }),
    ),
  );

  temporaryPaths.clear();
});

describe("buildProject", () => {
  it("discovers routes and writes phase 3 graph metadata into the manifest", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-phase3-app-"));
    const outDir = await mkdtemp(path.join(rootDir, ".tmp-phase3-dist-"));

    temporaryPaths.add(appDir);
    temporaryPaths.add(outDir);

    await writeRouteModule(
      appDir,
      "index.ts",
      `import { html } from "elemental";

export default function index() {
  return html\`<main>Home</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      "layout.ts",
      `import { html, type LayoutProps } from "elemental";

export default function layout(props: LayoutProps) {
  return html\`<body>${"${props.outlet}"}</body>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      "error.ts",
      `import { html } from "elemental";

export default function errorBoundary() {
  return html\`<main>Error</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      "error.server.ts",
      `import { html } from "elemental";

export default function serverErrorBoundary() {
  return html\`<main>Server Error</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("blog", "[slug]", "index.ts"),
      `import { html } from "elemental";

export default function blogPost() {
  return html\`<main>Blog post</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("docs", "[...parts]", "index.ts"),
      `import { html } from "elemental";

export default function docsPage() {
  return html\`<main>Docs page</main>\`;
}
`,
    );

    const result = await buildProject({
      appDir,
      outDir,
      rootDir,
    });

    expect(result.routes.map(summarizeRoute)).toEqual([
      {
        directoryPath: path.join(appDir, "blog", "[slug]"),
        errorBoundaries: [path.join(appDir, "error.ts")],
        filePath: path.join(appDir, "blog", "[slug]", "index.ts"),
        layouts: [path.join(appDir, "layout.ts")],
        parsedSegments: [
          { kind: "static", raw: "blog", value: "blog" },
          { kind: "dynamic", raw: "[slug]", value: "slug" },
        ],
        pattern: "/blog/:slug",
        segments: ["blog", "[slug]"],
        serverErrorBoundaries: [path.join(appDir, "error.server.ts")],
        serverFilePath: undefined,
      },
      {
        directoryPath: path.join(appDir, "docs", "[...parts]"),
        errorBoundaries: [path.join(appDir, "error.ts")],
        filePath: path.join(appDir, "docs", "[...parts]", "index.ts"),
        layouts: [path.join(appDir, "layout.ts")],
        parsedSegments: [
          { kind: "static", raw: "docs", value: "docs" },
          { kind: "catchall", raw: "[...parts]", value: "parts" },
        ],
        pattern: "/docs/*parts",
        segments: ["docs", "[...parts]"],
        serverErrorBoundaries: [path.join(appDir, "error.server.ts")],
        serverFilePath: undefined,
      },
      {
        directoryPath: appDir,
        errorBoundaries: [path.join(appDir, "error.ts")],
        filePath: path.join(appDir, "index.ts"),
        layouts: [path.join(appDir, "layout.ts")],
        parsedSegments: [],
        pattern: "/",
        segments: [],
        serverErrorBoundaries: [path.join(appDir, "error.server.ts")],
        serverFilePath: undefined,
      },
    ]);

    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as BuildManifest;
    const relativeAppDir = toPosixPath(path.relative(rootDir, appDir));

    expect(manifest.appDir).toBe(relativeAppDir);
    expect(manifest.assets.clientEntry).toMatch(/^assets\/app-[^.]+\.js$/);
    expect(manifest.routes).toEqual([
      {
        errorBoundaries: [`${relativeAppDir}/error.ts`],
        layouts: [`${relativeAppDir}/layout.ts`],
        pattern: "/blog/:slug",
        serverErrorBoundaries: [`${relativeAppDir}/error.server.ts`],
        serverSource: undefined,
        source: `${relativeAppDir}/blog/[slug]/index.ts`,
      },
      {
        errorBoundaries: [`${relativeAppDir}/error.ts`],
        layouts: [`${relativeAppDir}/layout.ts`],
        pattern: "/docs/*parts",
        serverErrorBoundaries: [`${relativeAppDir}/error.server.ts`],
        serverSource: undefined,
        source: `${relativeAppDir}/docs/[...parts]/index.ts`,
      },
      {
        errorBoundaries: [`${relativeAppDir}/error.ts`],
        layouts: [`${relativeAppDir}/layout.ts`],
        pattern: "/",
        serverErrorBoundaries: [`${relativeAppDir}/error.server.ts`],
        serverSource: undefined,
        source: `${relativeAppDir}/index.ts`,
      },
    ]);
    expect(result.clientFile).toBe(path.join(outDir, manifest.assets.clientEntry ?? ""));
    expect(result.serverFile).toBe(path.join(outDir, "server.js"));
  });

  it("discovers layout and error boundary ancestry in stable specificity order", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-phase3-routes-"));
    temporaryPaths.add(appDir);

    await writeRouteModule(
      appDir,
      "index.ts",
      `import { html } from "elemental";

export default function index() {
  return html\`<main>Home</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      "layout.ts",
      `import { html, type LayoutProps } from "elemental";

export default function layout(props: LayoutProps) {
  return html\`<div>${"${props.outlet}"}</div>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      "error.ts",
      `import { html } from "elemental";

export default function errorBoundary() {
  return html\`<main>Root error</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      "error.server.ts",
      `import { html } from "elemental";

export default function serverErrorBoundary() {
  return html\`<main>Root server error</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("blog", "error.ts"),
      `import { html } from "elemental";

export default function blogErrorBoundary() {
  return html\`<main>Blog error</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("blog", "new", "index.ts"),
      `import { html } from "elemental";

export default function blogNew() {
  return html\`<main>Blog new</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("blog", "[slug]", "index.ts"),
      `import { html } from "elemental";

export default function blogPost() {
  return html\`<main>Blog post</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("dashboard", "layout.ts"),
      `import { html, type LayoutProps } from "elemental";

export default function dashboardLayout(props: LayoutProps) {
  return html\`<section>${"${props.outlet}"}</section>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("dashboard", "settings", "index.ts"),
      `import { html } from "elemental";

export default function settings() {
  return html\`<main>Settings</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("docs", "[...parts]", "index.ts"),
      `import { html } from "elemental";

export default function docsPage() {
  return html\`<main>Docs</main>\`;
}
`,
    );

    const routes = await discoverRoutes(appDir);

    expect(routes.map((route) => route.pattern)).toEqual([
      "/blog/new",
      "/blog/:slug",
      "/dashboard/settings",
      "/docs/*parts",
      "/",
    ]);
    expect(routes.find((route) => route.pattern === "/dashboard/settings")).toMatchObject({
      layouts: [path.join(appDir, "layout.ts"), path.join(appDir, "dashboard", "layout.ts")],
    });
    expect(routes.find((route) => route.pattern === "/blog/:slug")).toMatchObject({
      errorBoundaries: [path.join(appDir, "error.ts"), path.join(appDir, "blog", "error.ts")],
      serverErrorBoundaries: [path.join(appDir, "error.server.ts")],
    });
  });

  it("rejects route server modules that mix a default export with loader or action", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-phase3-invalid-server-"));
    const outDir = await mkdtemp(path.join(rootDir, ".tmp-phase3-invalid-server-dist-"));

    temporaryPaths.add(appDir);
    temporaryPaths.add(outDir);

    await writeRouteModule(
      appDir,
      "index.ts",
      `import { html } from "elemental";

export default function index() {
  return html\`<main>Home</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      "index.server.ts",
      `export default async function route() {
  return new Response("ok");
}

export async function loader() {
  return { ok: true };
}
`,
    );

    await expect(
      buildProject({
        appDir,
        outDir,
        rootDir,
      }),
    ).rejects.toThrow(/must not combine a default export with loader\(\)/u);
  });

  it("rejects invalid custom element exports", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-phase3-invalid-elements-"));
    const outDir = await mkdtemp(path.join(rootDir, ".tmp-phase3-invalid-elements-dist-"));

    temporaryPaths.add(appDir);
    temporaryPaths.add(outDir);

    await writeRouteModule(
      appDir,
      "index.ts",
      `import { html } from "elemental";

export default function index() {
  return html\`<main>Home</main>\`;
}

export class BadElement extends HTMLElement {
  static tagName = "bad";
}
`,
    );

    await expect(
      buildProject({
        appDir,
        outDir,
        rootDir,
      }),
    ).rejects.toThrow(/must use a tagName containing a hyphen/u);
  });

  it("rejects custom element exports from server-only modules", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-phase3-server-elements-"));
    const outDir = await mkdtemp(path.join(rootDir, ".tmp-phase3-server-elements-dist-"));

    temporaryPaths.add(appDir);
    temporaryPaths.add(outDir);

    await writeRouteModule(
      appDir,
      "index.ts",
      `import { html } from "elemental";

export default function index() {
  return html\`<main>Home</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      "index.server.ts",
      `export class ServerElement extends HTMLElement {
  static tagName = "el-server-only";
}
`,
    );

    await expect(
      buildProject({
        appDir,
        outDir,
        rootDir,
      }),
    ).rejects.toThrow(/must not be exported from server-only module/u);
  });
});

function summarizeRoute(route: DiscoveredRoute) {
  return {
    directoryPath: route.directoryPath,
    errorBoundaries: route.errorBoundaries,
    filePath: route.filePath,
    layouts: route.layouts,
    parsedSegments: route.parsedSegments,
    pattern: route.pattern,
    segments: route.segments,
    serverErrorBoundaries: route.serverErrorBoundaries,
    serverFilePath: route.serverFilePath,
  };
}

async function writeRouteModule(
  appDir: string,
  relativeFilePath: string,
  sourceText: string,
): Promise<void> {
  const filePath = path.join(appDir, relativeFilePath);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, sourceText, "utf8");
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
