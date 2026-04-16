import type { BuildManifest } from "../../build/manifest.ts";
import {
  resolveNearestErrorBoundaryForPathname,
  resolveNearestErrorBoundaryForRoute,
  type ResolvedErrorBoundary,
} from "../shared/error-boundaries.ts";
import { loadErrorBoundaryModule } from "../shared/error-boundary-modules.ts";
import { renderToString } from "../shared/html.ts";
import type { MatchedManifestRoute } from "../shared/routes.ts";
import type { ClientErrorProps } from "../shared/types.ts";

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
      ? resolveNearestErrorBoundaryForPathname(options.manifest, options.url.pathname, "browser")
      : resolveNearestErrorBoundaryForRoute(
          options.matchedRoute.route,
          options.matchedRoute.params,
          "browser",
        );

  if (boundary === undefined) {
    return undefined;
  }

  const boundaryModule = await loadErrorBoundaryModule<ClientErrorProps>({
    kind: "browser",
    modulePath: boundary.modulePath,
    resolver: options.resolver,
    sourcePath: boundary.sourcePath,
  });

  const props: ClientErrorProps = {
    error: options.error,
    params: boundary.params,
    status: options.status,
    statusText: options.statusText,
    url: options.url,
  };

  const outlet = renderToString(await boundaryModule.render(props));
  const head =
    boundaryModule.head === undefined ? "" : renderToString(await boundaryModule.head(props));

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
