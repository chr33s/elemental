import { spawn, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

type DevChildProcess = ChildProcessByStdio<null, Readable, Readable>;

const rootDir = fileURLToPath(new URL("../../", import.meta.url));
const fixtureAppDir = path.join(rootDir, "spec/fixtures/basic-app/src");

test.describe.configure({ mode: "serial" });

test("hot swaps layout.css without reloading the page", async ({ page }) => {
  test.setTimeout(120_000);

  const devServer = await startDevWorkspace();

  try {
    await page.goto(devServer.url);
    await expect(page.locator('script[data-elemental-dev-client="true"]')).toHaveCount(1);
    await waitForDevClientReady(page);
    await expect(page.locator("#shell-marker")).toHaveText("Persistent shell");
    await page.evaluate(() => {
      (window as Window & { __elementalDevToken?: string }).__elementalDevToken = "css-hot";
    });

    await replaceInFile(
      path.join(devServer.workspaceDir, "src/layout.css"),
      "  color: #4a5568;",
      "  color: #c1121f;",
    );

    await expect(page.locator("#shell-marker")).toHaveCSS("color", "rgb(193, 18, 31)", {
      timeout: 30_000,
    });
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as Window & { __elementalDevToken?: string }).__elementalDevToken,
          ),
        {
          timeout: 30_000,
        },
      )
      .toBe("css-hot");
  } finally {
    await devServer.cleanup();
  }
});

test("rerenders the current route in place for safe browser-only module edits", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const devServer = await startDevWorkspace();

  try {
    await page.goto(`${devServer.url}/search?q=router`);
    await expect(page.locator('script[data-elemental-dev-client="true"]')).toHaveCount(1);
    await waitForDevClientReady(page);
    await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
    await expect(page).toHaveTitle("Search router");
    await page.evaluate(() => {
      const elementalWindow = window as Window & {
        __elementalDevToken?: string;
        __elementalShellMarker?: Element | null;
      };

      elementalWindow.__elementalDevToken = "route-hmr";
      elementalWindow.__elementalShellMarker = document.querySelector("#shell-marker");
    });

    await replaceInFile(
      path.join(devServer.workspaceDir, "src/search/index.ts"),
      "return html`<title>Search ${query}</title>`;",
      "return html`<title>Lookup ${query}</title>`;",
    );
    await replaceInFile(
      path.join(devServer.workspaceDir, "src/search/index.ts"),
      "      <h1>Search</h1>",
      "      <h1>Search results</h1>",
    );

    await expect(page).toHaveTitle("Lookup router", {
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const elementalWindow = window as Window & {
              __elementalDevToken?: string;
              __elementalShellMarker?: Element | null;
            };

            return {
              sameShell:
                document.querySelector("#shell-marker") === elementalWindow.__elementalShellMarker,
              token: elementalWindow.__elementalDevToken,
            };
          }),
        {
          timeout: 30_000,
        },
      )
      .toEqual({
        sameShell: true,
        token: "route-hmr",
      });
  } finally {
    await devServer.cleanup();
  }
});

test("falls back to a full reload for server-module changes", async ({ page }) => {
  test.setTimeout(120_000);

  const devServer = await startDevWorkspace();

  try {
    await page.goto(`${devServer.url}/guides/runtime-ssr`);
    await expect(page.locator('script[data-elemental-dev-client="true"]')).toHaveCount(1);
    await waitForDevClientReady(page);
    await expect(page.getByRole("heading", { name: "Guide: Runtime SSR" })).toBeVisible();
    const reloadNavigation = page.waitForEvent("framenavigated", {
      predicate: (frame) =>
        frame === page.mainFrame() && frame.url().endsWith("/guides/runtime-ssr"),
      timeout: 30_000,
    });

    await replaceInFile(
      path.join(devServer.workspaceDir, "src/guides/[topic]/index.server.ts"),
      '    summary: "Runtime SSR is the only rendering mode in Elemental v0.",',
      '    summary: "Runtime SSR reloads the full document after server-only edits in dev mode.",',
    );

    await reloadNavigation;
    await expect(
      page.getByText("Runtime SSR reloads the full document after server-only edits in dev mode."),
    ).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await devServer.cleanup();
  }
});

async function startDevWorkspace(): Promise<{
  childProcess: DevChildProcess;
  cleanup: () => Promise<void>;
  url: string;
  workspaceDir: string;
}> {
  const workspaceDir = await mkdtemp(path.join(rootDir, ".tmp-phase12-dev-"));
  const port = await findAvailablePort();

  await cp(fixtureAppDir, path.join(workspaceDir, "src"), {
    recursive: true,
  });

  const childProcess = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      path.join(rootDir, "src/cli/index.ts"),
      "dev",
      "--port",
      String(port),
    ],
    {
      cwd: workspaceDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";

  childProcess.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  childProcess.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  await waitForDevServerReady(childProcess, port, () => output);

  return {
    childProcess,
    cleanup: async () => {
      if (childProcess.exitCode === null && !childProcess.killed) {
        childProcess.kill("SIGTERM");
        await once(childProcess, "exit").catch(() => {});
      }

      await rm(workspaceDir, {
        force: true,
        recursive: true,
      });
    },
    url: `http://127.0.0.1:${port}`,
    workspaceDir,
  };
}

async function waitForDevServerReady(
  childProcess: DevChildProcess,
  port: number,
  getOutput: () => string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for dev server on port ${port}.\n${getOutput()}`));
    }, 30_000);
    const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(new Error(`Dev server exited early (${signal ?? code ?? 1}).\n${getOutput()}`));
    };
    const handleOutput = () => {
      if (!getOutput().includes(`Elemental dev listening on http://127.0.0.1:${port}`)) {
        return;
      }

      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timeout);
      childProcess.off("exit", handleExit);
      childProcess.stdout.off("data", handleOutput);
      childProcess.stderr.off("data", handleOutput);
    };

    childProcess.once("exit", handleExit);
    childProcess.stdout.on("data", handleOutput);
    childProcess.stderr.on("data", handleOutput);
    handleOutput();
  });
}

async function replaceInFile(filePath: string, oldText: string, newText: string): Promise<void> {
  const sourceText = await readFile(filePath, "utf8");

  if (!sourceText.includes(oldText)) {
    throw new Error(`Could not find expected text in ${filePath}`);
  }

  await writeFile(filePath, sourceText.replace(oldText, newText), "utf8");
}

async function waitForDevClientReady(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          devClientStatus: (
            window as Window & {
              __elementalDevClientStatus?: "connecting" | "error" | "open";
            }
          ).__elementalDevClientStatus,
          hasRuntimeApi: Boolean(
            (
              window as Window & {
                __elementalBrowserRuntime?: unknown;
              }
            ).__elementalBrowserRuntime,
          ),
        })),
      {
        timeout: 30_000,
      },
    )
    .toEqual({
      devClientStatus: "open",
      hasRuntimeApi: true,
    });
}

async function findAvailablePort(): Promise<number> {
  const probe = createServer();

  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => resolve());
  });

  const address = probe.address();

  if (address === null || typeof address === "string") {
    await new Promise<void>((resolve) => {
      probe.close(() => resolve());
    });
    throw new Error("Could not allocate a port for the Phase 12 dev test server.");
  }

  const { port } = address;

  await new Promise<void>((resolve, reject) => {
    probe.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return port;
}
