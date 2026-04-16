import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { BuildManifest } from "./manifest.ts";

export async function writeManifest(outDir: string, manifest: BuildManifest): Promise<string> {
  const manifestPath = path.join(outDir, "manifest.json");

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return manifestPath;
}
