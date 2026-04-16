import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildProject } from "../../src/build/index.ts";
import type { BuildManifest, PublicBuildManifest } from "../../src/build/manifest.ts";
import { handleElementalRequest, type RouterPayload } from "../../src/runtime/server/app.ts";
import { writeRouteModule } from "./test-helpers/app-fixture.ts";

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
    await writeRouteModule(
      appDir,
      path.join("styled", "card.css"),
      `:host {
  color: tomato;

  & > span {
    display: block;
  }
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("styled", "index.ts"),
      `import { html } from "elemental";
import cardSheet from "./card.css";

export default function styledRoute() {
  const serverStyles =
    typeof window === "undefined"
      ? html\`<template shadowrootmode="open"><style>${"${cardSheet}"}</style><span>Styled card</span></template>\`
      : html\`\`;

  return html\`<section><styled-card>${"${serverStyles}"}</styled-card></section>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("docs", "[...parts]", "index.ts"),
      `import { html, type RouteProps } from "elemental";

export default function docsRoute(props: RouteProps) {
  const parts = Array.isArray(props.params.parts) ? props.params.parts.join("/") : "missing";

  return html\`<article><h1>${"${parts}"}</h1><p>${"${props.data.joined}"}</p></article>\`;
}
`,
    );
    await writeRouteModule(
      appDir,
      path.join("docs", "[...parts]", "index.server.ts"),
      `export async function loader({ params }) {
  const parts = Array.isArray(params.parts) ? params.parts : [];

  return {
    joined: parts.join("/"),
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

  it("serves a client-safe runtime manifest without server module paths", async () => {
    const response = await handleElementalRequest(new Request("http://example.com/manifest.json"), {
      distDir: outDir,
      manifest,
    });
    const publicManifest = (await response.json()) as PublicBuildManifest;
    const route = publicManifest.routes[0]!;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(publicManifest.appDir).toBe(manifest.appDir);
    expect(route.pattern).toBe(manifest.routes[0]?.pattern);
    expect(Object.keys(route.browser)).toEqual(["errorBoundaries"]);
    expect(Object.hasOwn(route, "server")).toBe(false);
    expect(Object.hasOwn(route, "source")).toBe(false);
    expect(Object.hasOwn(route, "serverSource")).toBe(false);
    expect(Object.hasOwn(route, "layouts")).toBe(false);
    expect(Object.hasOwn(route, "layoutStylesheets")).toBe(false);
    expect(Object.hasOwn(route, "serverErrorBoundaries")).toBe(false);
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

    for (const stylesheetHref of (route.assets.layoutCss ?? []).map(
      (assetPath) => `/${assetPath}`,
    )) {
      expect(body).toContain(`href="${stylesheetHref}"`);
    }

    expect(body).toContain(`src="/${manifest.assets.clientEntry}"`);

    for (const scriptHref of (route.assets.scripts ?? []).map((assetPath) => `/${assetPath}`)) {
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
      (route.assets.layoutCss ?? []).map((assetPath) => `/${assetPath}`),
    );
    expect(payload.assets.scripts).toEqual([
      `/${manifest.assets.clientEntry}`,
      ...(route.assets.scripts ?? []).map((assetPath) => `/${assetPath}`),
    ]);
  });

  it("renders scoped CSS imports as raw inline style text during SSR", async () => {
    const response = await handleElementalRequest(new Request("http://example.com/styled"), {
      distDir: outDir,
      manifest,
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<template shadowrootmode="open"><style>:host {');
    expect(body).toContain("& > span {");
    expect(body).not.toContain("&amp; &gt; span");
  });

  it("passes catch-all params through loader and route rendering", async () => {
    const response = await handleElementalRequest(
      new Request("http://example.com/docs/guides/install"),
      {
        distDir: outDir,
        manifest,
      },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("<h1>guides/install</h1>");
    expect(body).toContain("<p>guides/install</p>");
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

  it("bypasses layout composition when action() returns a Response", async () => {
    const response = await handleElementalRequest(
      new Request("http://example.com/submit", {
        body: new URLSearchParams({
          title: "TestPost",
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

    const body = await response.text();
    expect(response.status).toBe(201);
    expect(body).toBe("saved:TestPost");
    expect(body).not.toContain("<!doctype html>");
    expect(body).not.toContain("<html>");
    expect(body).not.toContain("data-route-outlet");
    expect(body).not.toContain('class="frame"');
  });

  it("treats non-Response action returns as server errors", async () => {
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

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("500 Internal Server Error");
  });
});

function requireRoute(manifest: BuildManifest, pattern: string) {
  const route = manifest.routes.find((entry) => entry.pattern === pattern);

  expect(route).toBeDefined();

  return route!;
}
