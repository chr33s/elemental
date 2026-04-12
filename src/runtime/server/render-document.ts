import { escapeHtml } from "../shared/html.ts";

export interface RenderDocumentOptions {
  body: string;
  clientAssetHref?: string;
  title?: string;
}

export function renderDocument(options: RenderDocumentOptions): string {
  const title = escapeHtml(options.title ?? "Elemental");
  const scriptTag = options.clientAssetHref
    ? `<script type="module" src="${escapeHtml(options.clientAssetHref)}"></script>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    ${scriptTag}
  </head>
  <body>
    <div data-route-outlet>${options.body}</div>
  </body>
</html>`;
}
