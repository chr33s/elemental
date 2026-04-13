import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import type { BuildManifest } from "../../build/manifest.ts";
import {
  handleElementalRequestWithRuntime,
  type RouterPayload,
  type ServerRuntimeAdapter,
} from "./core.ts";

export interface StartServerOptions {
  distDir: string;
  manifest: BuildManifest;
  port?: number;
}

export type { RouterPayload };

export function startServer(options: StartServerOptions): Server {
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const handleRequest = createNodeRequestHandler(options);
  const server = createServer((request, response) => {
    void handleNodeRequest(request, response, handleRequest);
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

  return async function handleRequest(request: Request): Promise<Response> {
    return handleElementalRequestWithRuntime(request, {
      manifest: options.manifest,
      runtime,
    });
  };
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
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1:3000"}`);
    const requestObject = createWebRequest(request, url);
    const renderedResponse = await handleRequest(requestObject);

    await sendNodeResponse(response, renderedResponse, request.method ?? "GET");
  } catch (error) {
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
    return new Response("Forbidden", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
      status: 403,
    });
  }

  try {
    const fileContents = await readFile(filePath);
    return new Response(fileContents, {
      headers: {
        "content-type": contentTypeForPath(filePath),
      },
      status: 200,
    });
  } catch {
    return new Response("Asset not found", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
      status: 404,
    });
  }
}

function createServerModuleResolver(distDir: string) {
  const baseUrl = toDirectoryUrl(distDir);

  return async function resolveServerModule<TModule>(modulePath: string): Promise<TModule> {
    const resolvedUrl = new URL(modulePath, baseUrl);

    return (await import(resolvedUrl.href)) as TModule;
  };
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

function toDirectoryUrl(filePath: string): string {
  const href = pathToFileURL(filePath).href;

  return href.endsWith("/") ? href : `${href}/`;
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
