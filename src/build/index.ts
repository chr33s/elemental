import { mkdir } from "node:fs/promises";
import path from "node:path";
import { build as esbuild } from "esbuild";
import { discoverRoutes } from "./discover.ts";
import { type BuildManifest, writeManifest } from "./manifest.ts";
import { validateModuleWithOxc } from "./oxc.ts";

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
  const packageEntryPath = path.join(rootDir, "src/index.ts");
  const cliEntryPath = path.join(rootDir, "src/cli/index.ts");
  const clientBootstrapPath = path.join(rootDir, "src/runtime/client/bootstrap.ts");
  const serverAppPath = path.join(rootDir, "src/runtime/server/app.ts");

  await mkdir(assetsDir, { recursive: true });

  const routes = await discoverRoutes(appDir);

  if (routes.length === 0) {
    throw new Error(`No routes were discovered under ${appDir}`);
  }

  for (const route of routes) {
    await validateModuleWithOxc(route.filePath);
  }

  const rootRoute = routes.find((route) => route.pattern === "/");

  if (!rootRoute) {
    throw new Error(`Phase 1 build expects a root route at ${path.join(appDir, "index.ts")}`);
  }

  await buildPackageEntrypoints(packageEntryPath, cliEntryPath, outDir);

  const clientBuild = await esbuild({
    absWorkingDir: rootDir,
    alias: {
      elemental: packageEntryPath,
    },
    bundle: true,
    entryNames: "app-[hash]",
    format: "esm",
    metafile: true,
    outdir: assetsDir,
    platform: "browser",
    sourcemap: true,
    stdin: {
      contents: `import ${JSON.stringify(clientBootstrapPath)};\nimport ${JSON.stringify(rootRoute.filePath)};\n`,
      resolveDir: rootDir,
      sourcefile: "virtual-client-entry.ts",
    },
    target: ["chrome123", "safari17"],
    write: true,
  });

  const clientFile = findBuiltJavaScriptFile(clientBuild.metafile?.outputs ?? {}, outDir);
  const clientAssetRelativePath = toPosixPath(path.relative(outDir, clientFile));
  const manifest: BuildManifest = {
    appDir: toPosixPath(path.relative(rootDir, appDir)),
    assets: {
      clientEntry: clientAssetRelativePath,
    },
    generatedAt: new Date().toISOString(),
    routes: routes.map((route) => ({
      pattern: route.pattern,
      source: toPosixPath(path.relative(rootDir, route.filePath)),
    })),
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

function findBuiltJavaScriptFile(
  outputs: Record<string, { entryPoint?: string }>,
  outDir: string,
): string {
  for (const outputPath of Object.keys(outputs)) {
    if (!outputPath.endsWith(".js")) {
      continue;
    }

    if (!outputPath.includes(`${path.sep}assets${path.sep}`)) {
      continue;
    }

    return path.resolve(outDir, path.relative(outDir, outputPath));
  }

  throw new Error("The browser build did not emit a JavaScript asset");
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
