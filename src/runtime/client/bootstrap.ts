import type { PublicBuildManifest } from "../../build/manifest.ts";
import { ELEMENTAL_MANIFEST_PATH } from "../shared/browser-runtime.ts";
import { matchManifestRoute } from "../shared/routes.ts";
import {
  getRouteScriptAssets,
  installNavigationInterceptors,
  loadScriptModules,
  refreshCurrentRoute,
  syncCurrentRouteStylesheets,
  type BootstrapState,
} from "./navigation.ts";
export {
  collectCustomElementDefinitions,
  isValidCustomElementTagName,
  registerCustomElementDefinitions,
} from "./register-elements.ts";

export interface ElementalBrowserRuntimeApi {
  refreshCurrentRoute(): Promise<void>;
  replaceManifest(manifest: PublicBuildManifest): void;
  syncCurrentRouteStylesheets(): Promise<void>;
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

async function loadManifest(): Promise<PublicBuildManifest> {
  const response = await fetch(ELEMENTAL_MANIFEST_PATH, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load Elemental manifest: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as PublicBuildManifest;
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

if (typeof window !== "undefined" && typeof document !== "undefined") {
  void bootstrap().catch((error) => {
    console.error(error);
    document.documentElement.dataset.elemental = "error";
  });
}
