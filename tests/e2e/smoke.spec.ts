import { expect, test } from "@playwright/test";
import { expectShellPreserved, rememberShellMarker } from "./test-helpers/shell.ts";

type ElementalWindow = Window & {
  __elementalShellMarker?: Element | null;
  __elementalTransitionProbe?: {
    afterCallbackStyles?: string[];
    beforeCallbackStyles?: string[];
    release?: () => void;
  };
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
  await rememberShellMarker(page);
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
  await expectShellPreserved(page);

  await page.goBack();

  await expect(page).toHaveURL(/\/$/u);
  await expect(page).toHaveTitle("Home");
  await expect(page.getByRole("heading", { name: "Elemental Example App" })).toBeVisible();
  await expect(page.locator('meta[name="description"]')).toHaveCount(0);
});

test("does not refetch managed stylesheets on client navigation", async ({ page }) => {
  const stylesheetRequests: string[] = [];

  page.on("request", (request) => {
    if (request.resourceType() === "stylesheet") {
      stylesheetRequests.push(new URL(request.url()).pathname);
    }
  });

  await page.goto("/guides");
  stylesheetRequests.length = 0;

  await page.getByRole("link", { name: "Home" }).click();

  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole("heading", { name: "Elemental Example App" })).toBeVisible();
  expect(stylesheetRequests).toEqual([]);
});

test("keeps outgoing guides styles attached until the view transition swaps routes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const currentStyles = () =>
      [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
        (link) => new URL(link.href).pathname,
      );
    const probe: NonNullable<ElementalWindow["__elementalTransitionProbe"]> = ((
      window as ElementalWindow
    ).__elementalTransitionProbe = {});

    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: ((callback: () => Promise<void> | void) => {
        let releaseTransition: (() => void) | undefined;
        let callbackResult: Promise<void> | void;

        probe.beforeCallbackStyles = currentStyles();

        try {
          callbackResult = callback();
        } catch (error) {
          callbackResult = Promise.reject(error);
        }

        const updateCallbackDone = Promise.resolve(callbackResult)
          .then(() => {
            probe.afterCallbackStyles = currentStyles();
          })
          .catch(() => {});

        probe.release = () => {
          releaseTransition?.();
        };

        return {
          finished: new Promise<void>((resolve) => {
            releaseTransition = resolve;
          }),
          ready: Promise.resolve(undefined),
          skipTransition: () => {
            releaseTransition?.();
          },
          types: new Set<string>(),
          updateCallbackDone,
        } as ViewTransition;
      }) as unknown as Document["startViewTransition"],
    });
  });

  await page.goto("/guides");
  await page.getByRole("link", { name: "About" }).click();

  await expect
    .poll(async () =>
      page.evaluate(() =>
        ((window as ElementalWindow).__elementalTransitionProbe?.beforeCallbackStyles ?? []).some(
          (href) => /\/assets\/guides-layout-.*\.css$/u.test(href),
        ),
      ),
    )
    .toBe(true);
  await expect
    .poll(async () =>
      page.evaluate(() =>
        ((window as ElementalWindow).__elementalTransitionProbe?.afterCallbackStyles ?? []).some(
          (href) => /\/assets\/guides-layout-.*\.css$/u.test(href),
        ),
      ),
    )
    .toBe(true);

  await page.evaluate(() => {
    (window as ElementalWindow).__elementalTransitionProbe?.release?.();
  });

  await expect(page).toHaveURL(/\/about$/u);
  await expect(page.getByRole("heading", { name: "About Elemental" })).toBeVisible();
  await expect(page.locator('link[rel="stylesheet"]')).not.toHaveAttribute(
    "href",
    /\/assets\/guides-layout-.*\.css$/u,
  );
});

test("navigates into a nested dynamic guide route with loader data", async ({ page }) => {
  await page.goto("/guides");
  await rememberShellMarker(page);

  await page.getByRole("link", { name: "Runtime SSR" }).click();

  await expect(page).toHaveURL(/\/guides\/runtime-ssr$/u);
  await expect(page).toHaveTitle("Guide: Runtime SSR");
  await expect(page.locator("#guides-layout-marker")).toHaveText(
    "This sidebar comes from guides/layout.ts.",
  );
  await expect(page.getByRole("heading", { name: "Guide: Runtime SSR" })).toBeVisible();
  await expect(page.locator("#guide-topic")).toHaveText("runtime-ssr");
  await expect(page.locator("guide-callout")).toHaveAttribute("data-upgraded", "true");
  await expect(page.locator("guide-callout [data-callout-label]")).toHaveText(
    "Dynamic route upgrade",
  );
  await expect(
    page.locator("guide-callout").evaluate((element) => element.shadowRoot !== null),
  ).resolves.toBe(true);
  await expect(
    page.locator("guide-callout").evaluate((element) => {
      const originalAttachShadowDescriptor = Object.getOwnPropertyDescriptor(
        Element.prototype,
        "attachShadow",
      );
      let attachShadowCalls = 0;

      Object.defineProperty(Element.prototype, "attachShadow", {
        configurable: true,
        value(this: Element, init: ShadowRootInit) {
          attachShadowCalls += 1;
          return originalAttachShadowDescriptor?.value.call(this, init) as ShadowRoot;
        },
      });

      try {
        element.remove();
        document.body.append(element);

        return attachShadowCalls;
      } finally {
        if (originalAttachShadowDescriptor !== undefined) {
          Object.defineProperty(Element.prototype, "attachShadow", originalAttachShadowDescriptor);
        }
      }
    }),
  ).resolves.toBe(0);
  await expectShellPreserved(page);
});

test("enhances post forms that redirect back into the router", async ({ page }) => {
  await page.goto("/guestbook");
  await rememberShellMarker(page);

  await page.getByLabel("Name").fill("Ada");
  await page.getByLabel("Message").fill("Router flows through Response redirects.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page).toHaveURL(/\/guestbook\?/u);
  await expect(page).toHaveTitle("Guestbook");
  await expect(page.locator("#guestbook-status")).toHaveText(
    "Saved a note for Ada: Router flows through Response redirects.",
  );
  await expectShellPreserved(page);
});

test("enhances same-origin get forms through the router", async ({ page }) => {
  await page.goto("/search");
  await rememberShellMarker(page);

  await page.getByLabel("Query").fill("router");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/\/search\?q=router$/u);
  await expect(page).toHaveTitle("Search router");
  await expect(page.locator("#search-query")).toHaveText("router");
  await expectShellPreserved(page);
});

test("restores enhanced GET form history entries on back and forward navigation", async ({
  page,
}) => {
  await page.goto("/search");
  await rememberShellMarker(page);

  await page.getByLabel("Query").fill("router");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/\/search\?q=router$/u);
  await expect(page.locator("#search-query")).toHaveText("router");

  await page.goBack();

  await expect(page).toHaveURL(/\/search$/u);
  await expect(page).toHaveTitle("Search empty");
  await expect(page.locator("#search-query")).toHaveText("empty");
  await expectShellPreserved(page);

  await page.goForward();

  await expect(page).toHaveURL(/\/search\?q=router$/u);
  await expect(page).toHaveTitle("Search router");
  await expect(page.locator("#search-query")).toHaveText("router");
  await expectShellPreserved(page);
});

test("recovers client-side navigation through the nearest browser boundary", async ({ page }) => {
  await page.goto("/");
  await rememberShellMarker(page);

  await page.getByRole("link", { name: "Recover" }).click();

  await expect(page.getByRole("heading", { name: "Recovered Route" })).toBeVisible();
  await expect(page.locator("#recovery-message")).toHaveText("recoverable client failure");

  // Verify error.ts head() output updates document.head during client-side recovery
  await expect(page).toHaveTitle("Recovered");
  await expect(page.locator('meta[name="recovery-status"]')).toHaveAttribute("content", "200");

  await expectShellPreserved(page);
});

test("escapes intercepted reload fallbacks with a document navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Reload" }).click();

  await expect(page).toHaveURL(/\/reload$/u);
  await expect(page.getByRole("heading", { name: "Reload Route" })).toBeVisible();

  await page.getByRole("link", { name: "Home" }).click();

  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole("heading", { name: "Elemental Example App" })).toBeVisible();
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
