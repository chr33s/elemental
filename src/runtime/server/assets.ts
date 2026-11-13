import type { BuildManifest, BuildManifestRoute } from "../../build/manifest.ts";
import { html, type HtmlRenderable, type HtmlResult } from "../shared/html.ts";
import type { RouterPayload } from "./core.ts";
import { createManagedHead } from "./render-document.ts";

export const EMPTY_ASSETS: RouterPayload["assets"] = {
	scripts: [],
	stylesheets: [],
};

export function createResolvedAssets(
	manifest: BuildManifest,
	route: BuildManifestRoute,
): RouterPayload["assets"] {
	return {
		scripts: [manifest.assets.clientEntry, ...route.assets.js]
			.filter((entryPath): entryPath is string => entryPath !== undefined)
			.map((entryPath) => `/${entryPath}`),
		stylesheets: route.assets.css.map((entryPath) => `/${entryPath}`),
	};
}

export function composeAssetHead(
	routeHead: HtmlRenderable,
	assets: RouterPayload["assets"],
): HtmlResult {
	return html`${createManagedHead({
		head: routeHead,
		scripts: assets.scripts,
		stylesheets: assets.stylesheets,
	})}`;
}
