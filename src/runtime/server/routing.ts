import type { BuildManifest, BuildManifestRoute } from "../../build/manifest.ts";
import { html, type HtmlRenderable } from "../shared/html.ts";
import { htmlResponse } from "../shared/responses.ts";
import type { LayoutProps, RouteParams, RouteProps, RouteServerContext } from "../shared/types.ts";
import { createResolvedAssets, composeAssetHead } from "./assets.ts";
import type { RouterPayload, ServerRuntimeAdapter } from "./core.ts";
import { renderDocument, renderSubtree } from "./render-document.ts";
import { createRouterPayloadResponse, isRouterRequest } from "./render-partial.ts";

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

const EMPTY_HTML = html``;

export async function renderMatchedRoute(options: {
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

    return createRouterPayloadResponse({
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

  return htmlResponse(document);
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
