import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build as esbuild, type Plugin } from "esbuild";
import { discoverRoutes, type DiscoveredRoute } from "./discover.ts";
import { type BuildManifest, writeManifest } from "./manifest.ts";
import { stripNamedHTMLElementExportsFromServerModule } from "./oxc.ts";

export interface BuildOptions {
  appDir?: string;
  outDir?: string;
  rootDir?: string;
}

export interface BuildResult {
  clientFile: string;
  manifestPath: string;
  outDir: string;
  routes: Awaited<ReturnType<typeof discoverRoutes>>;
  serverFile: string;
}

export async function buildProject(options: BuildOptions = {}): Promise<BuildResult> {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const appDir = path.resolve(rootDir, options.appDir ?? "spec/fixtures/basic-app/src");
  const outDir = path.resolve(rootDir, options.outDir ?? "dist");
  const assetsDir = path.join(outDir, "assets");
  const serverModulesDir = path.join(outDir, "server");
  const packageEntryPath = path.join(rootDir, "src/index.ts");
  const cliEntryPath = path.join(rootDir, "src/cli/index.ts");
  const clientBootstrapPath = path.join(rootDir, "src/runtime/client/bootstrap.ts");
  const serverAppPath = path.join(rootDir, "src/runtime/server/app.ts");

  await mkdir(assetsDir, { recursive: true });
  await mkdir(serverModulesDir, { recursive: true });

  const routes = await discoverRoutes(appDir);

  if (routes.length === 0) {
    throw new Error(`No routes were discovered under ${appDir}`);
  }

  const rootRoute = routes.find((route) => route.pattern === "/");

  if (!rootRoute) {
    throw new Error(
      `The current server runtime requires a root route at ${path.join(appDir, "index.ts")}`,
    );
  }

  await buildPackageEntrypoints(packageEntryPath, cliEntryPath, outDir);

  const layoutStylesheetAssets = await emitLayoutStylesheetAssets(
    routes,
    assetsDir,
    appDir,
    outDir,
  );
  const browserEntryPoints = createEntryPointMap(
    [clientBootstrapPath, ...collectBrowserModulePaths(routes)],
    rootDir,
  );

  const clientBuild = await esbuild({
    absWorkingDir: rootDir,
    alias: {
      elemental: packageEntryPath,
    },
    bundle: true,
    chunkNames: "chunks/[name]-[hash]",
    entryNames: "[name]-[hash]",
    entryPoints: browserEntryPoints,
    format: "esm",
    metafile: true,
    outdir: assetsDir,
    platform: "browser",
    plugins: [createBrowserServerBoundaryPlugin(), createCssModulePlugin("browser")],
    splitting: true,
    sourcemap: true,
    target: ["chrome123", "safari17"],
    write: true,
  });

  const browserOutputs = collectEntryOutputs(clientBuild.metafile?.outputs ?? {}, outDir);
  const clientAssetRelativePath = requireEntryOutput(
    browserOutputs,
    clientBootstrapPath,
    "client bootstrap",
  );
  const clientFile = path.join(outDir, clientAssetRelativePath);

  const serverEntryPoints = createEntryPointMap(collectServerModulePaths(routes), rootDir);
  const serverModuleBuild = await esbuild({
    absWorkingDir: rootDir,
    alias: {
      elemental: packageEntryPath,
    },
    bundle: true,
    chunkNames: "chunks/[name]-[hash]",
    entryNames: "[name]-[hash]",
    entryPoints: serverEntryPoints,
    format: "esm",
    metafile: true,
    outdir: serverModulesDir,
    platform: "node",
    plugins: [createCssModulePlugin("server"), createServerBundleTransformPlugin(appDir)],
    splitting: true,
    sourcemap: true,
    target: ["node24"],
    write: true,
  });
  const serverOutputs = collectEntryOutputs(serverModuleBuild.metafile?.outputs ?? {}, outDir);

  const manifest: BuildManifest = {
    appDir: toPosixPath(path.relative(rootDir, appDir)),
    assets: {
      clientEntry: clientAssetRelativePath,
    },
    generatedAt: new Date().toISOString(),
    routes: routes.map((route) =>
      createManifestRoute({
        browserOutputs,
        layoutStylesheetAssets,
        outDir,
        rootDir,
        route,
        serverOutputs,
      }),
    ),
  };
  const manifestPath = await writeManifest(outDir, manifest);
  const serverFile = path.join(outDir, "server.js");

  await esbuild({
    absWorkingDir: rootDir,
    alias: {
      elemental: packageEntryPath,
    },
    bundle: true,
    format: "esm",
    outfile: serverFile,
    platform: "node",
    plugins: [createCssModulePlugin("server"), createServerBundleTransformPlugin(appDir)],
    sourcemap: true,
    stdin: {
      contents: createServerEntry({
        clientAssetHref: `/${clientAssetRelativePath}`,
        distDir: outDir,
        routeFilePath: rootRoute.filePath,
        serverAppPath,
      }),
      resolveDir: rootDir,
      sourcefile: "virtual-server-entry.ts",
    },
    target: ["node24"],
    write: true,
  });

  return {
    clientFile,
    manifestPath,
    outDir,
    routes,
    serverFile,
  };
}

function createManifestRoute(options: {
  browserOutputs: Map<string, string>;
  layoutStylesheetAssets: Map<string, string>;
  outDir: string;
  rootDir: string;
  route: DiscoveredRoute;
  serverOutputs: Map<string, string>;
}) {
  const { browserOutputs, layoutStylesheetAssets, rootDir, route, serverOutputs } = options;
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
      layoutCss: layoutCssAssets,
      scripts: [...browserLayouts, ...browserErrorBoundaries, browserRoute],
    },
    browser: {
      errorBoundaries: browserErrorBoundaries,
      layouts: browserLayouts,
      route: browserRoute,
    },
    errorBoundaries: route.errorBoundaries.map((filePath) =>
      toPosixPath(path.relative(rootDir, filePath)),
    ),
    layoutStylesheets: route.layoutStylesheets.map((filePath) =>
      toPosixPath(path.relative(rootDir, filePath)),
    ),
    layouts: route.layouts.map((filePath) => toPosixPath(path.relative(rootDir, filePath))),
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
    serverErrorBoundaries: route.serverErrorBoundaries.map((filePath) =>
      toPosixPath(path.relative(rootDir, filePath)),
    ),
    serverSource: route.serverFilePath
      ? toPosixPath(path.relative(rootDir, route.serverFilePath))
      : undefined,
    source: toPosixPath(path.relative(rootDir, route.filePath)),
  };
}

async function buildPackageEntrypoints(
  packageEntryPath: string,
  cliEntryPath: string,
  outDir: string,
): Promise<void> {
  await esbuild({
    bundle: true,
    format: "esm",
    outfile: path.join(outDir, "index.js"),
    platform: "neutral",
    sourcemap: true,
    target: ["es2024"],
    write: true,
    entryPoints: [packageEntryPath],
  });

  await esbuild({
    banner: {
      js: "#!/usr/bin/env node",
    },
    bundle: true,
    entryPoints: [cliEntryPath],
    format: "esm",
    outfile: path.join(outDir, "cli.js"),
    packages: "external",
    platform: "node",
    sourcemap: true,
    target: ["node24"],
    write: true,
  });
}

async function emitLayoutStylesheetAssets(
  routes: DiscoveredRoute[],
  assetsDir: string,
  appDir: string,
  outDir: string,
): Promise<Map<string, string>> {
  const emittedAssets = new Map<string, string>();

  for (const filePath of collectUniquePaths(routes.flatMap((route) => route.layoutStylesheets))) {
    const sourceText = await readFile(filePath, "utf8");
    const relativePath = toPosixPath(path.relative(appDir, filePath));
    const sourceHash = createHash("sha256").update(sourceText).digest("hex").slice(0, 8);
    const fileName = `${slugifyFileStem(relativePath)}-${sourceHash}.css`;
    const outputPath = path.join(assetsDir, fileName);

    await writeFile(outputPath, sourceText, "utf8");
    emittedAssets.set(path.resolve(filePath), toPosixPath(path.relative(outDir, outputPath)));
  }

  return emittedAssets;
}

function collectBrowserModulePaths(routes: DiscoveredRoute[]): string[] {
  return collectUniquePaths(
    routes.flatMap((route) => [route.filePath, ...route.layouts, ...route.errorBoundaries]),
  );
}

function collectServerModulePaths(routes: DiscoveredRoute[]): string[] {
  return collectUniquePaths(
    routes.flatMap((route) => [
      route.filePath,
      ...route.layouts,
      ...route.serverErrorBoundaries,
      ...(route.serverFilePath === undefined ? [] : [route.serverFilePath]),
    ]),
  );
}

function collectUniquePaths(filePaths: string[]): string[] {
  return [...new Set(filePaths.map((filePath) => path.resolve(filePath)))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function createEntryPointMap(filePaths: string[], rootDir: string): Record<string, string> {
  return Object.fromEntries(
    filePaths.map((filePath) => [createEntryName(filePath, rootDir), path.resolve(filePath)]),
  );
}

function createEntryName(filePath: string, rootDir: string): string {
  const relativePath = toPosixPath(path.relative(rootDir, filePath));
  const sourceHash = createHash("sha256").update(relativePath).digest("hex").slice(0, 8);

  return `${slugifyFileStem(relativePath)}-${sourceHash}`;
}

function slugifyFileStem(filePath: string): string {
  const extension = path.extname(filePath);
  const fileStem = filePath.slice(0, extension.length === 0 ? filePath.length : -extension.length);
  const slug = fileStem
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return slug.length === 0 ? "entry" : slug;
}

function collectEntryOutputs(
  outputs: Record<string, { entryPoint?: string }>,
  outDir: string,
): Map<string, string> {
  const entryOutputs = new Map<string, string>();

  for (const [outputPath, outputInfo] of Object.entries(outputs)) {
    if (outputInfo.entryPoint === undefined || !outputPath.endsWith(".js")) {
      continue;
    }

    entryOutputs.set(
      path.resolve(outputInfo.entryPoint),
      toPosixPath(path.relative(outDir, path.resolve(outputPath))),
    );
  }

  return entryOutputs;
}

function requireEntryOutput(
  outputs: Map<string, string>,
  filePath: string,
  description: string,
): string {
  const outputPath = outputs.get(path.resolve(filePath));

  if (outputPath === undefined) {
    throw new Error(`Missing emitted asset for ${description}`);
  }

  return outputPath;
}

function createBrowserServerBoundaryPlugin(): Plugin {
  return {
    name: "elemental-browser-server-boundary",
    setup(build) {
      build.onResolve({ filter: /(^|\/)(index|error)\.server(\.[cm]?[jt]sx?)?$/ }, (args) => ({
        errors: [
          {
            text: `Browser-reachable module ${args.importer || "<entry>"} must not import server-only module ${args.path}.`,
          },
        ],
      }));
    },
  };
}

function createCssModulePlugin(target: "browser" | "server"): Plugin {
  const namespace = `elemental-css-${target}`;

  return {
    name: `elemental-css-${target}`,
    setup(build) {
      build.onResolve({ filter: /\.css$/ }, (args) => {
        const resolvedPath = path.resolve(args.resolveDir, args.path);

        if (path.basename(resolvedPath) === "layout.css") {
          return {
            errors: [
              {
                text: `layout.css is a global asset and must not be imported directly: ${args.path}`,
              },
            ],
          };
        }

        return {
          namespace,
          path: resolvedPath,
        };
      });

      build.onLoad({ filter: /\.css$/, namespace }, async (args) => {
        const sourceText = await readFile(args.path, "utf8");

        return {
          contents:
            target === "browser"
              ? [
                `const sheet = new CSSStyleSheet();`,
                `sheet.replaceSync(${JSON.stringify(sourceText)});`,
                `export default sheet;`,
                "",
              ].join("\n")
              : `const cssText = ${JSON.stringify(sourceText)};\nexport default cssText;\n`,
          loader: "js",
        };
      });
    },
  };
}

function createServerBundleTransformPlugin(appDir: string): Plugin {
  return {
    name: "elemental-server-bundle-transform",
    setup(build) {
      build.onLoad({ filter: /\.(ts|tsx)$/ }, async (args) => {
        if (!isAppRouteOrLayoutModule(args.path, appDir)) {
          return undefined;
        }

        const sourceText = await readFile(args.path, "utf8");

        return {
          contents: stripNamedHTMLElementExportsFromServerModule(args.path, sourceText),
          loader: args.path.endsWith(".tsx") ? "tsx" : "ts",
        };
      });
    },
  };
}

function isAppRouteOrLayoutModule(filePath: string, appDir: string): boolean {
  const relativePath = path.relative(appDir, filePath);
  const fileName = path.basename(filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return false;
  }

  return fileName === "index.ts" || fileName === "layout.ts";
}

function createServerEntry(options: {
  clientAssetHref: string;
  distDir: string;
  routeFilePath: string;
  serverAppPath: string;
}): string {
  return [
    `import { startServer } from ${JSON.stringify(options.serverAppPath)};`,
    `import renderRoute from ${JSON.stringify(options.routeFilePath)};`,
    "",
    "startServer({",
    `  clientAssetHref: ${JSON.stringify(options.clientAssetHref)},`,
    `  distDir: ${JSON.stringify(options.distDir)},`,
    "  renderRoute,",
    "});",
    "",
  ].join("\n");
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
