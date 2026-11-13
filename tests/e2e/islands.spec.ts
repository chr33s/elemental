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
	await expect(page.getByRole("heading", { name: "Elemental Example App" })).toBeVisible();
	// Back navigation re-renders the layout inside the document outlet, so the
	// view transition is still moving that island until its animations finish.
	await page.evaluate(() =>
		Promise.all(
			document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
		),
	);

	const islandAfterBack = page.locator(islandSelector);
	await expect(islandAfterBack).toBeVisible();
	await islandAfterBack.evaluate((element) => {
		element.scrollIntoView();
	});
	await expect(islandAfterBack).toHaveAttribute("data-mounted", "true");
	await expect(islandAfterBack).toHaveText("Island activated on visibility");
});
