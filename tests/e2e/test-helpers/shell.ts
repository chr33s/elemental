import { expect, type Page } from "@playwright/test";

type ElementalWindow = Window & {
  __elementalShellMarker?: Element | null;
};

export async function rememberShellMarker(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as ElementalWindow).__elementalShellMarker = document.querySelector("#shell-marker");
  });
}

export async function expectShellPreserved(page: Page): Promise<void> {
  await expect(
    page.evaluate(
      () =>
        document.querySelector("#shell-marker") ===
        (window as ElementalWindow).__elementalShellMarker,
    ),
  ).resolves.toBe(true);
}
