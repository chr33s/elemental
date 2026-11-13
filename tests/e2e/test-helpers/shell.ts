import { expect, type Page } from "@playwright/test";

type ElementalWindow = Window & {
	__elementalShellMarker?: Element | null;
};

export async function rememberShellMarker(page: Page): Promise<void> {
	await page.evaluate(() => {
		(window as ElementalWindow).__elementalShellMarker =
			document.querySelector("[data-route-outlet]");
	});
}

export async function expectShellPreserved(
	page: Page,
	options: {
		layout?: boolean;
	} = {},
): Promise<void> {
	await expect(
		page.evaluate(
			() =>
				document.querySelector("[data-route-outlet]") ===
				(window as ElementalWindow).__elementalShellMarker,
		),
	).resolves.toBe(true);

	if (options.layout !== false) {
		await expect(page.locator("#shell-marker")).toHaveText("Persistent shell");
	}
}
