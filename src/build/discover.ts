import { readdir } from "node:fs/promises";
import path from "node:path";
import { validateModuleWithOxc } from "./oxc.ts";

export type RouteSegmentKind = "static" | "dynamic" | "catchall";

export interface DiscoveredRouteSegment {
  kind: RouteSegmentKind;
  raw: string;
  value: string;
}

export interface DiscoveredRoute {
  directoryPath: string;
  errorBoundaries: string[];
  filePath: string;
  layouts: string[];
  parsedSegments: DiscoveredRouteSegment[];
  pattern: string;
  segments: string[];
  serverErrorBoundaries: string[];
  serverFilePath?: string;
}

interface DiscoveredDirectory {
  directoryPath: string;
  errorBoundaryFilePath?: string;
  layoutFilePath?: string;
  routeFilePath?: string;
  routeServerFilePath?: string;
  segments: string[];
  serverErrorBoundaryFilePath?: string;
}

export async function discoverRoutes(appDir: string): Promise<DiscoveredRoute[]> {
  const directories = new Map<string, DiscoveredDirectory>();

  await walk(appDir, directories, appDir);
  await validateDiscoveredModules(directories);

  return [...directories.values()]
    .filter((directory) => directory.routeFilePath !== undefined)
    .map((directory) => createDiscoveredRoute(appDir, directories, directory))
    .sort(compareRoutes);
}

async function walk(
  rootDir: string,
  directories: Map<string, DiscoveredDirectory>,
  currentDir: string,
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const fileNames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const relativeDir = path.relative(rootDir, currentDir);
  const segments = relativeDir === "" ? [] : relativeDir.split(path.sep);

  directories.set(relativeDir, {
    directoryPath: currentDir,
    errorBoundaryFilePath: fileNames.has("error.ts")
      ? path.join(currentDir, "error.ts")
      : undefined,
    layoutFilePath: fileNames.has("layout.ts") ? path.join(currentDir, "layout.ts") : undefined,
    routeFilePath: fileNames.has("index.ts") ? path.join(currentDir, "index.ts") : undefined,
    routeServerFilePath: fileNames.has("index.server.ts")
      ? path.join(currentDir, "index.server.ts")
      : undefined,
    segments,
    serverErrorBoundaryFilePath: fileNames.has("error.server.ts")
      ? path.join(currentDir, "error.server.ts")
      : undefined,
  });

  const childDirectories = entries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of childDirectories) {
    await walk(rootDir, directories, path.join(currentDir, entry.name));
  }
}

function createDiscoveredRoute(
  appDir: string,
  directories: Map<string, DiscoveredDirectory>,
  directory: DiscoveredDirectory,
): DiscoveredRoute {
  const parsedSegments = directory.segments.map((segment, index) =>
    parseRouteSegment(segment, {
      filePath: directory.routeFilePath ?? directory.directoryPath,
      isLast: index === directory.segments.length - 1,
    }),
  );
  const ancestors = getAncestorDirectories(appDir, directories, directory.segments);

  return {
    directoryPath: directory.directoryPath,
    errorBoundaries: ancestors.flatMap((ancestor) =>
      ancestor.errorBoundaryFilePath === undefined ? [] : [ancestor.errorBoundaryFilePath],
    ),
    filePath: directory.routeFilePath ?? path.join(directory.directoryPath, "index.ts"),
    layouts: ancestors.flatMap((ancestor) =>
      ancestor.layoutFilePath === undefined ? [] : [ancestor.layoutFilePath],
    ),
    parsedSegments,
    pattern: toRoutePattern(parsedSegments),
    segments: directory.segments,
    serverErrorBoundaries: ancestors.flatMap((ancestor) =>
      ancestor.serverErrorBoundaryFilePath === undefined
        ? []
        : [ancestor.serverErrorBoundaryFilePath],
    ),
    serverFilePath: directory.routeServerFilePath,
  };
}

function getAncestorDirectories(
  appDir: string,
  directories: Map<string, DiscoveredDirectory>,
  segments: string[],
): DiscoveredDirectory[] {
  const ancestors: DiscoveredDirectory[] = [];

  for (let depth = 0; depth <= segments.length; depth += 1) {
    const relativeDir = depth === 0 ? "" : segments.slice(0, depth).join(path.sep);
    const ancestor = directories.get(relativeDir);

    if (ancestor !== undefined) {
      ancestors.push(ancestor);
      continue;
    }

    ancestors.push({
      directoryPath: depth === 0 ? appDir : path.join(appDir, ...segments.slice(0, depth)),
      segments: segments.slice(0, depth),
    });
  }

  return ancestors;
}

async function validateDiscoveredModules(
  directories: Map<string, DiscoveredDirectory>,
): Promise<void> {
  const modulePaths = new Set<string>();

  for (const directory of directories.values()) {
    for (const filePath of [
      directory.routeFilePath,
      directory.routeServerFilePath,
      directory.layoutFilePath,
      directory.errorBoundaryFilePath,
      directory.serverErrorBoundaryFilePath,
    ]) {
      if (filePath !== undefined) {
        modulePaths.add(filePath);
      }
    }
  }

  await Promise.all([...modulePaths].map((filePath) => validateModuleWithOxc(filePath)));
}

function parseRouteSegment(
  segment: string,
  options: {
    filePath: string;
    isLast: boolean;
  },
): DiscoveredRouteSegment {
  if (segment.startsWith("[...") && segment.endsWith("]")) {
    const value = segment.slice(4, -1);

    if (value.length === 0) {
      throw new Error(
        `Route segment ${segment} in ${options.filePath} must name its catch-all parameter`,
      );
    }

    if (!options.isLast) {
      throw new Error(
        `Catch-all route segment ${segment} in ${options.filePath} must be the final segment in the route path`,
      );
    }

    return {
      kind: "catchall",
      raw: segment,
      value,
    };
  }

  if (segment.startsWith("[") && segment.endsWith("]")) {
    const value = segment.slice(1, -1);

    if (value.length === 0) {
      throw new Error(
        `Route segment ${segment} in ${options.filePath} must name its dynamic parameter`,
      );
    }

    return {
      kind: "dynamic",
      raw: segment,
      value,
    };
  }

  return {
    kind: "static",
    raw: segment,
    value: segment,
  };
}

function toRoutePattern(segments: DiscoveredRouteSegment[]): string {
  if (segments.length === 0) {
    return "/";
  }

  return `/${segments
    .map((segment) => {
      if (segment.kind === "catchall") {
        return `*${segment.value}`;
      }

      if (segment.kind === "dynamic") {
        return `:${segment.value}`;
      }

      return segment.value;
    })
    .join("/")}`;
}

function compareRoutes(left: DiscoveredRoute, right: DiscoveredRoute): number {
  const segmentCount = Math.min(left.parsedSegments.length, right.parsedSegments.length);

  for (let index = 0; index < segmentCount; index += 1) {
    const leftSegment = left.parsedSegments[index];
    const rightSegment = right.parsedSegments[index];
    const specificityDifference =
      segmentSpecificity(rightSegment.kind) - segmentSpecificity(leftSegment.kind);

    if (specificityDifference !== 0) {
      return specificityDifference;
    }

    if (leftSegment.kind === "static" && rightSegment.kind === "static") {
      const literalDifference = leftSegment.value.localeCompare(rightSegment.value);

      if (literalDifference !== 0) {
        return literalDifference;
      }
    }
  }

  const lengthDifference = right.parsedSegments.length - left.parsedSegments.length;

  if (lengthDifference !== 0) {
    return lengthDifference;
  }

  return left.pattern.localeCompare(right.pattern);
}

function segmentSpecificity(kind: RouteSegmentKind): number {
  switch (kind) {
    case "static":
      return 3;
    case "dynamic":
      return 2;
    case "catchall":
      return 1;
  }
}
