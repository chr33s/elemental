import type { BuildManifest, BuildManifestRoute } from "../../build/manifest.ts";
import {
  resolveNearestServerErrorBoundaryForPathname,
  resolveNearestServerErrorBoundaryForRoute,
} from "../shared/error-boundaries.ts";
import { html, type HtmlRenderable } from "../shared/html.ts";
import { textResponse } from "../shared/responses.ts";
import type { ErrorProps, RouteParams } from "../shared/types.ts";
import { EMPTY_ASSETS } from "./assets.ts";
import type { ServerRuntimeAdapter } from "./core.ts";
import { renderDocument, renderSubtree } from "./render-document.ts";
import { createRouterPayloadResponse, isRouterRequest } from "./render-partial.ts";

interface CompiledServerErrorBoundaryModule {
  default?: (props: ErrorProps) => HtmlRenderable | Promise<HtmlRenderable>;
  head?: (props: ErrorProps) => HtmlRenderable | Promise<HtmlRenderable>;
}

const EMPTY_HTML = html``;

export async function renderServerErrorResponse(options: {
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
      return createRouterPayloadResponse(
        {
          assets: EMPTY_ASSETS,
          head: renderSubtree(head),
          outlet: renderSubtree(body),
          status: options.status,
        },
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

export function reportRuntimeError(runtime: ServerRuntimeAdapter, error: unknown): void {
  runtime.reportError?.(error);
}
