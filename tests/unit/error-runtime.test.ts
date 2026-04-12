import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProject } from "../../src/build/index.ts";
import type { BuildManifest } from "../../src/build/manifest.ts";
import { handleElementalRequest, type RouterPayload } from "../../src/runtime/server/app.ts";

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

describe("Phase 6 server error handling", () => {
  it("resolves unmatched routes through the nearest dynamic ancestor server boundary", async () => {
    const { manifest, outDir } = await buildTempApp({
      "error.server.ts": `import { html, type ErrorProps } from "elemental";

export function head(props: ErrorProps) {
  return html\`<title>root ${"${props.status}"}</title>\`;
}

export default function rootError() {
  return html\`<main>root fallback</main>\`;
}
`,
      "index.ts": `import { html } from "elemental";

export default function home() {
  return html\`<main>Home</main>\`;
}
`,
      "layout.ts": `import { html, type LayoutProps } from "elemental";

export default function layout(props: LayoutProps) {
  return html\`<!doctype html><html><body><div class="frame">${"${props.outlet}"}</div></body></html>\`;
}
`,
      [path.join("blog", "[slug]", "comments", "index.ts")]: `import { html } from "elemental";

export default function comments() {
  return html\`<main>Comments</main>\`;
}
`,
      [path.join("blog", "[slug]", "error.server.ts")]:
        `import { html, type ErrorProps } from "elemental";

export function head(props: ErrorProps) {
  return html\`<title>${"${props.status}"} ${"${String(props.params.slug)}"}</title>\`;
}

export default function blogError(props: ErrorProps) {
  return html\`<main>dynamic ${"${String(props.params.slug)}"} ${"${props.statusText}"}</main>\`;
}
`,
    });

    const response = await handleElementalRequest(
      new Request("http://example.com/blog/alpha/missing"),
      {
        distDir: outDir,
        manifest,
      },
    );
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<title>404 alpha</title>");
    expect(body).toContain("<main>dynamic alpha Not Found</main>");
    expect(body).not.toContain("root fallback");
    expect(body).not.toContain('class="frame"');
  });

  it("renders 500 responses through the nearest server boundary without layouts", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { manifest, outDir } = await buildTempApp({
      "error.server.ts": `import { html } from "elemental";

export default function rootError() {
  return html\`<main>root error</main>\`;
}
`,
      "index.ts": `import { html } from "elemental";

export default function home() {
  return html\`<main>Home</main>\`;
}
`,
      "layout.ts": `import { html, type LayoutProps } from "elemental";

export default function rootLayout(props: LayoutProps) {
  return html\`<!doctype html><html><body><div class="root-frame">${"${props.outlet}"}</div></body></html>\`;
}
`,
      [path.join("blog", "error.server.ts")]: `import { html, type ErrorProps } from "elemental";

export function head(props: ErrorProps) {
  return html\`<title>Blog ${"${props.status}"}</title>\`;
}

export default function blogError(props: ErrorProps) {
  const message = props.error instanceof Error ? props.error.message : String(props.error);
  return html\`<main>blog ${"${message}"}</main>\`;
}
`,
      [path.join("blog", "layout.ts")]: `import { html, type LayoutProps } from "elemental";

export default function blogLayout(props: LayoutProps) {
  return html\`<section class="blog-frame">${"${props.outlet}"}</section>\`;
}
`,
      [path.join("blog", "post", "index.server.ts")]: `export async function loader() {
  throw new Error("loader exploded");
}
`,
      [path.join("blog", "post", "index.ts")]: `import { html } from "elemental";

export default function post() {
  return html\`<main>should not render</main>\`;
}
`,
    });

    const response = await handleElementalRequest(new Request("http://example.com/blog/post"), {
      distDir: outDir,
      manifest,
    });
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<title>Blog 500</title>");
    expect(body).toContain("<main>blog loader exploded</main>");
    expect(body).not.toContain("should not render");
    expect(body).not.toContain("root-frame");
    expect(body).not.toContain("blog-frame");
    expect(consoleError).toHaveBeenCalled();
  });

  it("returns structured router payloads for server-rendered errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { manifest, outDir } = await buildTempApp({
      "error.server.ts": `import { html, type ErrorProps } from "elemental";

export function head(props: ErrorProps) {
  return html\`<title>${"${props.statusText}"}</title>\`;
}

export default function rootError() {
  return html\`<main>server failure</main>\`;
}
`,
      "index.ts": `import { html } from "elemental";

export default function home() {
  return html\`<main>Home</main>\`;
}
`,
      [path.join("boom", "index.server.ts")]: `export async function loader() {
  throw new Error("boom");
}
`,
      [path.join("boom", "index.ts")]: `import { html } from "elemental";

export default function boom() {
  return html\`<main>never</main>\`;
}
`,
    });

    const response = await handleElementalRequest(
      new Request("http://example.com/boom", {
        headers: {
          "X-Elemental-Router": "true",
        },
      }),
      {
        distDir: outDir,
        manifest,
      },
    );
    const payload = (await response.json()) as RouterPayload;

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(payload).toEqual({
      assets: {
        scripts: [],
        stylesheets: [],
      },
      head: "<title>Internal Server Error</title>",
      outlet: "<main>server failure</main>",
      status: 500,
    });
  });

  it("falls back to plain text 404 and 500 responses when no server boundary exists", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { manifest, outDir } = await buildTempApp({
      "index.ts": `import { html } from "elemental";

export default function home() {
  return html\`<main>Home</main>\`;
}
`,
      [path.join("boom", "index.server.ts")]: `export async function loader() {
  throw new Error("boom");
}
`,
      [path.join("boom", "index.ts")]: `import { html } from "elemental";

export default function boom() {
  return html\`<main>never</main>\`;
}
`,
    });

    const missingResponse = await handleElementalRequest(
      new Request("http://example.com/missing"),
      {
        distDir: outDir,
        manifest,
      },
    );
    const boomResponse = await handleElementalRequest(new Request("http://example.com/boom"), {
      distDir: outDir,
      manifest,
    });

    expect(missingResponse.status).toBe(404);
    expect(missingResponse.headers.get("content-type")).toContain("text/plain");
    expect(await missingResponse.text()).toBe("404 Not Found");

    expect(boomResponse.status).toBe(500);
    expect(boomResponse.headers.get("content-type")).toContain("text/plain");
    expect(await boomResponse.text()).toBe("500 Internal Server Error");
  });

  it("falls back to plain text 500 when the chosen server boundary throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { manifest, outDir } = await buildTempApp({
      "error.server.ts": `export default function brokenBoundary() {
  throw new Error("boundary exploded");
}
`,
      "index.ts": `import { html } from "elemental";

export default function home() {
  return html\`<main>Home</main>\`;
}
`,
      [path.join("boom", "index.server.ts")]: `export async function loader() {
  throw new Error("loader exploded");
}
`,
      [path.join("boom", "index.ts")]: `import { html } from "elemental";

export default function boom() {
  return html\`<main>never</main>\`;
}
`,
    });

    const response = await handleElementalRequest(new Request("http://example.com/boom"), {
      distDir: outDir,
      manifest,
    });

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("500 Internal Server Error");
    expect(consoleError).toHaveBeenCalledTimes(2);
  });
});

async function buildTempApp(files: Record<string, string>): Promise<{
  manifest: BuildManifest;
  outDir: string;
}> {
  const appDir = await mkdtemp(path.join(rootDir, ".tmp-phase6-app-"));
  const outDir = await mkdtemp(path.join(rootDir, ".tmp-phase6-dist-"));

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
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as BuildManifest;

  return {
    manifest,
    outDir,
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
