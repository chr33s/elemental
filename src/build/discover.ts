import { readdir } from "node:fs/promises";
import path from "node:path";

export interface DiscoveredRoute {
  filePath: string;
  pattern: string;
  segments: string[];
}

export async function discoverRoutes(appDir: string): Promise<DiscoveredRoute[]> {
  const routes: DiscoveredRoute[] = [];

  await walk(appDir, routes, appDir);

  return routes.sort((left, right) => left.pattern.localeCompare(right.pattern));
}

async function walk(rootDir: string, routes: DiscoveredRoute[], currentDir: string): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  if (entries.some((entry) => entry.isFile() && entry.name === "index.ts")) {
    const relativeDir = path.relative(rootDir, currentDir);
    const segments = relativeDir === "" ? [] : relativeDir.split(path.sep);

    routes.push({
      filePath: path.join(currentDir, "index.ts"),
      pattern: toRoutePattern(segments),
      segments,
    });
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    await walk(rootDir, routes, path.join(currentDir, entry.name));
  }
}

function toRoutePattern(segments: string[]): string {
  if (segments.length === 0) {
    return "/";
  }

  return `/${segments
    .map((segment) => {
      if (segment.startsWith("[...") && segment.endsWith("]")) {
        return `*${segment.slice(4, -1)}`;
      }

      if (segment.startsWith("[") && segment.endsWith("]")) {
        return `:${segment.slice(1, -1)}`;
      }

      return segment;
    })
    .join("/")}`;
}
