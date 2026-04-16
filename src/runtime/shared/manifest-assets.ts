import type { BuildManifestRoute, PublicBuildManifestRoute } from "../../build/manifest.ts";

type ManifestRouteAssetsLike =
  | Pick<BuildManifestRoute, "assets">
  | Pick<PublicBuildManifestRoute, "assets">;

export interface NormalizedManifestRouteAssets {
  css: string[];
  js: string[];
}

export function normalizeManifestRouteAssets(
  route: ManifestRouteAssetsLike,
): NormalizedManifestRouteAssets {
  return {
    css: route.assets.css ?? route.assets.layoutCss ?? [],
    js: route.assets.js ?? route.assets.scripts ?? [],
  };
}
