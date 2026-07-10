import type { BuildManifest } from "../../build/manifest.ts";
import { textResponse } from "../shared/responses.ts";
import {
	createModuleRegistryResolver,
	createPublicManifestJson,
	handleElementalRequestWithRuntime,
} from "./core.ts";

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
	const publicManifestJson = createPublicManifestJson(options.manifest);

	return {
		async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
			try {
				return await handleElementalRequestWithRuntime(
					request,
					{
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
					},
					publicManifestJson,
				);
			} catch (error) {
				console.error(error);

				return textResponse("500 Internal Server Error", 500);
			}
		},
	};
}
