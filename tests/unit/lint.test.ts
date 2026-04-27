import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const rootDir = fileURLToPath(new URL("../../", import.meta.url));
const temporaryPaths = new Set<string>();
const execFileAsync = promisify(execFile);
const oxlintBinPath = path.join(rootDir, "node_modules", ".bin", "oxlint");
const oxlintConfigPath = path.join(rootDir, "oxlint.config.ts");

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

describe("oxlint elemental plugin", () => {
  it("reports direct safeHtml usage in route modules", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-oxlint-safe-html-app-"));
    const routeFile = path.join(appDir, "index.ts");

    temporaryPaths.add(appDir);
    await writeFile(
      routeFile,
      `import { html, safeHtml } from "elemental";

export default function index() {
  return html\`<main>${"${safeHtml('<strong>trusted</strong>')}"}</main>\`;
}
`,
      "utf8",
    );

    const result = await runOxlint(routeFile);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("elemental/no-unsafe-safe-html");
    expect(result.output).toContain("Avoid direct safeHtml() in route-facing modules");
  });

  it("allows reviewed exceptions via inline oxlint disable comments", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-oxlint-safe-html-disable-app-"));
    const routeFile = path.join(appDir, "index.ts");

    temporaryPaths.add(appDir);
    await writeFile(
      routeFile,
      `import { html, safeHtml } from "elemental";

export default function index() {
  // oxlint-disable-next-line elemental/no-unsafe-safe-html -- sanitized CMS HTML reviewed for this route
  return html\`<main>${"${safeHtml('<strong>trusted</strong>')}"}</main>\`;
}
`,
      "utf8",
    );

    const result = await runOxlint(routeFile);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("elemental/no-unsafe-safe-html");
  });

  it("reports direct safeHtml usage in server error boundary modules", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-oxlint-safe-html-server-"));
    const routeFile = path.join(appDir, "error.server.ts");

    temporaryPaths.add(appDir);
    await writeFile(
      routeFile,
      `import { html, safeHtml } from "elemental";

export default function errorPage() {
  return html\`<main>${"${safeHtml('<strong>oops</strong>')}"}</main>\`;
}
`,
      "utf8",
    );

    const result = await runOxlint(routeFile);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("elemental/no-unsafe-safe-html");
  });

  it("does not report helper modules outside route naming conventions", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-oxlint-safe-html-helper-app-"));
    const helperFile = path.join(appDir, "helpers.ts");

    temporaryPaths.add(appDir);
    await writeFile(
      helperFile,
      `import { safeHtml } from "elemental";

export function renderSnippet(value) {
  return safeHtml(value);
}
`,
      "utf8",
    );

    const result = await runOxlint(helperFile);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("elemental/no-unsafe-safe-html");
  });

  it("flags imports of *.server.* modules from browser-reachable files", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-oxlint-server-import-"));
    const routeFile = path.join(appDir, "index.ts");

    temporaryPaths.add(appDir);
    await writeFile(
      routeFile,
      `import { db } from "./db.server.ts";
import { html } from "elemental";

export default function index() {
  return html\`<p>${"${String(db)}"}</p>\`;
}
`,
      "utf8",
    );

    const result = await runOxlint(routeFile);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("no-server-import-in-browser");
  });

  it("flags manual customElements.define() in auto-registered modules", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-oxlint-define-"));
    const routeFile = path.join(appDir, "layout.ts");

    temporaryPaths.add(appDir);
    await writeFile(
      routeFile,
      `import { html } from "elemental";

export class Shell extends HTMLElement {
  static tagName = "el-shell";
}

customElements.define("el-other", Shell);

export default function layout() {
  return html\`<div></div>\`;
}
`,
      "utf8",
    );

    const result = await runOxlint(routeFile);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("no-customelements-define");
  });

  it("flags exported HTMLElement subclasses without static tagName", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-oxlint-tagname-"));
    const routeFile = path.join(appDir, "index.ts");

    temporaryPaths.add(appDir);
    await writeFile(
      routeFile,
      `import { html } from "elemental";

export class Widget extends HTMLElement {
  connectedCallback() {}
}

export default function index() {
  return html\`<el-widget></el-widget>\`;
}
`,
      "utf8",
    );

    const result = await runOxlint(routeFile);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("require-tag-name");
  });

  it("flags tag names without a hyphen", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-oxlint-valid-tagname-"));
    const routeFile = path.join(appDir, "index.ts");

    temporaryPaths.add(appDir);
    await writeFile(
      routeFile,
      `import { html } from "elemental";

export class Widget extends HTMLElement {
  static tagName = "widget";
}

export default function index() {
  return html\`<widget></widget>\`;
}
`,
      "utf8",
    );

    const result = await runOxlint(routeFile);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("valid-tag-name");
  });

  it("flags HTMLElement subclasses inside *.server.ts files", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-oxlint-server-htmlelement-"));
    const routeFile = path.join(appDir, "index.server.ts");

    temporaryPaths.add(appDir);
    await writeFile(
      routeFile,
      `export class Leaked extends HTMLElement {}

export async function loader() {
  return {};
}
`,
      "utf8",
    );

    const result = await runOxlint(routeFile);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("no-htmlelement-in-server-module");
  });

  it("flags index.server.ts that mixes a default export with loader/action", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-oxlint-default-loader-"));
    const routeFile = path.join(appDir, "index.server.ts");

    temporaryPaths.add(appDir);
    await writeFile(
      routeFile,
      `export async function loader() {
  return {};
}

export default async function handler() {
  return new Response("ok");
}
`,
      "utf8",
    );

    const result = await runOxlint(routeFile);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("no-default-with-loader-action");
  });

  it("flags top-level browser globals in browser-reachable modules", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-oxlint-top-globals-"));
    const routeFile = path.join(appDir, "error.ts");

    temporaryPaths.add(appDir);
    await writeFile(
      routeFile,
      `import { html } from "elemental";

const title = document.title;

export default function errorBoundary() {
  return html\`<p>${"${title}"}</p>\`;
}
`,
      "utf8",
    );

    const result = await runOxlint(routeFile);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("no-browser-globals-at-top-level");
  });

  it("allows guarded browser global access via typeof", async () => {
    const appDir = await mkdtemp(path.join(rootDir, ".tmp-oxlint-typeof-guard-"));
    const routeFile = path.join(appDir, "index.ts");

    temporaryPaths.add(appDir);
    await writeFile(
      routeFile,
      `import { html } from "elemental";

const isBrowser = typeof window !== "undefined";

export default function index() {
  return html\`<p>${"${isBrowser ? 'browser' : 'server'}"}</p>\`;
}
`,
      "utf8",
    );

    const result = await runOxlint(routeFile);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("no-browser-globals-at-top-level");
  });
});

async function runOxlint(filePath: string): Promise<{
  exitCode: number;
  output: string;
}> {
  try {
    const result = await execFileAsync(oxlintBinPath, ["--config", oxlintConfigPath, filePath], {
      cwd: rootDir,
    });

    return {
      exitCode: 0,
      output: `${result.stdout}\n${result.stderr}`,
    };
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    const failedResult = error as Error & {
      code?: number | string;
      stderr?: string;
      stdout?: string;
    };

    return {
      exitCode: typeof failedResult.code === "number" ? failedResult.code : 1,
      output: `${failedResult.stdout ?? ""}\n${failedResult.stderr ?? ""}`,
    };
  }
}
