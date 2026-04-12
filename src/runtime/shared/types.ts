import type { HtmlRenderable, HtmlResult } from "./html.ts";

export type RouteParams = Record<string, string | string[]>;

export interface ErrorProps {
  error: unknown;
  params: RouteParams;
  request: Request;
  status: number;
  statusText: string;
  url: URL;
}

export interface ClientErrorProps {
  error: unknown;
  params: RouteParams;
  status?: number;
  statusText?: string;
  url: URL;
}

export interface RouteProps {
  params: RouteParams;
  data: Record<string, unknown>;
  url: URL;
}

export type RouteRenderContext = RouteProps;

export interface RouteServerContext {
  request: Request;
  params: RouteParams;
  url: URL;
}

export type RouteRenderer = (props: RouteProps) => HtmlRenderable | Promise<HtmlRenderable>;

export interface LayoutProps {
  outlet: HtmlResult;
  head: HtmlResult;
  params: RouteParams;
  url: URL;
}
