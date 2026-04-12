import { expect, test } from "@playwright/test";

type ElementalWindow = Window & {
  __elementalShellMarker?: Element | null;
};

test("boots the browser runtime on the initial route", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Elemental Fixture" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-elemental", "ready");
  await expect(page.locator("fixture-greeting")).toHaveAttribute("data-upgraded", "true");
  await expect(page.locator("fixture-greeting")).toHaveText("Router ready");
});

test("navigates client-side while preserving the shell", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    (window as ElementalWindow).__elementalShellMarker = document.querySelector("#shell-marker");
  });

  await page.getByRole("link", { name: "About" }).click();

  await expect(page).toHaveURL(/\/about$/u);
  await expect(page).toHaveTitle("About");
  await expect(page.getByRole("heading", { name: "About Elemental" })).toBeVisible();
  await expect(page.locator("fixture-badge")).toHaveAttribute("data-upgraded", "true");
  await expect(
    page.evaluate(
      () =>
        document.querySelector("#shell-marker") ===
        (window as ElementalWindow).__elementalShellMarker,
    ),
  ).resolves.toBe(true);

  await page.goBack();

  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole("heading", { name: "Elemental Fixture" })).toBeVisible();
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
