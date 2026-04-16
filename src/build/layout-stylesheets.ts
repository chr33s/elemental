import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { toPosixPath } from "../shared/path-utils.ts";
import type { DiscoveredRoute } from "./discover.ts";
import { collectUniquePaths, shortHash, slugifyFileStem } from "./entry-points.ts";

export async function emitLayoutStylesheetAssets(
  routes: DiscoveredRoute[],
  assetsDir: string,
  appDir: string,
  outDir: string,
): Promise<Map<string, string>> {
  const emittedAssets = new Map<string, string>();

  for (const filePath of collectUniquePaths(routes.flatMap((route) => route.layoutStylesheets))) {
    const sourceText = await readFile(filePath, "utf8");
    const relativePath = toPosixPath(path.relative(appDir, filePath));
    const fileName = `${slugifyFileStem(relativePath)}-${shortHash(sourceText)}.css`;
    const outputPath = path.join(assetsDir, fileName);

    await writeFile(outputPath, sourceText, "utf8");
    emittedAssets.set(path.resolve(filePath), toPosixPath(path.relative(outDir, outputPath)));
  }

  return emittedAssets;
}
