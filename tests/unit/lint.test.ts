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
