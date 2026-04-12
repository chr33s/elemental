import { writeFile } from "node:fs/promises";
import path from "node:path";

export interface BuildManifest {
  appDir: string;
  assets: {
    clientEntry?: string;
  };
  generatedAt: string;
  routes: Array<{
    pattern: string;
    source: string;
  }>;
}

export async function writeManifest(outDir: string, manifest: BuildManifest): Promise<string> {
  const manifestPath = path.join(outDir, "manifest.json");

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return manifestPath;
}
