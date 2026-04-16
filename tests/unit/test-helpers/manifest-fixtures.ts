import type { BuildManifest, BuildManifestRoute } from "../../../src/build/manifest.ts";

interface CreateManifestOptions {
  appDir?: string;
  assets?: BuildManifest["assets"];
  generatedAt?: string;
}

interface CreateRouteOptions {
  assets?: BuildManifestRoute["assets"];
  browser?: Partial<BuildManifestRoute["browser"]>;
  browserBoundaryModules?: string[];
  browserBoundarySources?: string[];
  layoutStylesheets?: string[];
  layouts?: string[];
  pattern?: string;
  server?: Partial<BuildManifestRoute["server"]>;
  serverBoundaryModules?: string[];
  serverBoundarySources?: string[];
  serverSource?: string;
  source?: string;
}

export function createManifest(
  routes: BuildManifestRoute[] = [],
  options: CreateManifestOptions = {},
): BuildManifest {
  return {
    appDir: options.appDir ?? "app/src",
    assets: options.assets ?? {},
    generatedAt: options.generatedAt ?? "2026-04-16T00:00:00.000Z",
    routes,
  };
}

export function createRoute(
  patternOrOptions: string | CreateRouteOptions = "/",
  overrides: CreateRouteOptions = {},
): BuildManifestRoute {
  const options =
    typeof patternOrOptions === "string"
      ? {
          ...overrides,
          pattern: patternOrOptions,
        }
      : patternOrOptions;
  const pattern = options.pattern ?? "/";

  return {
    assets: options.assets ?? {
      layoutCss: [],
      scripts: [],
    },
    browser: {
      errorBoundaries: options.browserBoundaryModules ?? options.browser?.errorBoundaries ?? [],
      layouts: options.browser?.layouts ?? [],
      route: options.browser?.route ?? "assets/route.js",
    },
    errorBoundaries: options.browserBoundarySources ?? [],
    layoutStylesheets: options.layoutStylesheets ?? [],
    layouts: options.layouts ?? [],
    pattern,
    server: {
      layouts: options.server?.layouts ?? [],
      route: options.server?.route ?? "server/route.js",
      routeServer: options.server?.routeServer,
      serverErrorBoundaries:
        options.serverBoundaryModules ?? options.server?.serverErrorBoundaries ?? [],
    },
    serverErrorBoundaries: options.serverBoundarySources ?? [],
    serverSource: options.serverSource,
    source: options.source ?? defaultSourcePath(pattern),
  };
}

function defaultSourcePath(pattern: string): string {
  return `app/src${pattern === "/" ? "/index.ts" : `${pattern}/index.ts`}`;
}
