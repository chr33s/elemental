#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildProject } from "../build/index.ts";

async function main(): Promise<void> {
  const [command = "build", ...args] = process.argv.slice(2);

  if (command !== "build") {
    throw new Error(`Unknown Elemental command: ${command}`);
  }

  const currentWorkingDirectory = process.cwd();
  const packageRoot = await resolvePackageRoot();
  const buildOptions = parseBuildArgs(args);
  const appDir = resolveAppDir(currentWorkingDirectory, buildOptions.appArg);

  if (buildOptions.watch) {
    await startWatchMode({
      appDir,
      command,
      commandArgs: buildOptions.forwardedArgs,
      packageRoot,
    });

    return;
  }

  const result = await buildProject({
    appDir,
    outDir: path.join(currentWorkingDirectory, "dist"),
    rootDir: packageRoot,
  });
  const relativeOutDir = path.relative(process.cwd(), result.outDir) || result.outDir;

  console.log(`Built ${result.routes.length} route(s) into ${relativeOutDir}`);
}

function parseBuildArgs(args: string[]): {
  appArg?: string;
  forwardedArgs: string[];
  watch: boolean;
} {
  const parsedArgs = parseArgs({
    allowPositionals: true,
    args,
    options: {
      watch: {
        type: "boolean",
      },
    },
    strict: false,
  });

  return {
    appArg: parsedArgs.positionals[0],
    forwardedArgs: args.filter((arg) => arg !== "--watch"),
    watch: parsedArgs.values.watch === true,
  };
}

function resolveAppDir(currentWorkingDirectory: string, appArg?: string): string {
  return path.resolve(currentWorkingDirectory, appArg ?? "src");
}

async function startWatchMode(options: {
  appDir: string;
  command: string;
  commandArgs: string[];
  packageRoot: string;
}): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  const frameworkSrcDir = path.join(options.packageRoot, "src");
  const watchPaths = await collectWatchPaths([options.appDir, frameworkSrcDir]);
  const nodeArgs = [
    ...watchPaths.map((watchPath) => `--watch-path=${watchPath}`),
    ...(scriptPath.endsWith(".ts") ? ["--experimental-strip-types"] : []),
    scriptPath,
    options.command,
    ...options.commandArgs,
  ];

  await runWatchProcess(nodeArgs);
}

async function collectWatchPaths(candidatePaths: string[]): Promise<string[]> {
  const uniquePaths = new Set(candidatePaths.map((candidatePath) => path.resolve(candidatePath)));
  const watchPaths: string[] = [];

  for (const candidatePath of uniquePaths) {
    try {
      await access(candidatePath);
      watchPaths.push(candidatePath);
    } catch {
      continue;
    }
  }

  return watchPaths;
}

async function runWatchProcess(nodeArgs: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, nodeArgs, {
      env: process.env,
      stdio: "inherit",
    });
    const forwardSigint = () => {
      child.kill("SIGINT");
    };
    const forwardSigterm = () => {
      child.kill("SIGTERM");
    };

    process.on("SIGINT", forwardSigint);
    process.on("SIGTERM", forwardSigterm);

    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      cleanup();

      if (signal !== null) {
        process.kill(process.pid, signal);
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Elemental watch exited with code ${code ?? 1}.`));
    });

    function cleanup() {
      process.off("SIGINT", forwardSigint);
      process.off("SIGTERM", forwardSigterm);
    }
  });
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
