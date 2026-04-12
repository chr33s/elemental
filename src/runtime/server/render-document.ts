import { html, renderToString, type HtmlRenderable } from "../shared/html.ts";

const EMPTY_HTML = html``;

export interface RenderDocumentOptions {
  body: HtmlRenderable;
  clientAssetHref?: string;
  head?: HtmlRenderable;
  scripts?: string[];
  stylesheets?: string[];
  title?: string;
}

export function renderSubtree(value: HtmlRenderable): string {
  return renderToString(value);
}

export function renderDocument(options: RenderDocumentOptions): string {
  const scriptHrefs = [
    ...(options.scripts ?? []),
    ...(options.clientAssetHref === undefined ? [] : [options.clientAssetHref]),
  ];
  const scriptTags = scriptHrefs.map(
    (scriptHref) => html`<script type="module" src=${scriptHref}></script>`,
  );
  const stylesheetTags = (options.stylesheets ?? []).map(
    (stylesheetHref) => html`<link rel="stylesheet" href=${stylesheetHref} />`,
  );
  const titleTag = options.title === undefined ? EMPTY_HTML : html`<title>${options.title}</title>`;

  return renderToString(html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        ${titleTag} ${options.head ?? EMPTY_HTML} ${stylesheetTags} ${scriptTags}
      </head>
      <body>
        <div data-route-outlet>${options.body}</div>
      </body>
    </html>`);
}
