import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import type { BuildManifest, BuildManifestRoute } from "../../build/manifest.ts";
import {
  resolveNearestServerErrorBoundaryForPathname,
  resolveNearestServerErrorBoundaryForRoute,
} from "../shared/error-boundaries.ts";
import { html, type HtmlRenderable, type HtmlResult } from "../shared/html.ts";
import { matchManifestRoute } from "../shared/routes.ts";
import type {
  ErrorProps,
  LayoutProps,
  RouteParams,
  RouteProps,
  RouteServerContext,
} from "../shared/types.ts";
import { createManagedHead, renderDocument, renderSubtree } from "./render-document.ts";

export interface StartServerOptions {
  distDir: string;
  manifest: BuildManifest;
  port?: number;
}

export interface RouterPayload {
  assets: {
    scripts: string[];
    stylesheets: string[];
  };
  head: string;
  outlet: string;
  status: number;
}

interface CompiledLayoutModule {
  default?: (props: LayoutProps) => HtmlRenderable | Promise<HtmlRenderable>;
}

interface CompiledRouteModule {
  default?: (props: RouteProps) => HtmlRenderable | Promise<HtmlRenderable>;
  head?: (props: RouteProps) => HtmlRenderable | Promise<HtmlRenderable>;
}

interface CompiledRouteServerModule {
  action?: (context: RouteServerContext) => unknown;
  default?: (context: RouteServerContext) => Response | Promise<Response>;
  loader?: (context: RouteServerContext) => unknown;
}

interface CompiledServerErrorBoundaryModule {
  default?: (props: ErrorProps) => HtmlRenderable | Promise<HtmlRenderable>;
  head?: (props: ErrorProps) => HtmlRenderable | Promise<HtmlRenderable>;
}

const EMPTY_HTML = html``;
const EMPTY_ASSETS: RouterPayload["assets"] = {
  scripts: [],
  stylesheets: [],
};
const ROUTER_HEADER_NAME = "x-elemental-router";

export function startServer(options: StartServerOptions): Server {
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const server = createServer((request, response) => {
    void handleNodeRequest(request, response, options);
  });

  server.listen(port, () => {
    console.log(`Elemental server listening on http://127.0.0.1:${port}`);
  });

  return server;
}

export async function handleElementalRequest(
  request: Request,
  options: StartServerOptions,
): Promise<Response> {
  const url = new URL(request.url);
  const resolver = createServerModuleResolver(options.distDir);

  if (url.pathname === "/manifest.json") {
    return serveAsset(url.pathname, options.distDir);
  }

  if (url.pathname.startsWith("/assets/")) {
    return serveAsset(url.pathname, options.distDir);
  }

  const matchedRoute = matchManifestRoute(url.pathname, options.manifest.routes);

  if (matchedRoute === undefined) {
    return renderServerErrorResponse({
      error: null,
      manifest: options.manifest,
      request,
      resolver,
      status: 404,
      statusText: "Not Found",
    });
  }

  try {
    return await renderMatchedRoute({
      manifest: options.manifest,
      matchedRoute,
      request,
      resolver,
    });
  } catch (error) {
    console.error(error);

    return renderServerErrorResponse({
      error,
      manifest: options.manifest,
      matchedRoute,
      request,
      resolver,
      status: 500,
      statusText: "Internal Server Error",
    });
  }
}

async function handleNodeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: StartServerOptions,
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1:3000"}`);
    const requestObject = createWebRequest(request, url);
    const renderedResponse = await handleElementalRequest(requestObject, options);

    await sendNodeResponse(response, renderedResponse, request.method ?? "GET");
  } catch (error) {
    console.error(error);
    response.statusCode = 500;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end("500 Internal Server Error");
  }
}

async function renderMatchedRoute(options: {
  manifest: BuildManifest;
  matchedRoute: {
    params: RouteParams;
    route: BuildManifestRoute;
  };
  request: Request;
  resolver: <TModule>(modulePath: string) => Promise<TModule>;
}): Promise<Response> {
  const { manifest, matchedRoute, request, resolver } = options;
  const { params, route } = matchedRoute;
  const url = new URL(request.url);
  const routeServerContext: RouteServerContext = {
    params,
    request,
    url,
  };
  const routeModule = await resolver<CompiledRouteModule>(route.server.route);
  const routeServerModule = route.server.routeServer
    ? await resolver<CompiledRouteServerModule>(route.server.routeServer)
    : undefined;

  if (typeof routeServerModule?.default === "function") {
    const response = await routeServerModule.default(routeServerContext);

    if (!(response instanceof Response)) {
      throw new TypeError(
        `Route server default export for ${route.pattern} must return a Response.`,
      );
    }

    return response;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    if (typeof routeServerModule?.action !== "function") {
      return new Response("Method Not Allowed", {
        headers: {
          allow: "GET, HEAD",
          "content-type": "text/plain; charset=utf-8",
        },
        status: 405,
      });
    }

    const actionResult = await routeServerModule.action(routeServerContext);

    if (actionResult instanceof Response) {
      return actionResult;
    }

    return textResponse(
      "Action handlers must return a Response until non-Response mutation semantics are specified.",
      501,
    );
  }

  const loaderResult =
    typeof routeServerModule?.loader === "function"
      ? await routeServerModule.loader(routeServerContext)
      : undefined;

  if (loaderResult instanceof Response) {
    return loaderResult;
  }

  if (typeof routeModule.default !== "function") {
    throw new TypeError(`Route module for ${route.pattern} must export a default render function.`);
  }

  const routeProps: RouteProps = {
    data: normalizeRouteData(loaderResult),
    params,
    url,
  };
  const routeHead =
    typeof routeModule.head === "function" ? await routeModule.head(routeProps) : EMPTY_HTML;
  const routeBody = await routeModule.default(routeProps);
  const assets = createResolvedAssets(manifest, route);

  if (isRouterRequest(request)) {
    const outlet = await composeLayouts({
      head: EMPTY_HTML,
      outlet: routeBody,
      params,
      resolver,
      url,
      layoutModulePaths: route.server.layouts.slice(1),
    });

    return Response.json({
      assets,
      head: renderSubtree(routeHead),
      outlet: renderSubtree(outlet),
      status: 200,
    } satisfies RouterPayload);
  }

  if (route.server.layouts.length === 0) {
    return htmlResponse(
      renderDocument({
        body: routeBody,
        head: routeHead,
        scripts: assets.scripts,
        stylesheets: assets.stylesheets,
      }),
    );
  }

  const document = await composeLayouts({
    head: composeAssetHead(routeHead, assets),
    outlet: routeBody,
    params,
    resolver,
    url,
    layoutModulePaths: route.server.layouts,
  });

  return htmlResponse(renderSubtree(document));
}

async function renderServerErrorResponse(options: {
  error: unknown;
  manifest: BuildManifest;
  matchedRoute?: {
    params: RouteParams;
    route: BuildManifestRoute;
  };
  request: Request;
  resolver: <TModule>(modulePath: string) => Promise<TModule>;
  status: number;
  statusText: string;
}): Promise<Response> {
  const url = new URL(options.request.url);
  const resolvedBoundary =
    options.matchedRoute === undefined
      ? resolveNearestServerErrorBoundaryForPathname(options.manifest, url.pathname)
      : resolveNearestServerErrorBoundaryForRoute(
          options.matchedRoute.route,
          options.matchedRoute.params,
        );

  if (resolvedBoundary === undefined) {
    return textResponse(`${options.status} ${options.statusText}`, options.status);
  }

  try {
    const boundaryModule = await options.resolver<CompiledServerErrorBoundaryModule>(
      resolvedBoundary.modulePath,
    );

    if (typeof boundaryModule.default !== "function") {
      throw new TypeError(
        `Server error boundary ${resolvedBoundary.sourcePath} must export a default render function.`,
      );
    }

    const props: ErrorProps = {
      error: options.error,
      params: resolvedBoundary.params,
      request: options.request,
      status: options.status,
      statusText: options.statusText,
      url,
    };
    const head =
      typeof boundaryModule.head === "function" ? await boundaryModule.head(props) : EMPTY_HTML;
    const body = await boundaryModule.default(props);

    if (isRouterRequest(options.request)) {
      return Response.json(
        {
          assets: EMPTY_ASSETS,
          head: renderSubtree(head),
          outlet: renderSubtree(body),
          status: options.status,
        } satisfies RouterPayload,
        {
          status: options.status,
        },
      );
    }

    return new Response(
      renderDocument({
        body,
        head,
      }),
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
        status: options.status,
      },
    );
  } catch (error) {
    console.error(error);
    return textResponse("500 Internal Server Error", 500);
  }
}

async function serveAsset(assetPathname: string, distDir: string): Promise<Response> {
  const relativePath = assetPathname.replace(/^\//, "");
  const filePath = path.join(distDir, relativePath);
  const normalizedRelativePath = path.relative(distDir, filePath);

  if (normalizedRelativePath.startsWith("..") || path.isAbsolute(normalizedRelativePath)) {
    return textResponse("Forbidden", 403);
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
    return textResponse("Asset not found", 404);
  }
}

function createResolvedAssets(
  manifest: BuildManifest,
  route: BuildManifestRoute,
): RouterPayload["assets"] {
  const cssAssets = route.assets.css ?? route.assets.layoutCss ?? [];
  const jsAssets = route.assets.js ?? route.assets.scripts ?? [];

  return {
    scripts: [manifest.assets.clientEntry, ...jsAssets]
      .filter((entryPath): entryPath is string => entryPath !== undefined)
      .map((entryPath) => `/${entryPath}`),
    stylesheets: cssAssets.map((entryPath) => `/${entryPath}`),
  };
}

function composeAssetHead(routeHead: HtmlRenderable, assets: RouterPayload["assets"]): HtmlResult {
  return html`${createManagedHead({
    head: routeHead,
    scripts: assets.scripts,
    stylesheets: assets.stylesheets,
  })}`;
}

async function composeLayouts(options: {
  head: HtmlRenderable;
  layoutModulePaths: string[];
  outlet: HtmlRenderable;
  params: RouteParams;
  resolver: <TModule>(modulePath: string) => Promise<TModule>;
  url: URL;
}): Promise<HtmlRenderable> {
  let currentOutlet = options.outlet;
  const head = html`${options.head}`;

  for (let index = options.layoutModulePaths.length - 1; index >= 0; index -= 1) {
    const modulePath = options.layoutModulePaths[index];
    const layoutModule = await options.resolver<CompiledLayoutModule>(modulePath);

    if (typeof layoutModule.default !== "function") {
      throw new TypeError(`Layout module ${modulePath} must export a default render function.`);
    }

    currentOutlet = await layoutModule.default({
      head,
      outlet: html`${currentOutlet}`,
      params: options.params,
      url: options.url,
    });
  }

  return currentOutlet;
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

function normalizeRouteData(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("loader() must return a plain object or a Response.");
  }

  return value as Record<string, unknown>;
}

function isRouterRequest(request: Request): boolean {
  return request.headers.get(ROUTER_HEADER_NAME)?.toLowerCase() === "true";
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
    status: 200,
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
    status,
  });
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
