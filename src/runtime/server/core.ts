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

export interface RouterPayload {
  assets: {
    scripts: string[];
    stylesheets: string[];
  };
  head: string;
  outlet: string;
  status: number;
}

export interface ServerRuntimeAdapter {
  reportError?: (error: unknown) => void;
  resolveServerModule: <TModule>(modulePath: string) => Promise<TModule>;
  serveAsset: (request: Request, assetPathname: string) => Promise<Response>;
}

export interface ElementalRequestHandlerOptions {
  manifest: BuildManifest;
  runtime: ServerRuntimeAdapter;
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

export async function handleElementalRequestWithRuntime(
  request: Request,
  options: ElementalRequestHandlerOptions,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/manifest.json") {
    return new Response(`${JSON.stringify(options.manifest, null, 2)}\n`, {
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      status: 200,
    });
  }

  if (url.pathname.startsWith("/assets/")) {
    return options.runtime.serveAsset(request, url.pathname);
  }

  const matchedRoute = matchManifestRoute(url.pathname, options.manifest.routes);

  if (matchedRoute === undefined) {
    return renderServerErrorResponse({
      error: null,
      manifest: options.manifest,
      request,
      runtime: options.runtime,
      status: 404,
      statusText: "Not Found",
    });
  }

  try {
    return await renderMatchedRoute({
      manifest: options.manifest,
      matchedRoute,
      request,
      runtime: options.runtime,
    });
  } catch (error) {
    reportRuntimeError(options.runtime, error);

    return renderServerErrorResponse({
      error,
      manifest: options.manifest,
      matchedRoute,
      request,
      runtime: options.runtime,
      status: 500,
      statusText: "Internal Server Error",
    });
  }
}

export function createModuleRegistryResolver(modules: Record<string, unknown>) {
  return async function resolveServerModule<TModule>(modulePath: string): Promise<TModule> {
    const resolvedModule = modules[modulePath];

    if (resolvedModule === undefined) {
      throw new Error(`Missing server module for ${modulePath}`);
    }

    return resolvedModule as TModule;
  };
}

async function renderMatchedRoute(options: {
  manifest: BuildManifest;
  matchedRoute: {
    params: RouteParams;
    route: BuildManifestRoute;
  };
  request: Request;
  runtime: ServerRuntimeAdapter;
}): Promise<Response> {
  const { manifest, matchedRoute, request, runtime } = options;
  const { params, route } = matchedRoute;
  const url = new URL(request.url);
  const routeServerContext: RouteServerContext = {
    params,
    request,
    url,
  };
  const routeModule = await runtime.resolveServerModule<CompiledRouteModule>(route.server.route);
  const routeServerModule = route.server.routeServer
    ? await runtime.resolveServerModule<CompiledRouteServerModule>(route.server.routeServer)
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

    throw new TypeError(`Action handler for ${route.pattern} must return a Response in v0.`);
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
      layoutModulePaths: route.server.layouts.slice(1),
      outlet: routeBody,
      params,
      runtime,
      url,
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
    layoutModulePaths: route.server.layouts,
    outlet: routeBody,
    params,
    runtime,
    url,
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
  runtime: ServerRuntimeAdapter;
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
    const boundaryModule =
      await options.runtime.resolveServerModule<CompiledServerErrorBoundaryModule>(
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
    reportRuntimeError(options.runtime, error);
    return textResponse("500 Internal Server Error", 500);
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
  runtime: ServerRuntimeAdapter;
  url: URL;
}): Promise<HtmlRenderable> {
  let currentOutlet = options.outlet;
  const head = html`${options.head}`;

  for (let index = options.layoutModulePaths.length - 1; index >= 0; index -= 1) {
    const modulePath = options.layoutModulePaths[index];
    const layoutModule =
      await options.runtime.resolveServerModule<CompiledLayoutModule>(modulePath);

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

function reportRuntimeError(runtime: ServerRuntimeAdapter, error: unknown): void {
  runtime.reportError?.(error);
}
