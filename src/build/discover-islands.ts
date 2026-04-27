import { readdir } from "node:fs/promises";
import path from "node:path";
import { ELEMENTAL_ISLAND_ID_PATTERN } from "../runtime/shared/islands.ts";
import { toPosixPath } from "../shared/path-utils.ts";
import { validateModuleWithOxc } from "./oxc.ts";

const ISLANDS_DIRECTORY_NAME = "islands";

export interface DiscoveredIsland {
  filePath: string;
  id: string;
}

/**
 * Discovers framework-managed island modules under `<appDir>/islands/`.
 *
 * Each `.ts` file under that directory becomes an island whose id is its
 * relative path from `islands/` without the extension, joined by forward
 * slashes (for example `islands/charts/line.ts` -> `charts/line`).
 */
export async function discoverIslands(appDir: string): Promise<DiscoveredIsland[]> {
  const islandsDir = path.join(appDir, ISLANDS_DIRECTORY_NAME);
  const files: string[] = [];

  await walk(islandsDir, files);

  const islands = files.map((filePath) => createDiscoveredIsland(islandsDir, filePath));
  const seenIds = new Set<string>();

  for (const island of islands) {
    if (!ELEMENTAL_ISLAND_ID_PATTERN.test(island.id)) {
      throw new Error(
        `Invalid island id "${island.id}" derived from ${island.filePath}. Island ids must match ${ELEMENTAL_ISLAND_ID_PATTERN}.`,
      );
    }

    if (seenIds.has(island.id)) {
      throw new Error(`Duplicate island id "${island.id}"`);
    }

    seenIds.add(island.id);
  }

  await Promise.all(islands.map((island) => validateModuleWithOxc(island.filePath)));

  return islands.sort((left, right) => left.id.localeCompare(right.id));
}

async function walk(directory: string, files: string[]): Promise<void> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await walk(entryPath, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".server.ts")) {
      files.push(entryPath);
    }
  }
}

function createDiscoveredIsland(islandsDir: string, filePath: string): DiscoveredIsland {
  const relativePath = toPosixPath(path.relative(islandsDir, filePath));
  const id = relativePath.replace(/\.ts$/u, "");

  return {
    filePath,
    id,
  };
}
