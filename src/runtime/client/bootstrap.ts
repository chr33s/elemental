import type { BuildManifest } from "../../build/manifest.ts";
import type { RouterPayload } from "../server/app.ts";
import {
  ELEMENTAL_HEAD_END_NAME,
  ELEMENTAL_HEAD_START_NAME,
  ELEMENTAL_MANAGED_ATTRIBUTE,
  ELEMENTAL_MANAGED_SCRIPT,
  ELEMENTAL_MANAGED_STYLESHEET,
  ELEMENTAL_MANIFEST_PATH,
} from "../shared/browser-runtime.ts";
import { matchManifestRoute, type MatchedManifestRoute } from "../shared/routes.ts";
import { recoverFromClientError } from "./errors.ts";

type BrowserModuleNamespace = Record<string, unknown>;
type NavigationHistoryMode = "auto" | "none" | "push" | "replace";

interface CustomElementDefinition {
  constructor: CustomElementConstructor;
  tagName: string;
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

interface BootstrapState {
  currentRoute?: MatchedManifestRoute;
  loadedScriptModules: Set<string>;
  manifest: BuildManifest;
}

export interface ElementalBrowserRuntimeApi {
  refreshCurrentRoute(): Promise<void>;
  replaceManifest(manifest: BuildManifest): void;
  syncCurrentRouteStylesheets(): Promise<void>;
}

const ROUTER_HEADER_NAME = "X-Elemental-Router";

export function collectCustomElementDefinitions(
  moduleNamespace: BrowserModuleNamespace,
  elementBaseClass: abstract new (...args: never[]) => object,
): CustomElementDefinition[] {
  const definitions: CustomElementDefinition[] = [];

  for (const exportedValue of Object.values(moduleNamespace)) {
    if (typeof exportedValue !== "function") {
      continue;
    }

    if (!(exportedValue.prototype instanceof elementBaseClass)) {
      continue;
    }

    const tagName = Reflect.get(exportedValue, "tagName");

    if (typeof tagName !== "string" || !isValidCustomElementTagName(tagName)) {
      continue;
    }

    definitions.push({
      constructor: exportedValue as CustomElementConstructor,
      tagName,
    });
  }

  return definitions;
}

export function registerCustomElementDefinitions(
  moduleNamespace: BrowserModuleNamespace,
  customElementRegistry: Pick<CustomElementRegistry, "define" | "get">,
  elementBaseClass: abstract new (...args: never[]) => object,
): void {
  for (const definition of collectCustomElementDefinitions(moduleNamespace, elementBaseClass)) {
    if (customElementRegistry.get(definition.tagName) !== undefined) {
      continue;
    }

    customElementRegistry.define(definition.tagName, definition.constructor);
  }
}

export function isValidCustomElementTagName(tagName: string): boolean {
  return /^[a-z](?:[.0-9_a-z-]*-[.0-9_a-z-]*)$/u.test(tagName);
}

async function bootstrap(): Promise<void> {
  const state: BootstrapState = {
    currentRoute: undefined,
    loadedScriptModules: new Set<string>(),
    manifest: await loadManifest(),
  };

  await primeCurrentRoute(state);
  installNavigationInterceptors(state);
  installBrowserRuntimeApi(state);
  document.documentElement.dataset.elemental = "ready";
}

async function loadManifest(): Promise<BuildManifest> {
  const response = await fetch(ELEMENTAL_MANIFEST_PATH, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load Elemental manifest: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as BuildManifest;
}

async function primeCurrentRoute(state: BootstrapState): Promise<void> {
  state.currentRoute = matchManifestRoute(window.location.pathname, state.manifest.routes);

  if (state.currentRoute === undefined) {
    return;
  }

  await loadScriptModules(state, getRouteScriptAssets(state.currentRoute.route));
}

function installBrowserRuntimeApi(state: BootstrapState): void {
  (
    window as Window & {
      __elementalBrowserRuntime?: ElementalBrowserRuntimeApi;
    }
  ).__elementalBrowserRuntime = {
    refreshCurrentRoute: () => refreshCurrentRoute(state),
    replaceManifest: (manifest) => {
      state.manifest = manifest;
      state.currentRoute = matchManifestRoute(window.location.pathname, state.manifest.routes);
    },
    syncCurrentRouteStylesheets: () => syncCurrentRouteStylesheets(state),
  };
}

async function refreshCurrentRoute(state: BootstrapState): Promise<void> {
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

async function syncCurrentRouteStylesheets(state: BootstrapState): Promise<void> {
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

function installNavigationInterceptors(state: BootstrapState): void {
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

async function submitFormNavigation(
  state: BootstrapState,
  url: URL,
  options: {
    body?: FormData;
    history: NavigationHistoryMode;
    method: string;
  },
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

function renderManagedHead(head: string): void {
  const { end, start } = ensureManagedHeadMarkers();

  for (let node = start.nextSibling; node !== null && node !== end; ) {
    const nextSibling = node.nextSibling;

    node.remove();
    node = nextSibling;
  }

  if (head.length === 0) {
    return;
  }

  const range = document.createRange();

  range.selectNode(document.head);
  end.before(range.createContextualFragment(head));
}

async function syncManagedStylesheets(stylesheetHrefs: string[]): Promise<() => void> {
  const normalizedHrefs = [...new Set(stylesheetHrefs.map(normalizeAssetHref))];
  const desiredHrefs = new Set(normalizedHrefs);
  const existingLinks = new Map(
    [...document.head.querySelectorAll<HTMLLinkElement>(managedStylesheetSelector())].map(
      (link) => [normalizeAssetHref(link.href), link],
    ),
  );
  const orderedLinks = normalizedHrefs.map((stylesheetHref) => ({
    href: stylesheetHref,
    link: existingLinks.get(stylesheetHref),
  }));
  const pendingLoads: Promise<void>[] = [];
  const anchor = document.head.querySelector(managedScriptSelector());

  for (let index = 0; index < orderedLinks.length; index += 1) {
    const entry = orderedLinks[index];

    if (entry?.link === undefined) {
      const link = document.createElement("link");
      const referenceNode =
        orderedLinks
          .slice(index + 1)
          .map((candidate) => candidate.link)
          .find(
            (candidate): candidate is HTMLLinkElement =>
              candidate instanceof HTMLLinkElement && candidate.isConnected,
          ) ?? anchor;

      link.rel = "stylesheet";
      link.href = entry.href;
      link.setAttribute(ELEMENTAL_MANAGED_ATTRIBUTE, ELEMENTAL_MANAGED_STYLESHEET);
      document.head.insertBefore(link, referenceNode);
      pendingLoads.push(waitForStylesheet(link));
      entry.link = link;
    }
  }

  await Promise.all(pendingLoads);

  const obsoleteLinks = [...existingLinks].flatMap(([href, link]) =>
    desiredHrefs.has(href) ? [] : [link],
  );

  return () => {
    for (const link of obsoleteLinks) {
      if (link.isConnected) {
        link.remove();
      }
    }
  };
}

async function waitForStylesheet(link: HTMLLinkElement): Promise<void> {
  if (link.sheet !== null) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const handleLoad = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`Failed to load stylesheet ${link.href}`));
    };
    const cleanup = () => {
      link.removeEventListener("load", handleLoad);
      link.removeEventListener("error", handleError);
    };

    link.addEventListener("load", handleLoad, { once: true });
    link.addEventListener("error", handleError, { once: true });
  });
}

async function loadScriptModules(state: BootstrapState, scriptHrefs: string[]): Promise<void> {
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

function getRouteScriptAssets(route: MatchedManifestRoute["route"]): string[] {
  return route.assets.js ?? route.assets.scripts ?? [];
}

function getRouteStylesheetAssets(route: MatchedManifestRoute["route"]): string[] {
  return (route.assets.css ?? route.assets.layoutCss ?? []).map((assetPath) =>
    normalizeAssetHref(assetPath),
  );
}

function registerCustomElements(moduleNamespace: BrowserModuleNamespace): void {
  registerCustomElementDefinitions(moduleNamespace, customElements, HTMLElement);
}

async function replaceEntireDocument(response: Response): Promise<void> {
  const documentMarkup = await response.text();

  document.open();
  document.write(documentMarkup);
  document.close();
}

function ensureManagedHeadMarkers(): {
  end: Element;
  start: Element;
} {
  let start = document.head.querySelector(`meta[name="${ELEMENTAL_HEAD_START_NAME}"]`);
  let end = document.head.querySelector(`meta[name="${ELEMENTAL_HEAD_END_NAME}"]`);

  if (start === null) {
    start = document.createElement("meta");
    start.setAttribute("name", ELEMENTAL_HEAD_START_NAME);
    start.setAttribute("content", "");
    document.head.prepend(start);
  }

  if (end === null) {
    end = document.createElement("meta");
    end.setAttribute("name", ELEMENTAL_HEAD_END_NAME);
    end.setAttribute("content", "");
    document.head.append(end);
  }

  if (start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_PRECEDING) {
    document.head.insertBefore(start, end);
  }

  return {
    end,
    start,
  };
}

function resolveBrowserModule<TModule>(modulePath: string): Promise<TModule> {
  return import(normalizeAssetHref(modulePath)) as Promise<TModule>;
}

function normalizeAssetHref(href: string): string {
  return new URL(href, `${window.location.origin}/`).href;
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

function createFormSubmission(
  form: HTMLFormElement,
  event: Event,
):
  | {
      body?: FormData;
      history: NavigationHistoryMode;
      method: string;
      url: URL;
    }
  | undefined {
  const submitUrl = new URL(form.action || window.location.href, window.location.href);

  if (submitUrl.origin !== window.location.origin) {
    return undefined;
  }

  const method = (form.method || "get").toUpperCase();
  const submitEvent = event as SubmitEvent;
  const submitter = submitEvent.submitter;
  const formData =
    submitter instanceof HTMLElement ? new FormData(form, submitter) : new FormData(form);

  if (method === "GET") {
    const query = new URLSearchParams();

    for (const [name, value] of formData.entries()) {
      query.append(name, typeof value === "string" ? value : value.name);
    }

    submitUrl.search = query.toString();

    return {
      history: "push",
      method,
      url: submitUrl,
    };
  }

  return {
    body: formData,
    history: "push",
    method,
    url: submitUrl,
  };
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

function managedScriptSelector(): string {
  return `script[${ELEMENTAL_MANAGED_ATTRIBUTE}="${ELEMENTAL_MANAGED_SCRIPT}"]`;
}

function managedStylesheetSelector(): string {
  return `link[${ELEMENTAL_MANAGED_ATTRIBUTE}="${ELEMENTAL_MANAGED_STYLESHEET}"]`;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  void bootstrap().catch((error) => {
    console.error(error);
    document.documentElement.dataset.elemental = "error";
  });
}
