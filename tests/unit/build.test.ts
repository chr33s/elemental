import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
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
  it("discovers routes and writes them into the manifest", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-phase1-app-"));
    const outDir = await mkdtemp(path.join(rootDir, ".tmp-phase1-dist-"));

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

    expect(result.routes).toEqual([
      {
        filePath: path.join(appDir, "index.ts"),
        pattern: "/",
        segments: [],
      },
      {
        filePath: path.join(appDir, "blog", "[slug]", "index.ts"),
        pattern: "/blog/:slug",
        segments: ["blog", "[slug]"],
      },
      {
        filePath: path.join(appDir, "docs", "[...parts]", "index.ts"),
        pattern: "/docs/*parts",
        segments: ["docs", "[...parts]"],
      },
    ]);

    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as BuildManifest;
    const relativeAppDir = toPosixPath(path.relative(rootDir, appDir));

    expect(manifest.appDir).toBe(relativeAppDir);
    expect(manifest.assets.clientEntry).toMatch(/^assets\/app-[^.]+\.js$/);
    expect(manifest.routes).toEqual([
      {
        pattern: "/",
        source: `${relativeAppDir}/index.ts`,
      },
      {
        pattern: "/blog/:slug",
        source: `${relativeAppDir}/blog/[slug]/index.ts`,
      },
      {
        pattern: "/docs/*parts",
        source: `${relativeAppDir}/docs/[...parts]/index.ts`,
      },
    ]);
    expect(result.clientFile).toBe(path.join(outDir, manifest.assets.clientEntry ?? ""));
    expect(result.serverFile).toBe(path.join(outDir, "server.js"));
  });
});

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
