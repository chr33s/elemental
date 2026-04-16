import path from "node:path";
import { toPosixPath } from "../shared/path-utils.ts";
import type { DiscoveredRoute } from "./discover.ts";
import { requireEntryOutput, requireServerModuleId } from "./entry-points.ts";
import type { BuildManifest } from "./manifest.ts";

export function createManifestRoute(options: {
  browserOutputs: Map<string, string>;
  layoutStylesheetAssets: Map<string, string>;
  rootDir: string;
  route: DiscoveredRoute;
  serverOutputs: Map<string, string>;
}) {
  const { browserOutputs, layoutStylesheetAssets, rootDir, route, serverOutputs } = options;
  const relativize = (filePath: string) => toPosixPath(path.relative(rootDir, filePath));
  const browserLayouts = route.layouts.map((filePath) =>
    requireEntryOutput(browserOutputs, filePath, `browser layout module ${filePath}`),
  );
  const browserErrorBoundaries = route.errorBoundaries.map((filePath) =>
    requireEntryOutput(browserOutputs, filePath, `browser error boundary ${filePath}`),
  );
  const browserRoute = requireEntryOutput(
    browserOutputs,
    route.filePath,
    `browser route ${route.filePath}`,
  );
  const serverLayouts = route.layouts.map((filePath) =>
    requireEntryOutput(serverOutputs, filePath, `server layout module ${filePath}`),
  );
  const serverRoute = requireEntryOutput(
    serverOutputs,
    route.filePath,
    `server route ${route.filePath}`,
  );
  const layoutCssAssets = route.layoutStylesheets.map((filePath) => {
    const assetPath = layoutStylesheetAssets.get(path.resolve(filePath));

    if (assetPath === undefined) {
      throw new Error(`Missing emitted layout stylesheet for ${filePath}`);
    }

    return assetPath;
  });

  return {
    assets: {
      css: layoutCssAssets,
      js: [...browserLayouts, ...browserErrorBoundaries, browserRoute],
      layoutCss: layoutCssAssets,
      scripts: [...browserLayouts, ...browserErrorBoundaries, browserRoute],
    },
    browser: {
      errorBoundaries: browserErrorBoundaries,
      layouts: browserLayouts,
      route: browserRoute,
    },
    errorBoundaries: route.errorBoundaries.map(relativize),
    layoutStylesheets: route.layoutStylesheets.map(relativize),
    layouts: route.layouts.map(relativize),
    pattern: route.pattern,
    server: {
      layouts: serverLayouts,
      route: serverRoute,
      routeServer: route.serverFilePath
        ? requireEntryOutput(
            serverOutputs,
            route.serverFilePath,
            `route server module ${route.serverFilePath}`,
          )
        : undefined,
      serverErrorBoundaries: route.serverErrorBoundaries.map((filePath) =>
        requireEntryOutput(serverOutputs, filePath, `server error boundary ${filePath}`),
      ),
    },
    serverErrorBoundaries: route.serverErrorBoundaries.map(relativize),
    serverSource: route.serverFilePath ? relativize(route.serverFilePath) : undefined,
    source: relativize(route.filePath),
  };
}

export function createWorkerManifest(
  manifest: BuildManifest,
  routes: DiscoveredRoute[],
  rootDir: string,
  moduleIdByFilePath: Map<string, string>,
): BuildManifest {
  return {
    ...manifest,
    routes: manifest.routes.map((route, index) => {
      const discoveredRoute = routes[index];

      return {
        ...route,
        server: {
          layouts: discoveredRoute.layouts.map((filePath) =>
            requireServerModuleId(moduleIdByFilePath, filePath, rootDir),
          ),
          route: requireServerModuleId(moduleIdByFilePath, discoveredRoute.filePath, rootDir),
          routeServer:
            discoveredRoute.serverFilePath === undefined
              ? undefined
              : requireServerModuleId(moduleIdByFilePath, discoveredRoute.serverFilePath, rootDir),
          serverErrorBoundaries: discoveredRoute.serverErrorBoundaries.map((filePath) =>
            requireServerModuleId(moduleIdByFilePath, filePath, rootDir),
          ),
        },
      };
    }),
  };
}
