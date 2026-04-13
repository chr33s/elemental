import { spawn, type ChildProcess } from "node:child_process";
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { buildProject } from "../build/index.ts";
import type { BuildManifest } from "../build/manifest.ts";

const DEV_EVENTS_PATH = "/__elemental/dev/events";
const DEV_CLIENT_SENTINEL = "data-elemental-dev-client";

export type DevUpdateStrategy = "css" | "reload" | "route";

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

interface DevSseMessage {
  type: DevUpdateStrategy;
}

export function injectDevClientScript(documentMarkup: string, devClientHref: string): string {
  if (documentMarkup.includes(DEV_CLIENT_SENTINEL)) {
    return documentMarkup;
  }

  const scriptTag = `<script ${DEV_CLIENT_SENTINEL}="true" type="module" src="${devClientHref}"></script>`;

  if (documentMarkup.includes("</head>")) {
    return documentMarkup.replace("</head>", `${scriptTag}</head>`);
  }

  if (documentMarkup.includes("<body")) {
    return documentMarkup.replace(/<body([^>]*)>/u, `<body$1>${scriptTag}`);
  }

  return `${scriptTag}${documentMarkup}`;
}

export function hasRouteGraphChanged(
  previousManifest: BuildManifest,
  nextManifest: BuildManifest,
): boolean {
  return (
    JSON.stringify(summarizeManifest(previousManifest)) !==
    JSON.stringify(summarizeManifest(nextManifest))
  );
}

export async function classifyDevUpdate(options: {
  appDir: string;
  changedFiles: string[];
  nextManifest: BuildManifest;
  previousManifest: BuildManifest;
  readTextFile?: (filePath: string) => Promise<string>;
}): Promise<DevUpdateStrategy> {
  if (
    options.changedFiles.length === 0 ||
    hasRouteGraphChanged(options.previousManifest, options.nextManifest)
  ) {
    return "reload";
  }

  let sawLayoutCss = false;
  const readTextFile = options.readTextFile ?? ((filePath: string) => readFile(filePath, "utf8"));

  for (const changedFile of options.changedFiles) {
    if (changedFile === "__unknown__") {
      return "reload";
    }

    const absolutePath = path.resolve(changedFile);
    const relativePath = path.relative(options.appDir, absolutePath);
    const fileName = path.basename(absolutePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return "reload";
    }

    if (fileName === "layout.css") {
      sawLayoutCss = true;
      continue;
    }

    if (absolutePath.endsWith(".server.ts") || absolutePath.endsWith(".server.tsx")) {
      return "reload";
    }

    if (absolutePath.endsWith(".css")) {
      return "reload";
    }

    if (!/\.[cm]?[jt]sx?$/u.test(absolutePath)) {
      return "reload";
    }

    const sourceText = await readTextFile(absolutePath).catch(() => "");

    if (looksLikeCustomElementModule(sourceText)) {
      return "reload";
    }
  }

  return sawLayoutCss ? "css" : "route";
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
      broadcast({ type: updateType });
      console.log(`Elemental dev update applied (${updateType})`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }

  function broadcast(message: DevSseMessage): void {
    const payload = `data: ${JSON.stringify(message)}\n\n`;

    for (const client of sseClients) {
      client.write(payload);
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

async function startChildProcess(options: {
  childPort: number;
  serverFile: string;
}): Promise<ChildProcess> {
  const child = spawn(process.execPath, [options.serverFile], {
    cwd: path.dirname(options.serverFile),
    env: {
      ...process.env,
      PORT: String(options.childPort),
    },
    stdio: ["inherit", "pipe", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    const handleStdout = (chunk: Buffer) => {
      const text = chunk.toString();

      process.stdout.write(text);

      if (text.includes("Elemental server listening on")) {
        cleanup();
        resolve();
      }
    };
    const handleStderr = (chunk: Buffer) => {
      process.stderr.write(chunk);
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(new Error(`Elemental dev server exited before startup (${signal ?? code ?? 1}).`));
    };
    const cleanup = () => {
      child.stdout?.off("data", handleStdout);
      child.stderr?.off("data", handleStderr);
      child.off("error", handleError);
      child.off("exit", handleExit);
    };

    child.stdout?.on("data", handleStdout);
    child.stderr?.on("data", handleStderr);
    child.once("error", handleError);
    child.once("exit", handleExit);
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
  });

  return child;
}

async function stopChildProcess(childProcess: ChildProcess): Promise<void> {
  if (childProcess.killed || childProcess.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    childProcess.once("exit", () => resolve());
    childProcess.kill("SIGTERM");
  });
}

async function handleProxyRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: {
    childPort: number;
    devClientHref: string;
    sseClients: Set<ServerResponse>;
  },
): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

  if (requestUrl.pathname === DEV_EVENTS_PATH) {
    response.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream",
    });
    response.write("retry: 500\n\n");
    options.sseClients.add(response);
    request.once("close", () => {
      options.sseClients.delete(response);
      response.end();
    });
    return;
  }

  const proxiedResponse = await proxyToChild(request, options.childPort);

  response.statusCode = proxiedResponse.status;

  for (const [headerName, headerValue] of proxiedResponse.headers) {
    if (headerName.toLowerCase() === "content-length") {
      continue;
    }

    response.setHeader(headerName, headerValue);
  }

  if ((request.method ?? "GET") === "HEAD" || proxiedResponse.body === null) {
    response.end();
    return;
  }

  if (proxiedResponse.headers.get("content-type")?.includes("text/html") === true) {
    const documentMarkup = await proxiedResponse.text();

    response.end(injectDevClientScript(documentMarkup, options.devClientHref));
    return;
  }

  response.end(Buffer.from(await proxiedResponse.arrayBuffer()));
}

async function proxyToChild(request: IncomingMessage, childPort: number): Promise<Response> {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${childPort}`);
  const headers = new Headers();

  for (const [headerName, headerValue] of Object.entries(request.headers)) {
    if (headerValue === undefined) {
      continue;
    }

    headers.set(headerName, Array.isArray(headerValue) ? headerValue.join(", ") : headerValue);
  }

  const method = request.method ?? "GET";

  return fetch(url, {
    body:
      method === "GET" || method === "HEAD"
        ? undefined
        : (Readable.toWeb(request) as ReadableStream),
    duplex: method === "GET" || method === "HEAD" ? undefined : "half",
    headers,
    method,
  } as RequestInit & {
    duplex?: "half";
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
    throw new Error("Could not allocate a child dev server port.");
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

function summarizeManifest(manifest: BuildManifest) {
  return manifest.routes.map((route) => ({
    errorBoundaries: route.errorBoundaries,
    layoutStylesheets: route.layoutStylesheets,
    layouts: route.layouts,
    pattern: route.pattern,
    serverErrorBoundaries: route.serverErrorBoundaries,
    serverSource: route.serverSource,
    source: route.source,
  }));
}

function looksLikeCustomElementModule(sourceText: string): boolean {
  return /extends\s+HTMLElement\b|static\s+tagName\s*=|customElements\.define\s*\(/u.test(
    sourceText,
  );
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
