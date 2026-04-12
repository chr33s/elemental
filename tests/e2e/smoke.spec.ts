import { expect, test } from "@playwright/test";

test("renders the fixture root route", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Elemental Fixture" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-elemental", "ready");
});
