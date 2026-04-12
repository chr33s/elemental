#!/usr/bin/env node

import path from "node:path";
import { buildProject } from "../build/index.ts";

async function main(): Promise<void> {
  const [command = "build"] = process.argv.slice(2);

  if (command !== "build") {
    throw new Error(`Unknown Elemental command: ${command}`);
  }

  const result = await buildProject();
  const relativeOutDir = path.relative(process.cwd(), result.outDir) || result.outDir;

  console.log(`Built ${result.routes.length} route(s) into ${relativeOutDir}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
