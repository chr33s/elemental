export interface BuildManifestRoute {
  assets: {
    css?: string[];
    js?: string[];
    layoutCss?: string[];
    scripts?: string[];
  };
  browser: {
    errorBoundaries: string[];
    layouts: string[];
    route: string;
  };
  errorBoundaries: string[];
  layoutStylesheets: string[];
  layouts: string[];
  pattern: string;
  server: {
    layouts: string[];
    route: string;
    routeServer?: string;
    serverErrorBoundaries: string[];
  };
  source: string;
  serverErrorBoundaries: string[];
  serverSource?: string;
}

export interface BuildManifestIsland {
  css?: string[];
  js: string;
  source: string;
}

export interface BuildManifest {
  appDir: string;
  assets: {
    clientEntry?: string;
  };
  generatedAt: string;
  islands: Record<string, BuildManifestIsland>;
  routes: BuildManifestRoute[];
}

export interface PublicBuildManifestRoute {
  assets: BuildManifestRoute["assets"];
  browser: Pick<BuildManifestRoute["browser"], "errorBoundaries">;
  errorBoundaries: string[];
  pattern: string;
}

export interface PublicBuildManifestIsland {
  css?: string[];
  js: string;
}

export interface PublicBuildManifest {
  appDir: string;
  assets: BuildManifest["assets"];
  generatedAt: string;
  islands: Record<string, PublicBuildManifestIsland>;
  routes: PublicBuildManifestRoute[];
}

export function createPublicManifest(manifest: BuildManifest): PublicBuildManifest {
  const islands: Record<string, PublicBuildManifestIsland> = {};

  for (const [id, entry] of Object.entries(manifest.islands)) {
    islands[id] =
      entry.css === undefined ? { js: entry.js } : { css: [...entry.css], js: entry.js };
  }

  return {
    appDir: manifest.appDir,
    assets: {
      clientEntry: manifest.assets.clientEntry,
    },
    generatedAt: manifest.generatedAt,
    islands,
    routes: manifest.routes.map((route) => ({
      assets: route.assets,
      browser: {
        errorBoundaries: [...route.browser.errorBoundaries],
      },
      errorBoundaries: [...route.errorBoundaries],
      pattern: route.pattern,
    })),
  };
}
