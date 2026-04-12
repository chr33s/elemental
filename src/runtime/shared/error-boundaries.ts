import type { BuildManifest, BuildManifestRoute } from "../../build/manifest.ts";
import type { RouteParams } from "./types.ts";

type ErrorBoundaryKind = "browser" | "server";

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
  manifest: BuildManifest,
  pathname: string,
): ResolvedErrorBoundary | undefined {
  return resolveNearestBoundaryForPathname(manifest, pathname, "browser");
}

export function resolveNearestBrowserErrorBoundaryForRoute(
  route: BuildManifestRoute,
  params: RouteParams,
): ResolvedErrorBoundary | undefined {
  return resolveNearestBoundaryForRoute(route, params, "browser");
}

export function resolveNearestServerErrorBoundaryForPathname(
  manifest: BuildManifest,
  pathname: string,
): ResolvedErrorBoundary | undefined {
  return resolveNearestBoundaryForPathname(manifest, pathname, "server");
}

export function resolveNearestServerErrorBoundaryForRoute(
  route: BuildManifestRoute,
  params: RouteParams,
): ResolvedErrorBoundary | undefined {
  return resolveNearestBoundaryForRoute(route, params, "server");
}

function resolveNearestBoundaryForRoute(
  route: BuildManifestRoute,
  params: RouteParams,
  kind: ErrorBoundaryKind,
): ResolvedErrorBoundary | undefined {
  const sourcePaths = kind === "browser" ? route.errorBoundaries : route.serverErrorBoundaries;
  const modulePaths =
    kind === "browser" ? route.browser.errorBoundaries : route.server.serverErrorBoundaries;
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

function resolveNearestBoundaryForPathname(
  manifest: BuildManifest,
  pathname: string,
  kind: ErrorBoundaryKind,
): ResolvedErrorBoundary | undefined {
  const directories = createManifestDirectoryMap(manifest);
  const pathnameSegments = splitPathSegments(pathname);
  const matchedDirectory = findDeepestMatchingDirectory(
    directories,
    pathnameSegments,
    manifest.appDir,
  );

  if (matchedDirectory === undefined) {
    return undefined;
  }

  let currentDirectoryPath = matchedDirectory.directory.path;

  while (true) {
    const currentDirectory = directories.get(currentDirectoryPath);
    const boundary =
      kind === "browser" ? currentDirectory?.browserBoundary : currentDirectory?.serverBoundary;

    if (boundary !== undefined) {
      return {
        directoryPath: currentDirectoryPath,
        modulePath: boundary.modulePath,
        params: matchedDirectory.match.params,
        sourcePath: boundary.sourcePath,
      };
    }

    if (currentDirectoryPath === manifest.appDir) {
      return undefined;
    }

    currentDirectoryPath = dirnamePosix(currentDirectoryPath);
  }
}

function createManifestDirectoryMap(manifest: BuildManifest): Map<string, ManifestDirectory> {
  const directories = new Map<string, ManifestDirectory>();

  ensureDirectory(directories, manifest.appDir, manifest.appDir);

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
        ensureDirectory(directories, manifest.appDir, dirnamePosix(filePath));
      }
    }

    for (let index = 0; index < route.errorBoundaries.length; index += 1) {
      const sourcePath = route.errorBoundaries[index];
      const modulePath = route.browser.errorBoundaries[index];

      if (modulePath === undefined) {
        continue;
      }

      ensureDirectory(directories, manifest.appDir, dirnamePosix(sourcePath)).browserBoundary = {
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

      ensureDirectory(directories, manifest.appDir, dirnamePosix(sourcePath)).serverBoundary = {
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
  const normalizedPath = normalizeDirectoryPath(directoryPath);
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

function normalizeDirectoryPath(directoryPath: string): string {
  const isAbsolute = directoryPath.startsWith("/");
  const segments: string[] = [];

  for (const segment of directoryPath.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..") {
        segments.pop();
      } else if (!isAbsolute) {
        segments.push(segment);
      }

      continue;
    }

    segments.push(segment);
  }

  const normalizedPath =
    `${isAbsolute ? "/" : ""}${segments.join("/")}` || (isAbsolute ? "/" : ".");

  return normalizedPath.endsWith("/") && normalizedPath !== "/"
    ? normalizedPath.slice(0, -1)
    : normalizedPath;
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

function splitPathSegments(pathname: string): string[] {
  if (pathname === "/") {
    return [];
  }

  return pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment));
}

function dirnamePosix(directoryPath: string): string {
  const normalizedPath = normalizeDirectoryPath(directoryPath);

  if (normalizedPath === "/") {
    return "/";
  }

  const lastSlashIndex = normalizedPath.lastIndexOf("/");

  if (lastSlashIndex < 0) {
    return ".";
  }

  if (lastSlashIndex === 0) {
    return "/";
  }

  return normalizedPath.slice(0, lastSlashIndex);
}

function relativePosixPath(fromPath: string, toPath: string): string {
  const fromSegments = toPathSegments(fromPath);
  const toSegments = toPathSegments(toPath);
  let sharedIndex = 0;

  while (
    sharedIndex < fromSegments.length &&
    sharedIndex < toSegments.length &&
    fromSegments[sharedIndex] === toSegments[sharedIndex]
  ) {
    sharedIndex += 1;
  }

  return [
    ...Array.from({ length: Math.max(0, fromSegments.length - sharedIndex) }, () => ".."),
    ...toSegments.slice(sharedIndex),
  ].join("/");
}

function toPathSegments(directoryPath: string): string[] {
  const normalizedPath = normalizeDirectoryPath(directoryPath);

  if (normalizedPath === "/" || normalizedPath === ".") {
    return [];
  }

  return normalizedPath.replace(/^\//u, "").split("/");
}
