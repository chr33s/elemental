import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { buildProject } from "./src/build/index.ts";
import type { BuildManifest } from "./src/build/manifest.ts";
import { handleElementalRequest } from "./src/runtime/server/app.ts";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const appDir = path.join(rootDir, "spec/fixtures/basic-app/src");

async function main(): Promise<void> {
  const buildRuns: number[] = [];
  let benchWorkspaceDir = "";

  try {
    for (let index = 0; index < 3; index += 1) {
      const outDir = await mkdtemp(path.join(rootDir, ".tmp-bench-build-"));
      const startedAt = performance.now();

      await buildProject({
        appDir,
        outDir,
        rootDir,
      });

      buildRuns.push(performance.now() - startedAt);
      await rm(outDir, { force: true, recursive: true });
    }

    benchWorkspaceDir = await mkdtemp(path.join(rootDir, ".tmp-bench-runtime-"));

    const buildResult = await buildProject({
      appDir,
      outDir: benchWorkspaceDir,
      rootDir,
    });
    const manifest = JSON.parse(await readFile(buildResult.manifestPath, "utf8")) as BuildManifest;
    const documentRuns = await benchmarkRequestPath({
      distDir: buildResult.outDir,
      headers: {},
      iterations: 20,
      manifest,
      url: "http://example.com/guides/runtime-ssr",
      warmups: 5,
    });
    const routerPayloadRuns = await benchmarkRequestPath({
      distDir: buildResult.outDir,
      headers: {
        "X-Elemental-Router": "true",
      },
      iterations: 20,
      manifest,
      url: "http://example.com/guides/router-payloads",
      warmups: 5,
    });

    printSection("Build Benchmark", [formatStatsRow("Full build", buildRuns)]);
    printSection("Runtime Benchmark", [
      formatStatsRow("SSR document", documentRuns),
      formatStatsRow("Router payload", routerPayloadRuns),
    ]);
  } finally {
    if (benchWorkspaceDir.length > 0) {
      await rm(benchWorkspaceDir, { force: true, recursive: true });
    }
  }
}

async function benchmarkRequestPath(options: {
  distDir: string;
  headers: Record<string, string>;
  iterations: number;
  manifest: BuildManifest;
  url: string;
  warmups: number;
}): Promise<number[]> {
  const requestInit = {
    headers: options.headers,
    method: "GET",
  } satisfies RequestInit;

  for (let index = 0; index < options.warmups; index += 1) {
    const response = await handleElementalRequest(new Request(options.url, requestInit), {
      distDir: options.distDir,
      manifest: options.manifest,
    });

    if (!response.ok) {
      throw new Error(`Warmup request failed for ${options.url}: ${response.status}`);
    }

    await response.text();
  }

  const samples: number[] = [];

  for (let index = 0; index < options.iterations; index += 1) {
    const startedAt = performance.now();
    const response = await handleElementalRequest(new Request(options.url, requestInit), {
      distDir: options.distDir,
      manifest: options.manifest,
    });
    const elapsed = performance.now() - startedAt;

    if (!response.ok) {
      throw new Error(`Benchmark request failed for ${options.url}: ${response.status}`);
    }

    await response.text();
    samples.push(elapsed);
  }

  return samples;
}

function formatStatsRow(label: string, samples: number[]): string {
  const sortedSamples = [...samples].sort((left, right) => left - right);
  const average = samples.reduce((total, sample) => total + sample, 0) / samples.length;
  const p95Index = Math.min(sortedSamples.length - 1, Math.ceil(sortedSamples.length * 0.95) - 1);

  return `${label.padEnd(16)} avg ${formatMilliseconds(average)}  min ${formatMilliseconds(sortedSamples[0] ?? 0)}  p95 ${formatMilliseconds(sortedSamples[p95Index] ?? 0)}`;
}

function formatMilliseconds(value: number): string {
  return `${value.toFixed(1).padStart(6)} ms`;
}

function printSection(title: string, rows: string[]): void {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));

  for (const row of rows) {
    console.log(row);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
