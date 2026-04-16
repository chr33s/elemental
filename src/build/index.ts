import { mkdir } from "node:fs/promises";
import path from "node:path";
import { build as esbuild } from "esbuild";
import { toPosixPath } from "../shared/path-utils.ts";
import { discoverRoutes } from "./discover.ts";
import {
  collectBrowserModulePaths,
  collectEntryOutputs,
  collectServerModulePaths,
  createEntryPointMap,
  createServerModuleIdMap,
  requireEntryOutput,
} from "./entry-points.ts";
import { emitLayoutStylesheetAssets } from "./layout-stylesheets.ts";
import { createManifestRoute, createWorkerManifest } from "./manifest-routes.ts";
import { type BuildManifest } from "./manifest.ts";
import { createCssModulePlugin } from "./plugins/css.ts";
import {
  createBrowserServerBoundaryPlugin,
  createWorkerRuntimeValidationPlugin,
} from "./plugins/server-boundary.ts";
import { createServerBundleTransformPlugin } from "./plugins/strip-custom-elements.ts";
import {
  createServerEntry,
  createSrvxEntry,
  createWorkerEntry,
  writeWranglerConfig,
} from "./virtual-entrypoints.ts";
import { writeManifest } from "./write-manifest.ts";

export interface BuildOptions {
  appDir?: string;
  includeDevClient?: boolean;
  outDir?: string;
  rootDir?: string;
  target?: BuildTarget;
}

export type BuildTarget = "node" | "worker";

export interface BuildResult {
  clientFile: string;
  devClientFile?: string;
  manifestPath: string;
  outDir: string;
  routes: Awaited<ReturnType<typeof discoverRoutes>>;
  serverFile: string;
  srvxEntryFile?: string;
  wranglerConfigFile?: string;
  workerEntryFile?: string;
}

export async function buildProject(options: BuildOptions = {}): Promise<BuildResult> {
  const target = options.target;
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const appDir = path.resolve(rootDir, options.appDir ?? "spec/fixtures/basic-app/src");
  const outDir = path.resolve(rootDir, options.outDir ?? "dist");
  const assetsDir = path.join(outDir, "assets");
  const serverModulesDir = path.join(outDir, "server");
  const packageEntryPath = path.join(rootDir, "src/index.ts");
  const cliEntryPath = path.join(rootDir, "src/cli/index.ts");
  const clientBootstrapPath = path.join(rootDir, "src/runtime/client/bootstrap.ts");
  const devClientPath = path.join(rootDir, "src/runtime/client/dev-client.ts");
  const serverAppPath = path.join(rootDir, "src/runtime/server/app.ts");
  const workerServerPath = path.join(rootDir, "src/runtime/server/worker.ts");

  await mkdir(assetsDir, { recursive: true });
  await mkdir(serverModulesDir, { recursive: true });

  const routes = await discoverRoutes(appDir);

  if (routes.length === 0) {
    throw new Error(`No routes were discovered under ${appDir}`);
  }

  await buildPackageEntrypoints(packageEntryPath, cliEntryPath, outDir);

  const layoutStylesheetAssets = await emitLayoutStylesheetAssets(
    routes,
    assetsDir,
    appDir,
    outDir,
  );
  const browserEntryPoints = createEntryPointMap(
    [
      clientBootstrapPath,
      ...(options.includeDevClient === true ? [devClientPath] : []),
      ...collectBrowserModulePaths(routes),
    ],
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
    logLevel: "silent",
    metafile: true,
    outdir: assetsDir,
    platform: "browser",
    plugins: [createBrowserServerBoundaryPlugin(), createCssModulePlugin("browser")],
    splitting: true,
    sourcemap: true,
    target: ["chrome123", "safari17"],
    write: true,
  });

  const browserOutputs = collectEntryOutputs(clientBuild.metafile?.outputs ?? {}, outDir, rootDir);
  const clientAssetRelativePath = requireEntryOutput(
    browserOutputs,
    clientBootstrapPath,
    "client bootstrap",
  );
  const clientFile = path.join(outDir, clientAssetRelativePath);
  const devClientFile =
    options.includeDevClient === true
      ? path.join(
          outDir,
          requireEntryOutput(browserOutputs, devClientPath, "development client bootstrap"),
        )
      : undefined;

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
    logLevel: "silent",
    metafile: true,
    outdir: serverModulesDir,
    platform: "node",
    plugins: [createCssModulePlugin("server"), createServerBundleTransformPlugin(appDir)],
    splitting: true,
    sourcemap: true,
    target: ["node24"],
    write: true,
  });
  const serverOutputs = collectEntryOutputs(
    serverModuleBuild.metafile?.outputs ?? {},
    outDir,
    rootDir,
  );

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
    logLevel: "silent",
    outfile: serverFile,
    platform: "node",
    plugins: [createCssModulePlugin("server"), createServerBundleTransformPlugin(appDir)],
    sourcemap: true,
    stdin: {
      contents: createServerEntry({
        distDir: outDir,
        manifest,
        serverAppPath,
      }),
      resolveDir: rootDir,
      sourcefile: "virtual-server-entry.ts",
    },
    target: ["node24"],
    write: true,
  });

  const shouldBuildNodeTarget = target !== "worker";
  const shouldBuildWorkerTarget = target !== "node";
  const srvxEntryFile = shouldBuildNodeTarget ? path.join(outDir, "srvx.js") : undefined;

  if (srvxEntryFile !== undefined) {
    await esbuild({
      absWorkingDir: rootDir,
      bundle: true,
      format: "esm",
      logLevel: "silent",
      outfile: srvxEntryFile,
      platform: "node",
      sourcemap: true,
      stdin: {
        contents: createSrvxEntry({
          distDir: outDir,
          manifest,
          serverAppPath,
        }),
        resolveDir: rootDir,
        sourcefile: "virtual-srvx-entry.ts",
      },
      target: ["node24"],
      write: true,
    });
  }

  const workerEntryFile = shouldBuildWorkerTarget ? path.join(outDir, "worker.js") : undefined;

  if (workerEntryFile !== undefined) {
    const serverModuleIds = createServerModuleIdMap(collectServerModulePaths(routes), rootDir);

    await esbuild({
      absWorkingDir: rootDir,
      alias: {
        elemental: packageEntryPath,
      },
      bundle: true,
      format: "esm",
      logLevel: "silent",
      outfile: workerEntryFile,
      platform: "browser",
      plugins: [
        createCssModulePlugin("server"),
        createServerBundleTransformPlugin(appDir),
        createWorkerRuntimeValidationPlugin(appDir),
      ],
      sourcemap: true,
      stdin: {
        contents: createWorkerEntry({
          manifest: createWorkerManifest(manifest, routes, rootDir, serverModuleIds),
          moduleIdByFilePath: serverModuleIds,
          modulePaths: collectServerModulePaths(routes),
          workerServerPath,
        }),
        resolveDir: rootDir,
        sourcefile: "virtual-worker-entry.ts",
      },
      target: ["es2024"],
      write: true,
    });
  }

  const wranglerConfigFile =
    workerEntryFile === undefined
      ? undefined
      : await writeWranglerConfig(outDir, manifest.generatedAt);

  return {
    clientFile,
    devClientFile,
    manifestPath,
    outDir,
    routes,
    serverFile,
    srvxEntryFile,
    wranglerConfigFile,
    workerEntryFile,
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
    logLevel: "silent",
    outfile: path.join(outDir, "index.js"),
    platform: "neutral",
    sourcemap: true,
    target: ["es2024"],
    write: true,
    entryPoints: [packageEntryPath],
  });

  await esbuild({
    bundle: true,
    entryPoints: [cliEntryPath],
    external: ["@oxc-parser/*", "esbuild", "node:*", "oxc-parser"],
    format: "esm",
    logLevel: "silent",
    outfile: path.join(outDir, "cli.js"),
    packages: "external",
    platform: "node",
    sourcemap: true,
    target: ["node24"],
    write: true,
  });
}
