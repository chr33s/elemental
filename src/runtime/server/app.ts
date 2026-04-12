import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import type { RouteRenderer } from "../shared/types.ts";
import { renderDocument } from "./render-document.ts";

export interface StartServerOptions {
  clientAssetHref?: string;
  distDir: string;
  port?: number;
  renderRoute: RouteRenderer;
}

export function startServer(options: StartServerOptions): Server {
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const server = createServer((request, response) => {
    void handleRequest(request, response, options);
  });

  server.listen(port, () => {
    console.log(`Elemental server listening on http://127.0.0.1:${port}`);
  });

  return server;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: StartServerOptions,
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1:3000"}`);

    if (url.pathname.startsWith("/assets/")) {
      await serveAsset(url.pathname, response, options.distDir);
      return;
    }

    if (url.pathname !== "/") {
      response.statusCode = 404;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end("Not found");
      return;
    }

    const body = await options.renderRoute({
      params: {},
      url,
    });

    response.statusCode = 200;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      renderDocument({
        body,
        clientAssetHref: options.clientAssetHref,
      }),
    );
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end(error instanceof Error ? error.message : "Unexpected server error");
  }
}

async function serveAsset(
  assetPathname: string,
  response: ServerResponse,
  distDir: string,
): Promise<void> {
  const relativePath = assetPathname.replace(/^\//, "");
  const filePath = path.join(distDir, relativePath);
  const normalizedRelativePath = path.relative(distDir, filePath);

  if (normalizedRelativePath.startsWith("..") || path.isAbsolute(normalizedRelativePath)) {
    response.statusCode = 403;
    response.end("Forbidden");
    return;
  }

  try {
    const fileContents = await readFile(filePath);
    response.statusCode = 200;
    response.setHeader("content-type", contentTypeForPath(filePath));
    response.end(fileContents);
  } catch {
    response.statusCode = 404;
    response.end("Asset not found");
  }
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
