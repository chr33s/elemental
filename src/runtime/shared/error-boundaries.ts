import type {
  BuildManifest,
  BuildManifestRoute,
  PublicBuildManifest,
  PublicBuildManifestRoute,
} from "../../build/manifest.ts";
import {
  dirnamePosix,
  normalizePosixPath,
  relativePosixPath,
  splitPathSegments,
} from "../../shared/path-utils.ts";
import type { RouteParams } from "./types.ts";

export type ErrorBoundaryKind = "browser" | "server";

type RouteWithServerErrorBoundaries = Pick<BuildManifestRoute, "server" | "serverErrorBoundaries">;

type RouteWithBrowserErrorBoundaries = Pick<
  PublicBuildManifestRoute,
  "browser" | "errorBoundaries"
>;

interface BoundaryEntry {
  modulePath: string;
  sourcePath: string;
}

interface ManifestDirectory {
  browserBoundary?: BoundaryEntry;
  path: string;
  segments: string[];
  serverBoundary?: BoundaryEntry;
}

interface DirectoryMatch {
  consumed: number;
  params: RouteParams;
  specificity: number[];
}

export interface ResolvedErrorBoundary {
  directoryPath: string;
  modulePath: string;
  params: RouteParams;
  sourcePath: string;
}

export function resolveNearestBrowserErrorBoundaryForPathname(
  manifest: PublicBuildManifest,
  pathname: string,
): ResolvedErrorBoundary | undefined {
  return resolveNearestBoundaryForPathname({
    appDir: normalizePosixPath(manifest.appDir),
    directories: createBrowserManifestDirectoryMap(manifest),
    kind: "browser",
    pathname,
  });
}

export function resolveNearestServerErrorBoundaryForPathname(
  manifest: BuildManifest,
  pathname: string,
): ResolvedErrorBoundary | undefined {
  return resolveNearestBoundaryForPathname({
    appDir: normalizePosixPath(manifest.appDir),
    directories: createServerManifestDirectoryMap(manifest),
    kind: "server",
    pathname,
  });
}

function resolveNearestBoundaryForPathname(options: {
  appDir: string;
  directories: Map<string, ManifestDirectory>;
  kind: ErrorBoundaryKind;
  pathname: string;
}): ResolvedErrorBoundary | undefined {
  const pathnameSegments = splitPathSegments(options.pathname);
  const matchedDirectory = findDeepestMatchingDirectory(
    options.directories,
    pathnameSegments,
    options.appDir,
  );

  if (matchedDirectory === undefined) {
    return undefined;
  }

  let currentDirectoryPath = matchedDirectory.directory.path;

  while (true) {
    const currentDirectory = options.directories.get(currentDirectoryPath);
    const boundary =
      options.kind === "browser"
        ? currentDirectory?.browserBoundary
        : currentDirectory?.serverBoundary;

    if (boundary !== undefined) {
      return {
        directoryPath: currentDirectoryPath,
        modulePath: boundary.modulePath,
        params: matchedDirectory.match.params,
        sourcePath: boundary.sourcePath,
      };
    }

    if (currentDirectoryPath === options.appDir) {
      return undefined;
    }

    currentDirectoryPath = dirnamePosix(currentDirectoryPath);
  }
}

export function resolveNearestBrowserErrorBoundaryForRoute(
  route: RouteWithBrowserErrorBoundaries,
  params: RouteParams,
): ResolvedErrorBoundary | undefined {
  return resolveBoundaryForRoute(route.errorBoundaries, route.browser.errorBoundaries, params);
}

export function resolveNearestServerErrorBoundaryForRoute(
  route: RouteWithServerErrorBoundaries,
  params: RouteParams,
): ResolvedErrorBoundary | undefined {
  return resolveBoundaryForRoute(
    route.serverErrorBoundaries,
    route.server.serverErrorBoundaries,
    params,
  );
}

function resolveBoundaryForRoute(
  sourcePaths: string[],
  modulePaths: string[],
  params: RouteParams,
): ResolvedErrorBoundary | undefined {
  const boundaryIndex = Math.min(sourcePaths.length, modulePaths.length) - 1;

  if (boundaryIndex < 0) {
    return undefined;
  }

  return {
    directoryPath: dirnamePosix(sourcePaths[boundaryIndex]),
    modulePath: modulePaths[boundaryIndex],
    params,
    sourcePath: sourcePaths[boundaryIndex],
  };
}

function createBrowserManifestDirectoryMap(
  manifest: PublicBuildManifest,
): Map<string, ManifestDirectory> {
  const appDir = normalizePosixPath(manifest.appDir);
  const directories = new Map<string, ManifestDirectory>();

  ensureDirectory(directories, appDir, appDir);

  for (const route of manifest.routes) {
    for (const sourcePath of route.errorBoundaries) {
      ensureDirectory(directories, appDir, dirnamePosix(sourcePath));
    }

    for (let index = 0; index < route.errorBoundaries.length; index += 1) {
      const sourcePath = route.errorBoundaries[index];
      const modulePath = route.browser.errorBoundaries[index];

      if (modulePath === undefined) {
        continue;
      }

      ensureDirectory(directories, appDir, dirnamePosix(sourcePath)).browserBoundary = {
        modulePath,
        sourcePath,
      };
    }
  }

  return directories;
}

function createServerManifestDirectoryMap(manifest: BuildManifest): Map<string, ManifestDirectory> {
  const appDir = normalizePosixPath(manifest.appDir);
  const directories = new Map<string, ManifestDirectory>();

  ensureDirectory(directories, appDir, appDir);

  for (const route of manifest.routes) {
    for (const filePath of [
      route.source,
      route.serverSource,
      ...route.layouts,
      ...route.layoutStylesheets,
      ...route.errorBoundaries,
      ...route.serverErrorBoundaries,
    ]) {
      if (filePath !== undefined) {
        ensureDirectory(directories, appDir, dirnamePosix(filePath));
      }
    }

    for (let index = 0; index < route.errorBoundaries.length; index += 1) {
      const sourcePath = route.errorBoundaries[index];
      const modulePath = route.browser.errorBoundaries[index];

      if (modulePath === undefined) {
        continue;
      }

      ensureDirectory(directories, appDir, dirnamePosix(sourcePath)).browserBoundary = {
        modulePath,
        sourcePath,
      };
    }

    for (let index = 0; index < route.serverErrorBoundaries.length; index += 1) {
      const sourcePath = route.serverErrorBoundaries[index];
      const modulePath = route.server.serverErrorBoundaries[index];

      if (modulePath === undefined) {
        continue;
      }

      ensureDirectory(directories, appDir, dirnamePosix(sourcePath)).serverBoundary = {
        modulePath,
        sourcePath,
      };
    }
  }

  return directories;
}

function ensureDirectory(
  directories: Map<string, ManifestDirectory>,
  appDir: string,
  directoryPath: string,
): ManifestDirectory {
  const normalizedPath = normalizePosixPath(directoryPath);
  const existingDirectory = directories.get(normalizedPath);

  if (existingDirectory !== undefined) {
    return existingDirectory;
  }

  if (normalizedPath !== appDir) {
    ensureDirectory(directories, appDir, dirnamePosix(normalizedPath));
  }

  const relativePath = relativePosixPath(appDir, normalizedPath);
  const directory: ManifestDirectory = {
    path: normalizedPath,
    segments: relativePath === "" ? [] : relativePath.split("/"),
  };

  directories.set(normalizedPath, directory);

  return directory;
}

function findDeepestMatchingDirectory(
  directories: Map<string, ManifestDirectory>,
  pathnameSegments: string[],
  appDir: string,
):
  | {
      directory: ManifestDirectory;
      match: DirectoryMatch;
    }
  | undefined {
  let bestMatch:
    | {
        directory: ManifestDirectory;
        match: DirectoryMatch;
      }
    | undefined;

  for (const directory of directories.values()) {
    const match = matchDirectorySegments(directory.segments, pathnameSegments);

    if (match === undefined) {
      continue;
    }

    if (
      bestMatch === undefined ||
      compareDirectoryMatches(directory, match, bestMatch.directory, bestMatch.match) < 0
    ) {
      bestMatch = {
        directory,
        match,
      };
    }
  }

  if (bestMatch !== undefined) {
    return bestMatch;
  }

  const rootDirectory = directories.get(appDir);

  if (rootDirectory === undefined) {
    return undefined;
  }

  return {
    directory: rootDirectory,
    match: {
      consumed: 0,
      params: {},
      specificity: [],
    },
  };
}

function compareDirectoryMatches(
  leftDirectory: ManifestDirectory,
  leftMatch: DirectoryMatch,
  rightDirectory: ManifestDirectory,
  rightMatch: DirectoryMatch,
): number {
  if (leftMatch.consumed !== rightMatch.consumed) {
    return rightMatch.consumed - leftMatch.consumed;
  }

  const specificityLength = Math.min(leftMatch.specificity.length, rightMatch.specificity.length);

  for (let index = 0; index < specificityLength; index += 1) {
    if (leftMatch.specificity[index] !== rightMatch.specificity[index]) {
      return rightMatch.specificity[index] - leftMatch.specificity[index];
    }
  }

  if (leftDirectory.segments.length !== rightDirectory.segments.length) {
    return rightDirectory.segments.length - leftDirectory.segments.length;
  }

  return leftDirectory.path.localeCompare(rightDirectory.path);
}

function matchDirectorySegments(
  directorySegments: string[],
  pathnameSegments: string[],
): DirectoryMatch | undefined {
  const params: RouteParams = {};
  const specificity: number[] = [];
  let pathnameIndex = 0;

  for (const directorySegment of directorySegments) {
    if (directorySegment.startsWith("[...") && directorySegment.endsWith("]")) {
      const paramName = directorySegment.slice(4, -1);
      const remainingSegments = pathnameSegments.slice(pathnameIndex);

      if (remainingSegments.length === 0) {
        return undefined;
      }

      params[paramName] = remainingSegments;
      specificity.push(1);

      return {
        consumed: pathnameSegments.length,
        params,
        specificity,
      };
    }

    const pathnameSegment = pathnameSegments[pathnameIndex];

    if (pathnameSegment === undefined) {
      return undefined;
    }

    if (directorySegment.startsWith("[") && directorySegment.endsWith("]")) {
      params[directorySegment.slice(1, -1)] = pathnameSegment;
      pathnameIndex += 1;
      specificity.push(2);
      continue;
    }

    if (directorySegment !== pathnameSegment) {
      return undefined;
    }

    pathnameIndex += 1;
    specificity.push(3);
  }

  return {
    consumed: pathnameIndex,
    params,
    specificity,
  };
}
