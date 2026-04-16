import type { BuildManifestRoute } from "../../build/manifest.ts";

export interface NormalizedManifestRouteAssets {
  css: string[];
  js: string[];
}

export function normalizeManifestRouteAssets(
  route: Pick<BuildManifestRoute, "assets">,
): NormalizedManifestRouteAssets {
  return {
    css: route.assets.css ?? route.assets.layoutCss ?? [],
    js: route.assets.js ?? route.assets.scripts ?? [],
  };
}
