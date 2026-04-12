import { html, renderToString, type HtmlRenderable } from "../shared/html.ts";

const EMPTY_HTML = html``;

export interface RenderDocumentOptions {
  body: HtmlRenderable;
  clientAssetHref?: string;
  head?: HtmlRenderable;
  title?: string;
}

export function renderSubtree(value: HtmlRenderable): string {
  return renderToString(value);
}

export function renderDocument(options: RenderDocumentOptions): string {
  const scriptTag = options.clientAssetHref
    ? html`<script type="module" src=${options.clientAssetHref}></script>`
    : EMPTY_HTML;

  return renderToString(html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${options.title ?? "Elemental"}</title>
        ${options.head ?? EMPTY_HTML} ${scriptTag}
      </head>
      <body>
        <div data-route-outlet>${options.body}</div>
      </body>
    </html>`);
}
