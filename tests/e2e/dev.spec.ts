import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  replaceInFile,
  startDevWorkspace,
  waitForDevClientReady,
} from "./test-helpers/dev-workspace.ts";
import { expectShellPreserved, rememberShellMarker } from "./test-helpers/shell.ts";

const rootDir = fileURLToPath(new URL("../../", import.meta.url));
const fixtureAppDir = path.join(rootDir, "spec/fixtures/basic-app/src");

test.describe.configure({ mode: "serial" });

test("hot swaps layout.css without reloading the page", async ({ page }) => {
  test.setTimeout(120_000);

  const devServer = await startDevWorkspace({ fixtureAppDir, rootDir });

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

  const devServer = await startDevWorkspace({ fixtureAppDir, rootDir });

  try {
    await page.goto(`${devServer.url}/search?q=router`);
    await expect(page.locator('script[data-elemental-dev-client="true"]')).toHaveCount(1);
    await waitForDevClientReady(page);
    await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
    await expect(page).toHaveTitle("Search router");
    await rememberShellMarker(page);
    await page.evaluate(() => {
      (window as Window & { __elementalDevToken?: string }).__elementalDevToken = "route-hmr";
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
    await expectShellPreserved(page);
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
      .toBe("route-hmr");
  } finally {
    await devServer.cleanup();
  }
});

test("falls back to a full reload for server-module changes", async ({ page }) => {
  test.setTimeout(120_000);

  const devServer = await startDevWorkspace({ fixtureAppDir, rootDir });

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
