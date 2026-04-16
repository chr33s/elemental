import type { BuildManifest } from "../../build/manifest.ts";
import { textResponse } from "../shared/responses.ts";
import { createModuleRegistryResolver, handleElementalRequestWithRuntime } from "./core.ts";

export interface WorkerAssetsBinding {
  fetch: (request: Request) => Promise<Response> | Response;
}

export interface WorkerEnvironment {
  ASSETS?: WorkerAssetsBinding;
}

export interface CreateWorkerHandlerOptions {
  manifest: BuildManifest;
  modules: Record<string, unknown>;
}

export function createWorkerHandler(options: CreateWorkerHandlerOptions): {
  fetch: (request: Request, env: WorkerEnvironment) => Promise<Response>;
} {
  const resolveServerModule = createModuleRegistryResolver(options.modules);

  return {
    async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
      return handleElementalRequestWithRuntime(request, {
        manifest: options.manifest,
        runtime: {
          reportError(error) {
            console.error(error);
          },
          resolveServerModule,
          async serveAsset(assetRequest: Request): Promise<Response> {
            if (env.ASSETS !== undefined) {
              return env.ASSETS.fetch(assetRequest);
            }

            return textResponse("Asset not found", 404);
          },
        },
      });
    },
  };
}
