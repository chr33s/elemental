import { createHash } from "node:crypto";
import path from "node:path";
import { toPosixPath } from "../shared/path-utils.ts";
import type { DiscoveredRoute } from "./discover.ts";

export function shortHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 8);
}

export function collectBrowserModulePaths(routes: DiscoveredRoute[]): string[] {
  return collectUniquePaths(
    routes.flatMap((route) => [route.filePath, ...route.layouts, ...route.errorBoundaries]),
  );
}

export function collectServerModulePaths(routes: DiscoveredRoute[]): string[] {
  return collectUniquePaths(
    routes.flatMap((route) => [
      route.filePath,
      ...route.layouts,
      ...route.serverErrorBoundaries,
      ...(route.serverFilePath === undefined ? [] : [route.serverFilePath]),
    ]),
  );
}

export function collectUniquePaths(filePaths: string[]): string[] {
  return [...new Set(filePaths.map((filePath) => path.resolve(filePath)))].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function createEntryPointMap(filePaths: string[], rootDir: string): Record<string, string> {
  return Object.fromEntries(
    filePaths.map((filePath) => [createEntryName(filePath, rootDir), path.resolve(filePath)]),
  );
}

export function slugifyFileStem(filePath: string): string {
  const extension = path.extname(filePath);
  const fileStem = filePath.slice(0, extension.length === 0 ? filePath.length : -extension.length);
  const slug = fileStem
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return slug.length === 0 ? "entry" : slug;
}

export function collectEntryOutputs(
  outputs: Record<string, { entryPoint?: string }>,
  outDir: string,
  workingDir: string,
): Map<string, string> {
  const entryOutputs = new Map<string, string>();

  for (const [outputPath, outputInfo] of Object.entries(outputs)) {
    if (outputInfo.entryPoint === undefined || !outputPath.endsWith(".js")) {
      continue;
    }

    const absoluteOutputPath = path.resolve(workingDir, outputPath);

    entryOutputs.set(
      path.resolve(workingDir, outputInfo.entryPoint),
      toPosixPath(path.relative(outDir, absoluteOutputPath)),
    );
  }

  return entryOutputs;
}

export function requireEntryOutput(
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

export function createServerModuleIdMap(filePaths: string[], rootDir: string): Map<string, string> {
  return new Map(
    filePaths.map((filePath) => [path.resolve(filePath), createServerModuleId(filePath, rootDir)]),
  );
}

export function requireServerModuleId(
  moduleIdByFilePath: Map<string, string>,
  filePath: string,
  rootDir: string,
): string {
  const moduleId = moduleIdByFilePath.get(path.resolve(filePath));

  if (moduleId === undefined) {
    throw new Error(
      `Missing server module id for ${toPosixPath(path.relative(rootDir, filePath))}`,
    );
  }

  return moduleId;
}

function createEntryName(filePath: string, rootDir: string): string {
  const relativePath = toPosixPath(path.relative(rootDir, filePath));

  return `${slugifyFileStem(relativePath)}-${shortHash(relativePath)}`;
}

function createServerModuleId(filePath: string, rootDir: string): string {
  return `server:${toPosixPath(path.relative(rootDir, filePath))}`;
}
