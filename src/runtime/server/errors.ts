import type { BuildManifest, BuildManifestRoute } from "../../build/manifest.ts";
import {
  resolveNearestErrorBoundaryForPathname,
  resolveNearestErrorBoundaryForRoute,
} from "../shared/error-boundaries.ts";
import { loadErrorBoundaryModule } from "../shared/error-boundary-modules.ts";
import { html } from "../shared/html.ts";
import { htmlResponse, textResponse } from "../shared/responses.ts";
import { createRouterPayloadResponse, isRouterRequest } from "../shared/router-protocol.ts";
import type { ErrorProps, RouteParams } from "../shared/types.ts";
import { EMPTY_ASSETS } from "./assets.ts";
import type { ServerRuntimeAdapter } from "./core.ts";
import { renderDocument, renderSubtree } from "./render-document.ts";

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
      ? resolveNearestErrorBoundaryForPathname(options.manifest, url.pathname, "server")
      : resolveNearestErrorBoundaryForRoute(
          options.matchedRoute.route,
          options.matchedRoute.params,
          "server",
        );

  if (resolvedBoundary === undefined) {
    return textResponse(`${options.status} ${options.statusText}`, options.status);
  }

  try {
    const boundaryModule = await loadErrorBoundaryModule<ErrorProps>({
      kind: "server",
      modulePath: resolvedBoundary.modulePath,
      resolver: options.runtime.resolveServerModule,
      sourcePath: resolvedBoundary.sourcePath,
    });

    const props: ErrorProps = {
      error: options.error,
      params: resolvedBoundary.params,
      request: options.request,
      status: options.status,
      statusText: options.statusText,
      url,
    };
    const head = boundaryModule.head === undefined ? html`` : await boundaryModule.head(props);
    const body = await boundaryModule.render(props);

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

    return htmlResponse(
      renderDocument({
        body,
        head,
      }),
      options.status,
    );
  } catch (error) {
    reportRuntimeError(options.runtime, error);
    return textResponse("500 Internal Server Error", 500);
  }
}

export function reportRuntimeError(runtime: ServerRuntimeAdapter, error: unknown): void {
  runtime.reportError?.(error);
}
