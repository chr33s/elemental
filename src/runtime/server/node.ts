import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import type { BuildManifest } from "../../build/manifest.ts";
import { createRequestHandler, type RouterPayload, type ServerRuntimeAdapter } from "./core.ts";

export interface StartServerOptions {
  allowedHosts?: string[];
  canonicalOrigin?: string;
  distDir: string;
  manifest: BuildManifest;
  port?: number;
}

interface NodeRequestSecurityOptions {
  allowedHosts?: string[];
  canonicalOrigin?: string;
}

export type { RouterPayload };

export function startServer(options: StartServerOptions): Server {
  const allowedHosts = options.allowedHosts ?? readAllowedHostsFromEnvironment();
  const canonicalOrigin = options.canonicalOrigin ?? process.env.ELEMENTAL_CANONICAL_ORIGIN;
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const handleRequest = createNodeRequestHandler(options);
  const server = createServer((request, response) => {
    void handleNodeRequest(request, response, handleRequest, {
      allowedHosts,
      canonicalOrigin,
    });
  });

  server.listen(port, () => {
    console.log(`Elemental server listening on http://127.0.0.1:${port}`);
  });

  return server;
}

export function createNodeRequestHandler(
  options: Omit<StartServerOptions, "port">,
): (request: Request) => Promise<Response> {
  const runtime = createNodeRuntime(options.distDir);

  return createRequestHandler({
    manifest: options.manifest,
    runtime,
  });
}

export async function handleElementalRequest(
  request: Request,
  options: Omit<StartServerOptions, "port">,
): Promise<Response> {
  return createNodeRequestHandler(options)(request);
}

export function createSrvxHandler(options: Omit<StartServerOptions, "port">): {
  fetch: (request: Request) => Promise<Response>;
} {
  const handleRequest = createNodeRequestHandler(options);

  return {
    fetch(request: Request) {
      return handleRequest(request);
    },
  };
}

export function createNodeRuntime(distDir: string): ServerRuntimeAdapter {
  return {
    reportError(error) {
      console.error(error);
    },
    resolveServerModule: createServerModuleResolver(distDir),
    serveAsset: serveAssetFromFileSystem.bind(null, distDir),
  };
}

async function handleNodeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  handleRequest: (request: Request) => Promise<Response>,
  options: NodeRequestSecurityOptions,
): Promise<void> {
  try {
    const url = createNodeRequestUrl(request, options);
    const requestObject = createWebRequest(request, url);
    const renderedResponse = await handleRequest(requestObject);

    await sendNodeResponse(response, renderedResponse, request.method ?? "GET");
  } catch (error) {
    if (error instanceof InvalidHostHeaderError) {
      response.statusCode = 400;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end("Invalid Host header");
      return;
    }

    console.error(error);
    response.statusCode = 500;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end("500 Internal Server Error");
  }
}

async function serveAssetFromFileSystem(
  distDir: string,
  _request: Request,
  assetPathname: string,
): Promise<Response> {
  const relativePath = assetPathname.replace(/^\//, "");
  const filePath = path.join(distDir, relativePath);
  const normalizedRelativePath = path.relative(distDir, filePath);

  if (normalizedRelativePath.startsWith("..") || path.isAbsolute(normalizedRelativePath)) {
    return createAssetTextResponse("Forbidden", 403);
  }

  try {
    const fileContents = await readFile(filePath);
    return new Response(fileContents, {
      headers: {
        "content-type": contentTypeForPath(filePath),
        "x-content-type-options": "nosniff",
      },
      status: 200,
    });
  } catch {
    return createAssetTextResponse("Asset not found", 404);
  }
}

class InvalidHostHeaderError extends Error {
  constructor() {
    super("Invalid Host header");
  }
}

class InvalidServerModulePathError extends Error {
  constructor(modulePath: string) {
    super(`Invalid server module path ${JSON.stringify(modulePath)}`);
  }
}

function createNodeRequestUrl(request: IncomingMessage, options: NodeRequestSecurityOptions): URL {
  const host = normalizeHostHeaderValue(request.headers.host);

  if (options.allowedHosts !== undefined && !isAllowedHost(host, options.allowedHosts)) {
    throw new InvalidHostHeaderError();
  }

  const baseOrigin = options.canonicalOrigin ?? `http://${host ?? "127.0.0.1:3000"}`;

  return new URL(request.url ?? "/", normalizeOrigin(baseOrigin));
}

function createAssetTextResponse(body: string, status: number): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
    status,
  });
}

function isAllowedHost(host: string | undefined, allowedHosts: string[]): boolean {
  if (host === undefined) {
    return false;
  }

  const parsedHost = new URL(`http://${host}`);

  return allowedHosts.some((allowedHost) => {
    const normalizedAllowedHost = normalizeAllowedHost(allowedHost);

    return (
      normalizedAllowedHost === parsedHost.host.toLowerCase() ||
      normalizedAllowedHost === parsedHost.hostname.toLowerCase()
    );
  });
}

function normalizeAllowedHost(host: string): string {
  const normalized = normalizeHostHeaderValue(host);

  if (normalized === undefined) {
    throw new Error(`Invalid allowed host ${JSON.stringify(host)}`);
  }

  return normalized;
}

function normalizeHostHeaderValue(hostHeader: string | string[] | undefined): string | undefined {
  const rawHost = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;

  if (rawHost === undefined) {
    return undefined;
  }

  const trimmedHost = rawHost.trim();

  if (trimmedHost.length === 0 || /[/?#@]/u.test(trimmedHost)) {
    throw new InvalidHostHeaderError();
  }

  try {
    return new URL(`http://${trimmedHost}`).host.toLowerCase();
  } catch {
    throw new InvalidHostHeaderError();
  }
}

function normalizeOrigin(origin: string): string {
  const parsedOrigin = new URL(origin);

  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
    throw new Error(`Canonical origin must use http or https: ${origin}`);
  }

  return parsedOrigin.origin;
}

function readAllowedHostsFromEnvironment(): string[] | undefined {
  const value = process.env.ELEMENTAL_ALLOWED_HOSTS?.trim();

  if (value === undefined || value.length === 0) {
    return undefined;
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function createServerModuleResolver(distDir: string) {
  const normalizedDistDir = path.resolve(distDir);
  const serverRootDir = path.resolve(normalizedDistDir, "server");

  return async function resolveServerModule<TModule>(modulePath: string): Promise<TModule> {
    const resolvedPath = resolveServerModulePath(normalizedDistDir, serverRootDir, modulePath);

    return (await import(pathToFileURL(resolvedPath).href)) as TModule;
  };
}

function resolveServerModulePath(
  distDir: string,
  serverRootDir: string,
  modulePath: string,
): string {
  if (
    modulePath.length === 0 ||
    path.isAbsolute(modulePath) ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/u.test(modulePath)
  ) {
    throw new InvalidServerModulePathError(modulePath);
  }

  const resolvedPath = path.resolve(distDir, modulePath);

  if (!isPathInsideDirectory(resolvedPath, serverRootDir)) {
    throw new InvalidServerModulePathError(modulePath);
  }

  return resolvedPath;
}

function isPathInsideDirectory(candidatePath: string, directoryPath: string): boolean {
  const relativePath = path.relative(directoryPath, candidatePath);

  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function createWebRequest(request: IncomingMessage, url: URL): Request {
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }

    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }

  const method = request.method ?? "GET";

  if (method === "GET" || method === "HEAD") {
    return new Request(url, {
      headers,
      method,
    });
  }

  return new Request(url, {
    body: Readable.toWeb(request) as ReadableStream,
    duplex: "half",
    headers,
    method,
  } as RequestInit & {
    duplex: "half";
  });
}

async function sendNodeResponse(
  nodeResponse: ServerResponse,
  response: Response,
  method: string,
): Promise<void> {
  nodeResponse.statusCode = response.status;

  for (const [name, value] of response.headers) {
    nodeResponse.setHeader(name, value);
  }

  if (method === "HEAD" || response.body === null) {
    nodeResponse.end();
    return;
  }

  nodeResponse.end(Buffer.from(await response.arrayBuffer()));
}

function contentTypeForPath(filePath: string): string {
  const extension = path.extname(filePath);

  if (extension === ".js") {
    return "text/javascript; charset=utf-8";
  }

  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }

  if (extension === ".json") {
    return "application/json; charset=utf-8";
  }

  return "application/octet-stream";
}
