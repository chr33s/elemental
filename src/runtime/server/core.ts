import { createPublicManifest, type BuildManifest } from "../../build/manifest.ts";
import { matchManifestRoute } from "../shared/routes.ts";
import { reportRuntimeError, renderServerErrorResponse } from "./errors.ts";
import { renderMatchedRoute } from "./routing.ts";

export type { RouterPayload } from "../shared/types.ts";

export interface ServerRuntimeAdapter {
  reportError?: (error: unknown) => void;
  resolveServerModule: <TModule>(modulePath: string) => Promise<TModule>;
  serveAsset: (request: Request, assetPathname: string) => Promise<Response>;
}

export interface ElementalRequestHandlerOptions {
  manifest: BuildManifest;
  runtime: ServerRuntimeAdapter;
}

export function createRequestHandler(
  options: ElementalRequestHandlerOptions,
): (request: Request) => Promise<Response> {
  const publicManifestJson = `${JSON.stringify(createPublicManifest(options.manifest), null, 2)}\n`;

  return (request) => handleElementalRequestWithRuntime(request, options, publicManifestJson);
}

export async function handleElementalRequestWithRuntime(
  request: Request,
  options: ElementalRequestHandlerOptions,
  publicManifestJson?: string,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/manifest.json") {
    const body =
      publicManifestJson ?? `${JSON.stringify(createPublicManifest(options.manifest), null, 2)}\n`;

    return new Response(body, {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
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
