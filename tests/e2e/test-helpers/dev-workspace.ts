import { spawn, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import type { Readable } from "node:stream";
import type { Page } from "@playwright/test";

type DevChildProcess = ChildProcessByStdio<null, Readable, Readable>;

export async function startDevWorkspace(options: {
  fixtureAppDir: string;
  rootDir: string;
}): Promise<{
  childProcess: DevChildProcess;
  cleanup: () => Promise<void>;
  url: string;
  workspaceDir: string;
}> {
  const workspaceDir = await mkdtemp(path.join(options.rootDir, ".tmp-phase12-dev-"));
  const port = await findAvailablePort();

  await cp(options.fixtureAppDir, path.join(workspaceDir, "src"), {
    recursive: true,
  });

  const childProcess = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      path.join(options.rootDir, "src/cli/index.ts"),
      "dev",
      "--port",
      String(port),
    ],
    {
      cwd: workspaceDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";

  childProcess.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  childProcess.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  await waitForDevServerReady(childProcess, port, () => output);

  return {
    childProcess,
    cleanup: async () => {
      if (childProcess.exitCode === null && !childProcess.killed) {
        childProcess.kill("SIGTERM");
        await once(childProcess, "exit").catch(() => {});
      }

      await rm(workspaceDir, {
        force: true,
        recursive: true,
      });
    },
    url: `http://127.0.0.1:${port}`,
    workspaceDir,
  };
}

export async function replaceInFile(
  filePath: string,
  oldText: string,
  newText: string,
): Promise<void> {
  const sourceText = await readFile(filePath, "utf8");

  if (!sourceText.includes(oldText)) {
    throw new Error(`Could not find expected text in ${filePath}`);
  }

  await writeFile(filePath, sourceText.replace(oldText, newText), "utf8");
}

export async function waitForDevClientReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.documentElement.getAttribute("data-elemental") === "ready" &&
      document.querySelector('script[data-elemental-dev-client="true"]') !== null,
    undefined,
    {
      timeout: 30_000,
    },
  );
}

async function waitForDevServerReady(
  childProcess: DevChildProcess,
  port: number,
  getOutput: () => string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for Elemental dev server on port ${String(port)}.`));
    }, 30_000);
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(
        new Error(
          `Elemental dev server exited before becoming ready (${signal ?? code ?? 1}).\n${getOutput()}`,
        ),
      );
    };
    const checkOutput = () => {
      if (!getOutput().includes(`Elemental dev listening on http://127.0.0.1:${String(port)}`)) {
        return;
      }

      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timeout);
      childProcess.off("exit", onExit);
      childProcess.stdout.off("data", checkOutput);
      childProcess.stderr.off("data", checkOutput);
    };

    childProcess.once("exit", onExit);
    childProcess.stdout.on("data", checkOutput);
    childProcess.stderr.on("data", checkOutput);
    checkOutput();
  });
}

async function findAvailablePort(): Promise<number> {
  const probe = createServer();

  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => resolve());
  });

  const address = probe.address();

  if (address === null || typeof address === "string") {
    probe.close();
    throw new Error("Could not allocate a dev server port.");
  }

  const { port } = address;

  await new Promise<void>((resolve, reject) => {
    probe.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return port;
}
