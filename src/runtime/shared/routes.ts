import type { BuildManifestRoute, PublicBuildManifestRoute } from "../../build/manifest.ts";
import { splitPathSegments } from "../../shared/path-utils.ts";
import type { RouteParams } from "./types.ts";

type ManifestRouteLike =
  | Pick<BuildManifestRoute, "pattern">
  | Pick<PublicBuildManifestRoute, "pattern">;

export interface MatchedManifestRoute<TRoute extends ManifestRouteLike = BuildManifestRoute> {
  params: RouteParams;
  route: TRoute;
}

export function matchManifestRoute<TRoute extends ManifestRouteLike>(
  pathname: string,
  routes: TRoute[],
): MatchedManifestRoute<TRoute> | undefined {
  const pathnameSegments = splitPathSegments(pathname);

  for (const route of routes) {
    const params = matchRoutePattern(route.pattern, pathnameSegments);

    if (params !== undefined) {
      return {
        params,
        route,
      };
    }
  }

  return undefined;
}

export function matchRoutePattern(
  pattern: string,
  pathnameSegments: string[],
): RouteParams | undefined {
  if (pattern === "/") {
    return pathnameSegments.length === 0 ? {} : undefined;
  }

  const patternSegments = splitPathSegments(pattern);
  const params: RouteParams = {};
  let pathnameIndex = 0;

  for (let patternIndex = 0; patternIndex < patternSegments.length; patternIndex += 1) {
    const patternSegment = patternSegments[patternIndex];

    if (patternSegment.startsWith("*")) {
      const paramName = patternSegment.slice(1);
      const remainingSegments = pathnameSegments.slice(pathnameIndex);

      if (remainingSegments.length === 0) {
        return undefined;
      }

      params[paramName] = remainingSegments;
      pathnameIndex = pathnameSegments.length;
      break;
    }

    const pathnameSegment = pathnameSegments[pathnameIndex];

    if (pathnameSegment === undefined) {
      return undefined;
    }

    if (patternSegment.startsWith(":")) {
      params[patternSegment.slice(1)] = pathnameSegment;
      pathnameIndex += 1;
      continue;
    }

    if (patternSegment !== pathnameSegment) {
      return undefined;
    }

    pathnameIndex += 1;
  }

  return pathnameIndex === pathnameSegments.length ? params : undefined;
}
