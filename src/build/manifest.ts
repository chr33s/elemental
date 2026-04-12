import { writeFile } from "node:fs/promises";
import path from "node:path";

export interface BuildManifestRoute {
  errorBoundaries: string[];
  layouts: string[];
  pattern: string;
  source: string;
  serverErrorBoundaries: string[];
  serverSource?: string;
}

export interface BuildManifest {
  appDir: string;
  assets: {
    clientEntry?: string;
  };
  generatedAt: string;
  routes: BuildManifestRoute[];
}

export async function writeManifest(outDir: string, manifest: BuildManifest): Promise<string> {
  const manifestPath = path.join(outDir, "manifest.json");

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return manifestPath;
}
