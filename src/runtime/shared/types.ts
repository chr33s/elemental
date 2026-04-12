import type { HtmlRenderable, HtmlResult } from "./html.ts";

export type RouteParams = Record<string, string | string[]>;

export interface RouteRenderContext {
  params: RouteParams;
  url: URL;
}

export type RouteRenderer = (
  context: RouteRenderContext,
) => HtmlRenderable | Promise<HtmlRenderable>;

export interface LayoutProps {
  outlet: HtmlResult;
  head: HtmlResult;
  params: RouteParams;
  url: URL;
}
