import type { HtmlRenderable, HtmlResult } from "./html.ts";

/**
 * Route parameter values extracted from dynamic URL segments.
 *
 * - Dynamic segments like `[slug]` produce `string` values
 * - Catch-all segments like `[...path]` produce `string[]` values
 */
export type RouteParams = Record<string, string | string[]>;

/**
 * Props passed to server-side error boundary modules (`error.server.ts`).
 *
 * Available in the default export function that renders error responses.
 */
export interface ErrorProps {
  /** The error that was thrown */
  error: unknown;
  /** Route parameters extracted from the URL */
  params: RouteParams;
  /** The incoming request */
  request: Request;
  /** HTTP status code (404 or 500) */
  status: number;
  /** HTTP status text */
  statusText: string;
  /** Parsed request URL */
  url: URL;
}

/**
 * Props passed to client-side error boundary modules (`error.ts`).
 *
 * Available in the default export function that renders browser recovery UI.
 */
export interface ClientErrorProps {
  /** The error that occurred during client navigation */
  error: unknown;
  /** Route parameters extracted from the URL */
  params: RouteParams;
  /** HTTP status code if available */
  status?: number;
  /** HTTP status text if available */
  statusText?: string;
  /** Current page URL */
  url: URL;
}

/**
 * Props passed to route render functions (`index.ts` default export).
 *
 * Contains route parameters, loader data, and the current URL.
 */
export interface RouteProps {
  /** Route parameters extracted from dynamic URL segments */
  params: RouteParams;
  /** Data returned by the `loader()` function in `index.server.ts` */
  data: Record<string, unknown>;
  /** Current page URL */
  url: URL;
}

/**
 * Alias for RouteProps used in route render context.
 */
export type RouteRenderContext = RouteProps;

/**
 * Context object passed to server-side route functions.
 *
 * Available in `loader()` and `action()` functions in `index.server.ts`.
 */
export interface RouteServerContext {
  /** The incoming HTTP request */
  request: Request;
  /** Route parameters extracted from dynamic URL segments */
  params: RouteParams;
  /** Parsed request URL */
  url: URL;
}

/**
 * Type signature for route render functions.
 *
 * The default export of `index.ts` must match this signature.
 */
export type RouteRenderer = (props: RouteProps) => HtmlRenderable | Promise<HtmlRenderable>;

/**
 * Props passed to layout render functions (`layout.ts` default export).
 *
 * Layouts compose from root to leaf, wrapping child content in the `outlet`.
 */
export interface LayoutProps {
  /** The composed child content (route + nested layouts) */
  outlet: HtmlResult;
  /** Aggregated head content from the route and child layouts */
  head: HtmlResult;
  /** Route parameters from the current route */
  params: RouteParams;
  /** Current page URL */
  url: URL;
}

