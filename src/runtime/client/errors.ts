import type { BuildManifest } from "../../build/manifest.ts";
import {
  resolveNearestBrowserErrorBoundaryForPathname,
  resolveNearestBrowserErrorBoundaryForRoute,
  type ResolvedErrorBoundary,
} from "../shared/error-boundaries.ts";
import { renderToString, type HtmlRenderable } from "../shared/html.ts";
import type { MatchedManifestRoute } from "../shared/routes.ts";
import type { ClientErrorProps } from "../shared/types.ts";

interface CompiledBrowserErrorBoundaryModule {
  default?: (props: ClientErrorProps) => HtmlRenderable | Promise<HtmlRenderable>;
  head?: (props: ClientErrorProps) => HtmlRenderable | Promise<HtmlRenderable>;
}

export type MatchedClientRoute = MatchedManifestRoute;

export interface RenderedClientErrorBoundary {
  boundary: ResolvedErrorBoundary;
  head: string;
  outlet: string;
}

export async function renderClientErrorBoundary(options: {
  error: unknown;
  manifest: BuildManifest;
  matchedRoute?: MatchedClientRoute;
  resolver: (modulePath: string) => Promise<unknown>;
  status?: number;
  statusText?: string;
  url: URL;
}): Promise<RenderedClientErrorBoundary | undefined> {
  const boundary =
    options.matchedRoute === undefined
      ? resolveNearestBrowserErrorBoundaryForPathname(options.manifest, options.url.pathname)
      : resolveNearestBrowserErrorBoundaryForRoute(
          options.matchedRoute.route,
          options.matchedRoute.params,
        );

  if (boundary === undefined) {
    return undefined;
  }

  const boundaryModule = (await options.resolver(
    boundary.modulePath,
  )) as CompiledBrowserErrorBoundaryModule;

  if (typeof boundaryModule.default !== "function") {
    throw new TypeError(
      `Browser error boundary ${boundary.sourcePath} must export a default render function.`,
    );
  }

  const props: ClientErrorProps = {
    error: options.error,
    params: boundary.params,
    status: options.status,
    statusText: options.statusText,
    url: options.url,
  };

  const outlet = renderToString(await boundaryModule.default(props));
  const head =
    typeof boundaryModule.head === "function"
      ? renderToString(await boundaryModule.head(props))
      : "";

  return {
    boundary,
    head,
    outlet,
  };
}

export async function recoverFromClientError(options: {
  error: unknown;
  fallback: () => void | Promise<void>;
  logger?: Pick<Console, "error">;
  manifest: BuildManifest;
  matchedRoute?: MatchedClientRoute;
  renderHead: (head: string) => void;
  renderOutlet: (outlet: string) => void;
  resolver: (modulePath: string) => Promise<unknown>;
  status?: number;
  statusText?: string;
  url: URL;
}): Promise<boolean> {
  try {
    const renderedBoundary = await renderClientErrorBoundary(options);

    if (renderedBoundary === undefined) {
      await options.fallback();
      return false;
    }

    options.renderOutlet(renderedBoundary.outlet);
    options.renderHead(renderedBoundary.head);

    return true;
  } catch (error) {
    (options.logger ?? console).error(error);
    await options.fallback();

    return false;
  }
}
