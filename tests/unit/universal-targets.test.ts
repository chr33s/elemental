import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildProject } from "../../src/build/index.ts";
import { writeRouteModule } from "./test-helpers/app-fixture.ts";

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

describe("combined deployment targets", () => {
  it("emits srvx and worker entrypoints when no target is supplied", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-phase13-app-"));
    const outDir = await mkdtemp(path.join(rootDir, ".tmp-phase13-dist-"));

    temporaryPaths.add(appDir);
    temporaryPaths.add(outDir);

    await writeRouteModule(
      appDir,
      "index.ts",
      `import { html } from "elemental";

export default function index() {
  return html\`<main>Universal home</main>\`;
}
`,
    );

    const result = await buildProject({
      appDir,
      outDir,
      rootDir,
    });

    expect(result.serverFile).toBe(path.join(outDir, "server.js"));
    expect(result.srvxEntryFile).toBe(path.join(outDir, "srvx.js"));
    expect(result.workerEntryFile).toBe(path.join(outDir, "worker.js"));
    expect(result.wranglerConfigFile).toBe(path.join(outDir, "wrangler.jsonc"));
    expect(await readFile(result.srvxEntryFile ?? "", "utf8")).toContain("createSrvxHandler");
    expect(await readFile(result.workerEntryFile ?? "", "utf8")).toContain("createWorkerHandler");
    expect(await readFile(result.wranglerConfigFile ?? "", "utf8")).toContain(
      '"main": "./worker.js"',
    );
    expect(await readFile(result.wranglerConfigFile ?? "", "utf8")).toContain('"directory": "."');
    expect(await readFile(result.wranglerConfigFile ?? "", "utf8")).toContain(
      '"binding": "ASSETS"',
    );
  });

  it("runs the generated srvx and worker handlers against the same built route", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-phase13-runtime-app-"));
    const outDir = await mkdtemp(path.join(rootDir, ".tmp-phase13-runtime-dist-"));

    temporaryPaths.add(appDir);
    temporaryPaths.add(outDir);

    await writeRouteModule(
      appDir,
      "index.ts",
      `import { html } from "elemental";

export default function home() {
  return html\`<main>Universal runtime</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("about", "index.ts"),
      `import { html } from "elemental";

export default function about() {
  return html\`<main>About universal</main>\`;
}
`,
    );

    const result = await buildProject({
      appDir,
      outDir,
      rootDir,
    });
    const srvxModule = (await import(pathToFileURL(result.srvxEntryFile ?? "").href)) as {
      default: { fetch: (request: Request) => Promise<Response> };
    };
    const workerModule = (await import(pathToFileURL(result.workerEntryFile ?? "").href)) as {
      default: {
        fetch: (
          request: Request,
          env: { ASSETS: { fetch: (request: Request) => Response } },
        ) => Promise<Response>;
      };
    };

    const srvxResponse = await srvxModule.default.fetch(new Request("http://example.com/about"));
    const workerResponse = await workerModule.default.fetch(
      new Request("http://example.com/about"),
      {
        ASSETS: {
          fetch(request: Request) {
            return new Response(`asset:${new URL(request.url).pathname}`, {
              headers: {
                "content-type": "text/plain; charset=utf-8",
              },
              status: 200,
            });
          },
        },
      },
    );
    const workerAssetResponse = await workerModule.default.fetch(
      new Request("http://example.com/assets/example.css"),
      {
        ASSETS: {
          fetch(request: Request) {
            return new Response(`asset:${new URL(request.url).pathname}`, {
              headers: {
                "content-type": "text/plain; charset=utf-8",
              },
              status: 200,
            });
          },
        },
      },
    );

    expect(await srvxResponse.text()).toContain("About universal");
    expect(await workerResponse.text()).toContain("About universal");
    expect(await workerAssetResponse.text()).toBe("asset:/assets/example.css");
  });

  it("rejects Worker targets that import Node builtins from app server modules", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-phase13-worker-validation-app-"));
    const outDir = await mkdtemp(path.join(rootDir, ".tmp-phase13-worker-validation-dist-"));

    temporaryPaths.add(appDir);
    temporaryPaths.add(outDir);

    await writeRouteModule(
      appDir,
      "index.ts",
      `import { html } from "elemental";

export default function home() {
  return html\`<main>Home</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      "index.server.ts",
      `import { readFile } from "node:fs/promises";

export async function loader() {
  await readFile(new URL(import.meta.url));

  return { ok: true };
}
`,
    );

    await expect(
      buildProject({
        appDir,
        outDir,
        rootDir,
        target: "worker",
      }),
    ).rejects.toThrow(/must not import Node builtin/u);
  });
});
