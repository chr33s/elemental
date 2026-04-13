import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type WranglerConfig = {
  assets?: {
    binding?: string;
    directory?: string;
    run_worker_first?: boolean;
  };
  compatibility_date?: string;
  main?: string;
  name?: string;
};

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const distConfigPath = path.join(fixtureDir, "dist", "wrangler.jsonc");
const previewConfigPath = path.join(fixtureDir, "wrangler.jsonc");
const distConfig = JSON.parse(await readFile(distConfigPath, "utf8")) as WranglerConfig;
const previewConfig: WranglerConfig = {
  ...distConfig,
  assets: {
    ...distConfig.assets,
    directory: "./dist",
  },
  main: "./dist/worker.js",
};

await writeFile(previewConfigPath, `${JSON.stringify(previewConfig, null, 2)}\n`, "utf8");

console.log(`Wrote ${path.basename(previewConfigPath)}`);
