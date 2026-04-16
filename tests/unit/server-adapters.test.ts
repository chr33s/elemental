import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { html } from "elemental";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProject } from "../../src/build/index.ts";
import type { BuildManifest } from "../../src/build/manifest.ts";
import {
  createNodeRuntime,
  createSrvxHandler,
  startServer,
} from "../../src/runtime/server/node.ts";
import { createWorkerHandler } from "../../src/runtime/server/worker.ts";

const rootDir = fileURLToPath(new URL("../../", import.meta.url));
const temporaryPaths = new Set<string>();

afterEach(async () => {
  vi.restoreAllMocks();

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

describe("server adapters", () => {
  it("serves filesystem assets with stable content types and traversal protection", async () => {
    const distDir = await mkdtemp(path.join(rootDir, ".tmp-node-runtime-"));

    temporaryPaths.add(distDir);
    await mkdir(path.join(distDir, "assets"), { recursive: true });
    await writeFile(path.join(distDir, "assets/app.js"), 'console.log("app");\n', "utf8");
    await writeFile(path.join(distDir, "assets/site.css"), "body { color: tomato; }\n", "utf8");
    await writeFile(path.join(distDir, "assets/data.json"), '{"ok":true}\n', "utf8");
    await writeFile(path.join(distDir, "secret.txt"), "nope\n", "utf8");

    const runtime = createNodeRuntime(distDir);
    const jsResponse = await runtime.serveAsset(
      new Request("http://example.com/assets/app.js"),
      "/assets/app.js",
    );
    const cssResponse = await runtime.serveAsset(
      new Request("http://example.com/assets/site.css"),
      "/assets/site.css",
    );
    const jsonResponse = await runtime.serveAsset(
      new Request("http://example.com/assets/data.json"),
      "/assets/data.json",
    );
    const forbiddenResponse = await runtime.serveAsset(
      new Request("http://example.com/assets/../../secret.txt"),
      "/assets/../../secret.txt",
    );
    const missingResponse = await runtime.serveAsset(
      new Request("http://example.com/assets/missing.txt"),
      "/assets/missing.txt",
    );

    expect(jsResponse.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(await jsResponse.text()).toContain('console.log("app")');
    expect(cssResponse.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(jsonResponse.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(forbiddenResponse.status).toBe(403);
    expect(await forbiddenResponse.text()).toBe("Forbidden");
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.text()).toBe("Asset not found");
  });

  it("translates Node HTTP requests for HEAD and POST handling", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const { manifest, outDir } = await buildTempApp({
      "index.ts": `import { html } from "elemental";

export default function home() {
  return html\`<main>Home</main>\`;
}
`,
      [path.join("submit", "index.server.ts")]: `export async function action(ctx) {
  const form = await ctx.request.formData();
  const title = String(form.get("title") ?? "untitled");

  return new Response(\`saved:${"${title}"}\`, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
    status: 201,
  });
}
`,
      [path.join("submit", "index.ts")]: `import { html } from "elemental";

export default function submitRoute() {
  return html\`<form method="post"></form>\`;
}
`,
    });
    const server = startServer({
      distDir: outDir,
      manifest,
      port: 0,
    });

    await once(server, "listening");

    const port = (server.address() as AddressInfo).port;
    const headResponse = await fetch(`http://127.0.0.1:${String(port)}/`, {
      method: "HEAD",
    });
    const actionResponse = await fetch(`http://127.0.0.1:${String(port)}/submit`, {
      body: new URLSearchParams({
        title: "Draft",
      }),
      method: "POST",
    });

    expect(headResponse.status).toBe(200);
    expect(await headResponse.text()).toBe("");
    expect(actionResponse.status).toBe(201);
    expect(await actionResponse.text()).toBe("saved:Draft");

    await closeServer(server);
    expect(consoleLog).toHaveBeenCalledOnce();
  });

  it("exposes the Node runtime through the srvx adapter", async () => {
    const { manifest, outDir } = await buildTempApp({
      "index.ts": `import { html } from "elemental";

export default function home() {
  return html\`<main>Home</main>\`;
}
`,
    });
    const handler = createSrvxHandler({
      distDir: outDir,
      manifest,
    });
    const response = await handler.fetch(new Request("http://example.com/"));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>Home</main>");
  });

  it("serves worker assets through ASSETS and falls back cleanly when missing", async () => {
    const assetFetch = vi.fn<(request: Request) => Promise<Response>>().mockResolvedValue(
      new Response("asset body", {
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      }),
    );
    const assetManifest = createManifest([]);
    const assetHandler = createWorkerHandler({
      manifest: assetManifest,
      modules: {},
    });
    const routedHandler = createWorkerHandler({
      manifest: createManifest([createRoute("/")]),
      modules: {
        "server/index.js": {
          default() {
            return html`<main>Worker route</main>`;
          },
        },
      },
    });

    const assetResponse = await assetHandler.fetch(
      new Request("http://example.com/assets/app.js"),
      {
        ASSETS: {
          fetch: assetFetch,
        },
      },
    );
    const missingAssetResponse = await assetHandler.fetch(
      new Request("http://example.com/assets/missing.js"),
      {},
    );
    const routedResponse = await routedHandler.fetch(new Request("http://example.com/"), {});

    expect(assetFetch).toHaveBeenCalledOnce();
    expect(await assetResponse.text()).toBe("asset body");
    expect(missingAssetResponse.status).toBe(404);
    expect(await missingAssetResponse.text()).toBe("Asset not found");
    expect(await routedResponse.text()).toContain("<main>Worker route</main>");
  });
});

async function buildTempApp(files: Record<string, string>): Promise<{
  manifest: BuildManifest;
  outDir: string;
}> {
  const appDir = await mkdtemp(path.join(rootDir, ".tmp-server-adapter-app-"));
  const outDir = await mkdtemp(path.join(rootDir, ".tmp-server-adapter-dist-"));

  temporaryPaths.add(appDir);
  temporaryPaths.add(outDir);

  await Promise.all(
    Object.entries(files).map(([relativeFilePath, sourceText]) =>
      writeRouteModule(appDir, relativeFilePath, sourceText),
    ),
  );

  const result = await buildProject({
    appDir,
    outDir,
    rootDir,
  });

  return {
    manifest: JSON.parse(await readFile(result.manifestPath, "utf8")) as BuildManifest,
    outDir,
  };
}

function createManifest(routes: BuildManifest["routes"]): BuildManifest {
  return {
    appDir: "app/src",
    assets: {},
    generatedAt: "2026-04-16T00:00:00.000Z",
    routes,
  };
}

function createRoute(pattern: string): BuildManifest["routes"][number] {
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
      route: "server/index.js",
      serverErrorBoundaries: [],
    },
    source: "app/src/index.ts",
    serverErrorBoundaries: [],
  };
}

async function closeServer(server: Parameters<typeof closeNodeServer>[0]): Promise<void> {
  await closeNodeServer(server);
}

async function closeNodeServer(server: {
  close: (callback: (error?: Error | null) => void) => void;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined && error !== null) {
        reject(error);
        return;
      }

      resolve();
    });
  });
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
