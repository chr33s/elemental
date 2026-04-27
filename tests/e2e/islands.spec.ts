import { expect, test } from "@playwright/test";

const islandSelector = '[data-elemental-island="feature-card"]';

test("activates a visible island and persists across client navigation", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-elemental", "ready");

  const island = page.locator(islandSelector);
  await expect(island).toBeVisible();
  await island.scrollIntoViewIfNeeded();

  await expect(island).toHaveAttribute("data-mounted", "true");
  await expect(island).toHaveAttribute("data-elemental-island-active", "");
  await expect(island).toHaveText("Island activated on visibility");

  // Navigate away and back to verify the island re-renders without losing
  // its activation lifecycle and without throwing on the second mount.
  await page.getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL(/\/about$/u);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/u);

  const islandAfterBack = page.locator(islandSelector);
  await islandAfterBack.scrollIntoViewIfNeeded();
  await expect(islandAfterBack).toHaveAttribute("data-mounted", "true");
  await expect(islandAfterBack).toHaveText("Island activated on visibility");
});
