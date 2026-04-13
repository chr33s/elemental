import type { BuildManifest } from "../../build/manifest.ts";
import type { RouterPayload } from "../server/app.ts";
import { matchManifestRoute, type MatchedManifestRoute } from "../shared/routes.ts";
import { recoverFromClientError } from "./errors.ts";
import { createFormSubmission, type FormNavigationSubmission } from "./forms.ts";
import { normalizeAssetHref, renderManagedHead, syncManagedStylesheets } from "./head.ts";
import {
  registerCustomElementDefinitions,
  type BrowserModuleNamespace,
} from "./register-elements.ts";

export type NavigationHistoryMode = "auto" | "none" | "push" | "replace";

export interface BootstrapState {
  currentRoute?: MatchedManifestRoute;
  loadedScriptModules: Set<string>;
  manifest: BuildManifest;
}

interface ElementalNavigationApi extends EventTarget {
  navigate(url: string): void;
}

interface ElementalNavigateEvent extends Event {
  canIntercept: boolean;
  destination: {
    url: string;
  };
  hashChange: boolean;
  intercept(options: {
    handler: () => Promise<void> | void;
    scroll?: "after-transition" | "manual";
  }): void;
}

interface ViewTransitionLike {
  finished: Promise<void>;
}

const ROUTER_HEADER_NAME = "X-Elemental-Router";

export function installNavigationInterceptors(state: BootstrapState): void {
  const navigationApi = getNavigationApi();

  document.addEventListener("click", (event) => {
    const anchor = findNavigableAnchor(event);

    if (anchor === undefined) {
      return;
    }

    const nextUrl = new URL(anchor.href, window.location.href);

    if (!shouldInterceptLinkNavigation(anchor, nextUrl, event)) {
      return;
    }

    event.preventDefault();

    if (navigationApi !== undefined) {
      navigationApi.navigate(nextUrl.href);
      return;
    }

    void navigate(state, nextUrl, { history: "push" });
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;

    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const submission = createFormSubmission(form, event);

    if (submission === undefined) {
      return;
    }

    event.preventDefault();
    void submitFormNavigation(state, submission.url, submission);
  });

  if (navigationApi !== undefined) {
    navigationApi.addEventListener("navigate", (event) => {
      const navigateEvent = event as ElementalNavigateEvent;

      if (!navigateEvent.canIntercept || navigateEvent.hashChange) {
        return;
      }

      const nextUrl = new URL(navigateEvent.destination.url);

      if (nextUrl.origin !== window.location.origin) {
        return;
      }

      navigateEvent.intercept({
        handler: () => navigate(state, nextUrl, { history: "auto" }),
        scroll: "after-transition",
      });
    });

    return;
  }

  window.addEventListener("popstate", () => {
    void navigate(state, new URL(window.location.href), { history: "none" });
  });
}

export async function refreshCurrentRoute(state: BootstrapState): Promise<void> {
  const currentUrl = new URL(window.location.href);
  const response = await fetch(currentUrl, {
    cache: "no-store",
    headers: {
      [ROUTER_HEADER_NAME]: "true",
    },
  });

  if (!isRouterPayloadResponse(response)) {
    fallbackToDocumentNavigation(currentUrl, true);
    return;
  }

  await applyNavigationPayload(
    state,
    currentUrl,
    response,
    "none",
    matchManifestRoute(currentUrl.pathname, state.manifest.routes),
  );
}

export async function syncCurrentRouteStylesheets(state: BootstrapState): Promise<void> {
  const matchedRoute = matchManifestRoute(window.location.pathname, state.manifest.routes);

  if (matchedRoute === undefined) {
    fallbackToDocumentNavigation(new URL(window.location.href), true);
    return;
  }

  const removeObsoleteStylesheets = await syncManagedStylesheets(
    getRouteStylesheetAssets(matchedRoute.route),
  );

  removeObsoleteStylesheets();
  state.currentRoute = matchedRoute;
}

export async function loadScriptModules(
  state: BootstrapState,
  scriptHrefs: string[],
): Promise<void> {
  const pendingScriptHrefs = [...new Set(scriptHrefs.map(normalizeAssetHref))].filter(
    (scriptHref) => scriptHref !== import.meta.url && !state.loadedScriptModules.has(scriptHref),
  );

  if (pendingScriptHrefs.length === 0) {
    return;
  }

  const importedModules = await Promise.all(
    pendingScriptHrefs.map(async (scriptHref) => {
      const moduleNamespace = await import(scriptHref);

      state.loadedScriptModules.add(scriptHref);
      return moduleNamespace;
    }),
  );

  for (const moduleNamespace of importedModules) {
    registerCustomElements(moduleNamespace);
  }
}

export function getRouteScriptAssets(route: MatchedManifestRoute["route"]): string[] {
  return route.assets.js ?? route.assets.scripts ?? [];
}

export function getRouteStylesheetAssets(route: MatchedManifestRoute["route"]): string[] {
  return (route.assets.css ?? route.assets.layoutCss ?? []).map((assetPath) =>
    normalizeAssetHref(assetPath),
  );
}

async function submitFormNavigation(
  state: BootstrapState,
  url: URL,
  options: FormNavigationSubmission,
): Promise<void> {
  const response = await fetch(url, {
    body: options.body,
    headers: {
      [ROUTER_HEADER_NAME]: "true",
    },
    method: options.method,
  });

  if (isRouterPayloadResponse(response)) {
    await applyNavigationPayload(state, url, response, options.history);
    return;
  }

  if (response.redirected) {
    await navigate(state, new URL(response.url), { history: options.history });
    return;
  }

  await replaceEntireDocument(response);
}

async function navigate(
  state: BootstrapState,
  url: URL,
  options: {
    history: NavigationHistoryMode;
  },
): Promise<void> {
  if (isHashOnlyNavigation(url)) {
    applyHistory(url, options.history);
    window.location.hash = url.hash;
    return;
  }

  const matchedRoute = matchManifestRoute(url.pathname, state.manifest.routes);

  try {
    const response = await fetch(url, {
      headers: {
        [ROUTER_HEADER_NAME]: "true",
      },
    });

    if (!isRouterPayloadResponse(response)) {
      fallbackToDocumentNavigation(url, options.history === "replace");
      return;
    }

    await applyNavigationPayload(state, url, response, options.history, matchedRoute);
  } catch (error) {
    await recoverFromClientError({
      error,
      fallback: () => {
        fallbackToDocumentNavigation(url, options.history === "replace");
      },
      manifest: state.manifest,
      matchedRoute,
      renderHead: renderManagedHead,
      renderOutlet: renderRouteOutlet,
      resolver: resolveBrowserModule,
      url,
    });
  }
}

async function applyNavigationPayload(
  state: BootstrapState,
  requestedUrl: URL,
  response: Response,
  history: NavigationHistoryMode,
  matchedRoute = matchManifestRoute(requestedUrl.pathname, state.manifest.routes),
): Promise<void> {
  const payload = (await response.json()) as RouterPayload;
  const finalUrl = new URL(response.url || requestedUrl.href);
  const finalRoute = matchManifestRoute(finalUrl.pathname, state.manifest.routes);

  try {
    const removeObsoleteStylesheets = await syncManagedStylesheets(payload.assets.stylesheets);
    await loadScriptModules(state, payload.assets.scripts);

    await performViewTransition(async () => {
      renderRouteOutlet(payload.outlet);
      renderManagedHead(payload.head);
    });

    removeObsoleteStylesheets();
    applyHistory(finalUrl, history);
    state.currentRoute = finalRoute ?? matchedRoute;
  } catch (error) {
    await recoverFromClientError({
      error,
      fallback: () => {
        fallbackToDocumentNavigation(finalUrl, history === "replace");
      },
      manifest: state.manifest,
      matchedRoute: finalRoute ?? matchedRoute,
      renderHead: renderManagedHead,
      renderOutlet: renderRouteOutlet,
      resolver: resolveBrowserModule,
      status: payload.status,
      statusText: response.statusText,
      url: finalUrl,
    });
  }
}

async function performViewTransition(callback: () => Promise<void> | void): Promise<void> {
  const elementalDocument = document as Document & {
    startViewTransition?: (callback: () => Promise<void> | void) => ViewTransitionLike;
  };

  if (typeof elementalDocument.startViewTransition !== "function") {
    await callback();
    return;
  }

  const transition = elementalDocument.startViewTransition(callback);

  await transition.finished.catch(() => {});
}

function renderRouteOutlet(outlet: string): void {
  const routeOutlet = document.querySelector("[data-route-outlet]");

  if (!(routeOutlet instanceof HTMLElement)) {
    throw new Error("Missing [data-route-outlet] container in the current document.");
  }

  routeOutlet.innerHTML = outlet;
}

function registerCustomElements(moduleNamespace: BrowserModuleNamespace): void {
  registerCustomElementDefinitions(moduleNamespace, customElements, HTMLElement);
}

function resolveBrowserModule<TModule>(modulePath: string): Promise<TModule> {
  return import(normalizeAssetHref(modulePath)) as Promise<TModule>;
}

async function replaceEntireDocument(response: Response): Promise<void> {
  const documentMarkup = await response.text();

  document.open();
  document.write(documentMarkup);
  document.close();
}

function applyHistory(url: URL, historyMode: NavigationHistoryMode): void {
  if (historyMode === "auto" || historyMode === "none") {
    return;
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;

  if (historyMode === "replace") {
    window.history.replaceState(null, "", nextUrl);
    return;
  }

  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
    window.history.pushState(null, "", nextUrl);
  }
}

function fallbackToDocumentNavigation(url: URL, replace: boolean): void {
  window.setTimeout(() => {
    if (getNavigationApi() !== undefined) {
      void replaceDocumentFromUrl(url, replace).catch(() => {
        performDocumentNavigation(url, replace);
      });

      return;
    }

    performDocumentNavigation(url, replace);
  }, 0);
}

async function replaceDocumentFromUrl(url: URL, replace: boolean): Promise<void> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
    },
  });
  const finalUrl = new URL(response.url || url.href);
  const nextUrl = `${finalUrl.pathname}${finalUrl.search}${finalUrl.hash}`;

  if (
    replace ||
    `${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl
  ) {
    window.history.replaceState(null, "", nextUrl);
  }

  await replaceEntireDocument(response);
}

function performDocumentNavigation(url: URL, replace: boolean): void {
  if (window.location.href === url.href) {
    window.location.reload();
    return;
  }

  if (replace) {
    window.location.replace(url.href);
    return;
  }

  window.location.assign(url.href);
}

function shouldInterceptLinkNavigation(
  anchor: HTMLAnchorElement,
  url: URL,
  event: MouseEvent,
): boolean {
  if (event.button !== 0 || event.defaultPrevented) {
    return false;
  }

  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }

  if (anchor.hasAttribute("download") || anchor.target === "_blank") {
    return false;
  }

  if (url.origin !== window.location.origin) {
    return false;
  }

  return !isHashOnlyNavigation(url);
}

function findNavigableAnchor(event: MouseEvent): HTMLAnchorElement | undefined {
  const eventTarget = event.target;

  if (!(eventTarget instanceof Element)) {
    return undefined;
  }

  const anchor = eventTarget.closest("a[href]");

  return anchor instanceof HTMLAnchorElement ? anchor : undefined;
}

function getNavigationApi(): ElementalNavigationApi | undefined {
  return (window as Window & { navigation?: ElementalNavigationApi }).navigation;
}

function isHashOnlyNavigation(url: URL): boolean {
  return (
    url.origin === window.location.origin &&
    url.pathname === window.location.pathname &&
    url.search === window.location.search &&
    url.hash !== window.location.hash
  );
}

function isRouterPayloadResponse(response: Response): boolean {
  return response.headers.get("content-type")?.includes("application/json") === true;
}
