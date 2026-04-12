import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildProject } from "../../src/build/index.ts";
import type { BuildManifest } from "../../src/build/manifest.ts";
import { handleElementalRequest, type RouterPayload } from "../../src/runtime/server/app.ts";

const rootDir = fileURLToPath(new URL("../../", import.meta.url));

describe("handleElementalRequest", () => {
  let appDir = "";
  let outDir = "";
  let manifest: BuildManifest;

  beforeAll(async () => {
    appDir = await mkdtemp(path.join(rootDir, ".tmp-phase5-app-"));
    outDir = await mkdtemp(path.join(rootDir, ".tmp-phase5-dist-"));

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
      "layout.ts",
      `import { html, type LayoutProps } from "elemental";

export default function rootLayout(props: LayoutProps) {
  return html\`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        ${"${props.head}"}
      </head>
      <body>
        <div data-route-outlet>
          <main class="frame">${"${props.outlet}"}</main>
        </div>
      </body>
    </html>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      "layout.css",
      `body {
  background: mintcream;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("blog", "layout.ts"),
      `import { html, type LayoutProps } from "elemental";

export default function blogLayout(props: LayoutProps) {
  return html\`<section class="blog-shell">${"${props.outlet}"}</section>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("blog", "layout.css"),
      `.blog-shell {
  border: 1px solid black;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("blog", "[slug]", "index.ts"),
      `import { html, type RouteProps } from "elemental";

export function head(props: RouteProps) {
  return html\`<title>${"${props.data.title}"}</title><meta name="description" content=${"${props.data.description}"} />\`;
}

export default function blogPost(props: RouteProps) {
  return html\`<article><h1>${"${props.data.title}"}</h1><p>${"${props.params.slug}"}</p></article>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("blog", "[slug]", "index.server.ts"),
      `export async function loader({ params }) {
  return {
    description: \`Story ${"${String(params.slug)}"}\`,
    title: \`Post ${"${String(params.slug)}"}\`,
  };
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("loader-response", "index.ts"),
      `import { html } from "elemental";

export default function loaderResponseRoute() {
  return html\`<main>should not render</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("loader-response", "index.server.ts"),
      `export async function loader() {
  return new Response("loader response", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
    status: 202,
  });
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("guard", "index.ts"),
      `import { html } from "elemental";

export default function guardRoute() {
  return html\`<main>should not render</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("guard", "index.server.ts"),
      `export default async function guard() {
  return new Response("blocked", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
    status: 401,
  });
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("submit", "index.ts"),
      `import { html } from "elemental";

export default function submitRoute() {
  return html\`<form method="post"></form>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("submit", "index.server.ts"),
      `export async function action(ctx) {
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
    );
    await writeRouteModule(
      appDir,
      path.join("checkpoint", "index.ts"),
      `import { html } from "elemental";

export default function checkpointRoute() {
  return html\`<main>checkpoint</main>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("checkpoint", "index.server.ts"),
      `export async function action() {
  return {
    ok: true,
  };
}
`,
    );

    const result = await buildProject({
      appDir,
      outDir,
      rootDir,
    });

    manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as BuildManifest;
  });

  afterAll(async () => {
    await Promise.all(
      [appDir, outDir].map((temporaryPath) =>
        rm(temporaryPath, {
          force: true,
          recursive: true,
        }),
      ),
    );
  });

  it("renders matched routes with nested layouts, head, and assets", async () => {
    const route = requireRoute(manifest, "/blog/:slug");
    const response = await handleElementalRequest(new Request("http://example.com/blog/alpha"), {
      distDir: outDir,
      manifest,
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<div data-route-outlet>");
    expect(body).toContain('<main class="frame"><section class="blog-shell">');
    expect(body).toContain("<h1>Post alpha</h1>");
    expect(body).toContain("<p>alpha</p>");
    expect(body).toContain("<title>Post alpha</title>");
    expect(body).toContain('<meta name="description" content="Story alpha" />');

    for (const stylesheetHref of route.assets.layoutCss.map((assetPath) => `/${assetPath}`)) {
      expect(body).toContain(`href="${stylesheetHref}"`);
    }

    expect(body).toContain(`src="/${manifest.assets.clientEntry}"`);

    for (const scriptHref of route.assets.scripts.map((assetPath) => `/${assetPath}`)) {
      expect(body).toContain(`src="${scriptHref}"`);
    }
  });

  it("returns a structured router payload for client navigation", async () => {
    const route = requireRoute(manifest, "/blog/:slug");
    const response = await handleElementalRequest(
      new Request("http://example.com/blog/alpha", {
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

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(payload.status).toBe(200);
    expect(payload.head).toContain("<title>Post alpha</title>");
    expect(payload.head).toContain('<meta name="description" content="Story alpha" />');
    expect(payload.head).not.toContain("<script");
    expect(payload.outlet).toContain('<section class="blog-shell">');
    expect(payload.outlet).toContain("<h1>Post alpha</h1>");
    expect(payload.outlet).not.toContain("<html");
    expect(payload.outlet).not.toContain("data-route-outlet");
    expect(payload.assets.stylesheets).toEqual(
      route.assets.layoutCss.map((assetPath) => `/${assetPath}`),
    );
    expect(payload.assets.scripts).toEqual([
      `/${manifest.assets.clientEntry}`,
      ...route.assets.scripts.map((assetPath) => `/${assetPath}`),
    ]);
  });

  it("bypasses layout composition when loader returns a Response", async () => {
    const response = await handleElementalRequest(
      new Request("http://example.com/loader-response"),
      {
        distDir: outDir,
        manifest,
      },
    );

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("loader response");
  });

  it("bypasses route rendering when index.server.ts owns the response", async () => {
    const response = await handleElementalRequest(new Request("http://example.com/guard"), {
      distDir: outDir,
      manifest,
    });

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("blocked");
  });

  it("dispatches mutations to action() and returns its Response", async () => {
    const response = await handleElementalRequest(
      new Request("http://example.com/submit", {
        body: new URLSearchParams({
          title: "Draft",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        method: "POST",
      }),
      {
        distDir: outDir,
        manifest,
      },
    );

    expect(response.status).toBe(201);
    expect(await response.text()).toBe("saved:Draft");
  });

  it("holds the non-Response action path at the spec checkpoint", async () => {
    const response = await handleElementalRequest(
      new Request("http://example.com/checkpoint", {
        body: new URLSearchParams({
          title: "Draft",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        method: "POST",
      }),
      {
        distDir: outDir,
        manifest,
      },
    );

    expect(response.status).toBe(501);
    expect(await response.text()).toContain("Action handlers must return a Response");
  });
});

function requireRoute(manifest: BuildManifest, pattern: string) {
  const route = manifest.routes.find((entry) => entry.pattern === pattern);

  expect(route).toBeDefined();

  return route!;
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
