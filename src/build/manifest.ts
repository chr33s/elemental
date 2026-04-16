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

export interface BuildManifest {
  appDir: string;
  assets: {
    clientEntry?: string;
  };
  generatedAt: string;
  routes: BuildManifestRoute[];
}

export interface PublicBuildManifestRoute {
  assets: BuildManifestRoute["assets"];
  browser: Pick<BuildManifestRoute["browser"], "errorBoundaries">;
  errorBoundaries: string[];
  pattern: string;
}

export interface PublicBuildManifest {
  appDir: string;
  assets: BuildManifest["assets"];
  generatedAt: string;
  routes: PublicBuildManifestRoute[];
}

export function createPublicManifest(manifest: BuildManifest): PublicBuildManifest {
  return {
    appDir: manifest.appDir,
    assets: {
      clientEntry: manifest.assets.clientEntry,
    },
    generatedAt: manifest.generatedAt,
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
