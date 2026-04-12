#!/usr/bin/env node

import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProject } from "../build/index.ts";

async function main(): Promise<void> {
  const [command = "build", ...args] = process.argv.slice(2);

  if (command !== "build") {
    throw new Error(`Unknown Elemental command: ${command}`);
  }

  const currentWorkingDirectory = process.cwd();
  const packageRoot = await resolvePackageRoot();
  const appDir = resolveAppDir(currentWorkingDirectory, args);
  const result = await buildProject({
    appDir,
    outDir: path.join(currentWorkingDirectory, "dist"),
    rootDir: packageRoot,
  });
  const relativeOutDir = path.relative(process.cwd(), result.outDir) || result.outDir;

  console.log(`Built ${result.routes.length} route(s) into ${relativeOutDir}`);
}

function resolveAppDir(currentWorkingDirectory: string, args: string[]): string {
  const appArg = args.find((arg) => !arg.startsWith("-"));

  return path.resolve(currentWorkingDirectory, appArg ?? "src");
}

async function resolvePackageRoot(): Promise<string> {
  const candidates = [
    path.resolve(fileURLToPath(new URL("../package.json", import.meta.url))),
    path.resolve(fileURLToPath(new URL("../../package.json", import.meta.url))),
  ];

  for (const packageJsonPath of candidates) {
    try {
      await access(packageJsonPath);
      return path.dirname(packageJsonPath);
    } catch {
      continue;
    }
  }

  throw new Error("Could not resolve the Elemental package root from the CLI entrypoint.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
