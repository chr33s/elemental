import { expect, test } from "@playwright/test";

type ElementalWindow = Window & {
  __elementalShellMarker?: Element | null;
};

test("boots the browser runtime on the initial route", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Elemental Example App" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-elemental", "ready");
  await expect(page.locator("fixture-greeting")).toHaveAttribute("data-upgraded", "true");
  await expect(page.locator("fixture-greeting")).toHaveText("Router ready");
});

test("navigates client-side while preserving the shell", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    (window as ElementalWindow).__elementalShellMarker = document.querySelector("#shell-marker");
  });
  await expect(page.evaluate(() => Boolean(customElements.get("fixture-badge")))).resolves.toBe(
    false,
  );

  await page.getByRole("link", { name: "About" }).click();

  await expect(page).toHaveURL(/\/about$/u);
  await expect(page).toHaveTitle("About");
  await expect(page.getByRole("heading", { name: "About Elemental" })).toBeVisible();
  await expect(page.locator("fixture-badge")).toHaveAttribute("data-upgraded", "true");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "About the Elemental fixture",
  );
  await expect(page.evaluate(() => Boolean(customElements.get("fixture-badge")))).resolves.toBe(
    true,
  );
  await expect(
    page.evaluate(
      () =>
        document.querySelector("#shell-marker") ===
        (window as ElementalWindow).__elementalShellMarker,
    ),
  ).resolves.toBe(true);

  await page.goBack();

  await expect(page).toHaveURL(/\/$/u);
  await expect(page).toHaveTitle("Home");
  await expect(page.getByRole("heading", { name: "Elemental Example App" })).toBeVisible();
  await expect(page.locator('meta[name="description"]')).toHaveCount(0);
});

test("navigates into a nested dynamic guide route with loader data", async ({ page }) => {
  await page.goto("/guides");
  await page.evaluate(() => {
    (window as ElementalWindow).__elementalShellMarker = document.querySelector("#shell-marker");
  });

  await page.getByRole("link", { name: "Runtime SSR" }).click();

  await expect(page).toHaveURL(/\/guides\/runtime-ssr$/u);
  await expect(page).toHaveTitle("Guide: Runtime SSR");
  await expect(page.locator("#guides-layout-marker")).toHaveText(
    "This sidebar comes from guides/layout.ts.",
  );
  await expect(page.getByRole("heading", { name: "Guide: Runtime SSR" })).toBeVisible();
  await expect(page.locator("#guide-topic")).toHaveText("runtime-ssr");
  await expect(page.locator("guide-callout")).toHaveAttribute("data-upgraded", "true");
  await expect(page.locator("guide-callout")).toHaveText("Dynamic route upgrade");
  await expect(
    page.evaluate(
      () =>
        document.querySelector("#shell-marker") ===
        (window as ElementalWindow).__elementalShellMarker,
    ),
  ).resolves.toBe(true);
});

test("enhances post forms that redirect back into the router", async ({ page }) => {
  await page.goto("/guestbook");
  await page.evaluate(() => {
    (window as ElementalWindow).__elementalShellMarker = document.querySelector("#shell-marker");
  });

  await page.getByLabel("Name").fill("Ada");
  await page.getByLabel("Message").fill("Router flows through Response redirects.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page).toHaveURL(/\/guestbook\?/u);
  await expect(page).toHaveTitle("Guestbook");
  await expect(page.locator("#guestbook-status")).toHaveText(
    "Saved a note for Ada: Router flows through Response redirects.",
  );
  await expect(
    page.evaluate(
      () =>
        document.querySelector("#shell-marker") ===
        (window as ElementalWindow).__elementalShellMarker,
    ),
  ).resolves.toBe(true);
});

test("enhances same-origin get forms through the router", async ({ page }) => {
  await page.goto("/search");
  await page.evaluate(() => {
    (window as ElementalWindow).__elementalShellMarker = document.querySelector("#shell-marker");
  });

  await page.getByLabel("Query").fill("router");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/\/search\?q=router$/u);
  await expect(page).toHaveTitle("Search router");
  await expect(page.locator("#search-query")).toHaveText("router");
  await expect(
    page.evaluate(
      () =>
        document.querySelector("#shell-marker") ===
        (window as ElementalWindow).__elementalShellMarker,
    ),
  ).resolves.toBe(true);
});

test("recovers client-side navigation through the nearest browser boundary", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    (window as ElementalWindow).__elementalShellMarker = document.querySelector("#shell-marker");
  });

  await page.getByRole("link", { name: "Recover" }).click();

  await expect(page.getByRole("heading", { name: "Recovered Route" })).toBeVisible();
  await expect(page.locator("#recovery-message")).toHaveText("recoverable client failure");
  await expect(page).toHaveTitle("Recovered");
  await expect(page.locator('meta[name="recovery-status"]')).toHaveAttribute("content", "200");
  await expect(
    page.evaluate(
      () =>
        document.querySelector("#shell-marker") ===
        (window as ElementalWindow).__elementalShellMarker,
    ),
  ).resolves.toBe(true);
});

test("falls back to a full reload when no browser boundary exists", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "navigation", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/");
  await page.evaluate(() => {
    (window as Window & { __elementalNavigationToken?: string }).__elementalNavigationToken =
      "spa-shell";
  });

  await page.getByRole("link", { name: "Reload" }).click();

  await expect(page).toHaveURL(/\/reload$/u);
  await expect(page.getByRole("heading", { name: "Reload Route" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-elemental", "error");
  await expect(
    page.evaluate(
      () => (window as Window & { __elementalNavigationToken?: string }).__elementalNavigationToken,
    ),
  ).resolves.toBeUndefined();
});
