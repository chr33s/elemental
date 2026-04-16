import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";
import { buildProject } from "../build/index.ts";
import type { BuildManifest } from "../build/manifest.ts";
import { toPosixPath } from "../shared/path-utils.ts";
import { classifyDevUpdate } from "./classify.ts";
import { findAvailablePort } from "./ports.ts";
import { startChildProcess, stopChildProcess } from "./process.ts";
import { broadcastDevMessage, handleProxyRequest } from "./proxy.ts";

export { classifyDevUpdate, hasRouteGraphChanged, injectDevClientScript } from "./classify.ts";

export interface StartDevServerOptions {
  appDir: string;
  outDir: string;
  port?: number;
  rootDir: string;
}

interface DevBuildState {
  childPort: number;
  devClientHref: string;
  manifest: BuildManifest;
  serverFile: string;
}

export async function startDevServer(options: StartDevServerOptions): Promise<void> {
  const appDir = path.resolve(options.appDir);
  const outDir = path.resolve(options.outDir);
  const rootDir = path.resolve(options.rootDir);
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const childPort = await findAvailablePort();
  const sseClients = new Set<ServerResponse>();
  const watchedPaths = [appDir, path.join(rootDir, "src")];
  let currentState = await buildArtifacts({ appDir, childPort, outDir, rootDir });
  let childProcess = await startChildProcess({
    childPort,
    serverFile: currentState.serverFile,
  });
  let rebuildScheduled = false;
  let pendingChangedFiles = new Set<string>();
  let closed = false;

  const heartbeat = setInterval(() => {
    for (const client of sseClients) {
      client.write(": keep-alive\n\n");
    }
  }, 20_000);
  const proxyServer = createServer((request, response) => {
    void handleProxyRequest(request, response, {
      childPort,
      devClientHref: currentState.devClientHref,
      sseClients,
    }).catch((error) => {
      console.error(error);

      if (!response.headersSent) {
        response.writeHead(503, {
          "content-type": "text/plain; charset=utf-8",
        });
      }

      response.end("503 Service Unavailable");
    });
  });
  const watchers = watchedPaths.map((watchPath) =>
    watch(
      watchPath,
      {
        persistent: true,
        recursive: true,
      },
      (_eventType, fileName) => {
        pendingChangedFiles.add(
          fileName === null ? "__unknown__" : path.resolve(watchPath, String(fileName)),
        );
        scheduleRebuild();
      },
    ),
  );

  await new Promise<void>((resolve, reject) => {
    proxyServer.once("error", reject);
    proxyServer.listen(port, () => {
      console.log(`Elemental dev listening on http://127.0.0.1:${port}`);
      resolve();
    });
  });

  process.once("SIGINT", () => {
    void handleShutdown();
  });
  process.once("SIGTERM", () => {
    void handleShutdown();
  });

  function scheduleRebuild(): void {
    if (rebuildScheduled || closed) {
      return;
    }

    rebuildScheduled = true;
    setTimeout(() => {
      void runScheduledRebuild();
    }, 60);
  }

  async function runScheduledRebuild(): Promise<void> {
    rebuildScheduled = false;
    const changedFiles = [...pendingChangedFiles];

    pendingChangedFiles = new Set<string>();

    try {
      const nextState = await buildArtifacts({ appDir, childPort, outDir, rootDir });
      const updateType = await classifyDevUpdate({
        appDir,
        changedFiles,
        nextManifest: nextState.manifest,
        previousManifest: currentState.manifest,
      });

      await stopChildProcess(childProcess);
      childProcess = await startChildProcess({
        childPort,
        serverFile: nextState.serverFile,
      });
      currentState = nextState;
      broadcastDevMessage(sseClients, { type: updateType });
      console.log(`Elemental dev update applied (${updateType})`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }

  async function handleShutdown(): Promise<void> {
    if (closed) {
      return;
    }

    closed = true;
    clearInterval(heartbeat);

    for (const watcher of watchers) {
      watcher.close();
    }

    for (const client of sseClients) {
      client.end();
    }

    proxyServer.close();
    await stopChildProcess(childProcess);
    process.exitCode = 0;
  }
}

async function buildArtifacts(options: {
  appDir: string;
  childPort: number;
  outDir: string;
  rootDir: string;
}): Promise<DevBuildState> {
  const result = await buildProject({
    appDir: options.appDir,
    includeDevClient: true,
    outDir: options.outDir,
    rootDir: options.rootDir,
    target: "node",
  });

  if (result.devClientFile === undefined) {
    throw new Error("Development client asset was not emitted.");
  }

  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as BuildManifest;

  return {
    childPort: options.childPort,
    devClientHref: `/${toPosixPath(path.relative(options.outDir, result.devClientFile))}`,
    manifest,
    serverFile: result.serverFile,
  };
}
