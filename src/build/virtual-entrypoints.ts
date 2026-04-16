import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { BuildManifest } from "./manifest.ts";

export function createServerEntry(options: {
  distDir: string;
  manifest: BuildManifest;
  serverAppPath: string;
}): string {
  return [
    `import { startServer } from ${JSON.stringify(options.serverAppPath)};`,
    "",
    "startServer({",
    `  distDir: ${JSON.stringify(options.distDir)},`,
    `  manifest: ${JSON.stringify(options.manifest, null, 2)},`,
    "});",
    "",
  ].join("\n");
}

export function createSrvxEntry(options: {
  distDir: string;
  manifest: BuildManifest;
  serverAppPath: string;
}): string {
  return [
    `import { createSrvxHandler } from ${JSON.stringify(options.serverAppPath)};`,
    "",
    "export default createSrvxHandler({",
    `  distDir: ${JSON.stringify(options.distDir)},`,
    `  manifest: ${JSON.stringify(options.manifest, null, 2)},`,
    "});",
    "",
  ].join("\n");
}

export function createWorkerEntry(options: {
  manifest: BuildManifest;
  moduleIdByFilePath: Map<string, string>;
  modulePaths: string[];
  workerServerPath: string;
}): string {
  const importLines = [
    `import { createWorkerHandler } from ${JSON.stringify(options.workerServerPath)};`,
  ];
  const registryEntries: string[] = [];

  options.modulePaths.forEach((modulePath, index) => {
    const variableName = `serverModule${index}`;
    const moduleId = options.moduleIdByFilePath.get(path.resolve(modulePath));

    if (moduleId === undefined) {
      throw new Error(`Missing worker module id for ${modulePath}`);
    }

    importLines.push(
      `import * as ${variableName} from ${JSON.stringify(path.resolve(modulePath))};`,
    );
    registryEntries.push(`  ${JSON.stringify(moduleId)}: ${variableName},`);
  });

  return [
    ...importLines,
    "",
    "export default createWorkerHandler({",
    `  manifest: ${JSON.stringify(options.manifest, null, 2)},`,
    "  modules: {",
    ...registryEntries,
    "  },",
    "});",
    "",
  ].join("\n");
}

export async function writeWranglerConfig(outDir: string, generatedAt: string): Promise<string> {
  const wranglerConfigFile = path.join(outDir, "wrangler.jsonc");
  const compatibilityDate = generatedAt.slice(0, 10);

  await writeFile(
    wranglerConfigFile,
    [
      "{",
      '  "name": "elemental-worker",',
      '  "main": "./worker.js",',
      `  "compatibility_date": ${JSON.stringify(compatibilityDate)},`,
      '  "assets": {',
      '    "directory": ".",',
      '    "binding": "ASSETS",',
      '    "run_worker_first": true',
      "  }",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  return wranglerConfigFile;
}
