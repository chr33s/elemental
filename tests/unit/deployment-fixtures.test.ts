import { execFile } from "node:child_process";
import { access, cp, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const rootDir = fileURLToPath(new URL("../../", import.meta.url));
const temporaryPaths = new Set<string>();
const execFileAsync = promisify(execFile);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

afterEach(async () => {
  await Promise.all(
    [...temporaryPaths].map((temporaryPath) =>
      rm(temporaryPath, {
        force: true,
        recursive: true,
      }),
    ),
  );

  temporaryPaths.clear();
});

describe("deployment fixtures", () => {
  it("builds and smokes the deploy-srvx wrapper against the canonical app", async () => {
    const workspaceDir = await createFixtureWorkspace();
    const fixtureDir = path.join(workspaceDir, "spec", "fixtures", "deploy-srvx");
    const { stdout } = await execFileAsync(npmCommand, ["run", "smoke"], {
      cwd: fixtureDir,
    });
    const manifest = JSON.parse(
      await readFile(path.join(fixtureDir, "dist", "manifest.json"), "utf8"),
    ) as {
      appDir: string;
    };

    expect(stdout).toContain("Built ");
    expect(stdout).toContain("srvx fixture smoke ok");
    expect(await pathExists(path.join(fixtureDir, "dist", "server.js"))).toBe(true);
    expect(await pathExists(path.join(fixtureDir, "dist", "srvx.js"))).toBe(true);
    expect(await pathExists(path.join(fixtureDir, "dist", "worker.js"))).toBe(false);
    expect(manifest.appDir).toBe("spec/fixtures/basic-app/src");
  });

  it("builds and smokes the deploy-wrangler wrapper against the canonical app", async () => {
    const workspaceDir = await createFixtureWorkspace();
    const fixtureDir = path.join(workspaceDir, "spec", "fixtures", "deploy-wrangler");
    const { stdout } = await execFileAsync(npmCommand, ["run", "smoke"], {
      cwd: fixtureDir,
    });
    const { stdout: previewStdout } = await execFileAsync(
      process.execPath,
      ["--experimental-strip-types", "preview-wrangler.ts"],
      {
        cwd: fixtureDir,
      },
    );
    const manifest = JSON.parse(
      await readFile(path.join(fixtureDir, "dist", "manifest.json"), "utf8"),
    ) as {
      appDir: string;
    };
    const wranglerConfig = await readFile(path.join(fixtureDir, "dist", "wrangler.jsonc"), "utf8");
    const previewWranglerConfig = await readFile(path.join(fixtureDir, "wrangler.jsonc"), "utf8");

    expect(stdout).toContain("Built ");
    expect(stdout).toContain("worker fixture smoke ok");
    expect(previewStdout).toContain("Wrote wrangler.jsonc");
    expect(await pathExists(path.join(fixtureDir, "dist", "server.js"))).toBe(true);
    expect(await pathExists(path.join(fixtureDir, "dist", "worker.js"))).toBe(true);
    expect(await pathExists(path.join(fixtureDir, "dist", "wrangler.jsonc"))).toBe(true);
    expect(await pathExists(path.join(fixtureDir, "dist", "srvx.js"))).toBe(false);
    expect(manifest.appDir).toBe("spec/fixtures/basic-app/src");
    expect(wranglerConfig).toContain('"main": "./worker.js"');
    expect(wranglerConfig).toContain('"directory": "."');
    expect(wranglerConfig).toContain('"binding": "ASSETS"');
    expect(previewWranglerConfig).toContain('"main": "./dist/worker.js"');
    expect(previewWranglerConfig).toContain('"directory": "./dist"');
  });
});

async function createFixtureWorkspace(): Promise<string> {
  const workspaceDir = await mkdtemp(path.join(rootDir, ".tmp-deployment-fixtures-"));

  temporaryPaths.add(workspaceDir);

  await Promise.all([
    cp(path.join(rootDir, "package.json"), path.join(workspaceDir, "package.json")),
    cp(path.join(rootDir, "src"), path.join(workspaceDir, "src"), { recursive: true }),
    cp(
      path.join(rootDir, "spec", "fixtures", "basic-app", "src"),
      path.join(workspaceDir, "spec", "fixtures", "basic-app", "src"),
      { recursive: true },
    ),
    cp(
      path.join(rootDir, "spec", "fixtures", "deploy-srvx"),
      path.join(workspaceDir, "spec", "fixtures", "deploy-srvx"),
      { recursive: true },
    ),
    cp(
      path.join(rootDir, "spec", "fixtures", "deploy-wrangler"),
      path.join(workspaceDir, "spec", "fixtures", "deploy-wrangler"),
      { recursive: true },
    ),
  ]);

  return workspaceDir;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
