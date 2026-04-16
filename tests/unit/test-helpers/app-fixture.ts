import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildProject, type BuildOptions } from "../../../src/build/index.ts";
import type { BuildManifest } from "../../../src/build/manifest.ts";

export async function buildTempApp(options: {
  appPrefix: string;
  files: Record<string, string>;
  outPrefix: string;
  rootDir: string;
  temporaryPaths: Set<string>;
  target?: BuildOptions["target"];
}): Promise<{
  appDir: string;
  manifest: BuildManifest;
  outDir: string;
}> {
  const appDir = await createTrackedTempDir(
    options.rootDir,
    options.appPrefix,
    options.temporaryPaths,
  );
  const outDir = await createTrackedTempDir(
    options.rootDir,
    options.outPrefix,
    options.temporaryPaths,
  );

  await Promise.all(
    Object.entries(options.files).map(([relativeFilePath, sourceText]) =>
      writeRouteModule(appDir, relativeFilePath, sourceText),
    ),
  );

  const result = await buildProject({
    appDir,
    outDir,
    rootDir: options.rootDir,
    target: options.target,
  });
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as BuildManifest;

  return {
    appDir,
    manifest,
    outDir,
  };
}

export async function cleanupTemporaryPaths(temporaryPaths: Set<string>): Promise<void> {
  await Promise.all(
    [...temporaryPaths].map((temporaryPath) =>
      rm(temporaryPath, {
        force: true,
        recursive: true,
      }),
    ),
  );

  temporaryPaths.clear();
}

export async function createTrackedTempDir(
  rootDir: string,
  prefix: string,
  temporaryPaths: Set<string>,
): Promise<string> {
  const temporaryPath = await mkdtemp(path.join(rootDir, prefix));

  temporaryPaths.add(temporaryPath);

  return temporaryPath;
}

export async function writeRouteModule(
  appDir: string,
  relativeFilePath: string,
  sourceText: string,
): Promise<void> {
  const filePath = path.join(appDir, relativeFilePath);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, sourceText, "utf8");
}
