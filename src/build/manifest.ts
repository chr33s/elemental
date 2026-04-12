import { writeFile } from "node:fs/promises";
import path from "node:path";

export interface BuildManifestRoute {
  assets: {
    layoutCss: string[];
    scripts: string[];
  };
  browser: {
    errorBoundaries: string[];
    layouts: string[];
    route: string;
  };
  errorBoundaries: string[];
  layoutStylesheets: string[];
  layouts: string[];
  pattern: string;
  server: {
    layouts: string[];
    route: string;
    routeServer?: string;
    serverErrorBoundaries: string[];
  };
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
