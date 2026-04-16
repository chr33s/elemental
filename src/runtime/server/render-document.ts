import {
  ELEMENTAL_HEAD_END_NAME,
  ELEMENTAL_HEAD_START_NAME,
  ELEMENTAL_MANAGED_SCRIPT,
  ELEMENTAL_MANAGED_STYLESHEET,
} from "../shared/browser-runtime.ts";
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

export function createManagedHead(options: {
  head?: HtmlRenderable;
  scripts?: string[];
  stylesheets?: string[];
}): HtmlRenderable {
  const scriptTags = (options.scripts ?? []).map(
    (scriptHref) =>
      html`<script
        data-elemental-managed=${ELEMENTAL_MANAGED_SCRIPT}
        type="module"
        src=${scriptHref}
      ></script>`,
  );
  const stylesheetTags = (options.stylesheets ?? []).map(
    (stylesheetHref) =>
      html`<link
        data-elemental-managed=${ELEMENTAL_MANAGED_STYLESHEET}
        rel="stylesheet"
        href=${stylesheetHref}
      />`,
  );

  return [
    html`<meta name=${ELEMENTAL_HEAD_START_NAME} content="" />`,
    options.head ?? EMPTY_HTML,
    html`<meta name=${ELEMENTAL_HEAD_END_NAME} content="" />`,
    stylesheetTags,
    scriptTags,
  ];
}

export function renderDocument(options: RenderDocumentOptions): HtmlRenderable {
  const scriptHrefs = [
    ...(options.scripts ?? []),
    ...(options.clientAssetHref === undefined ? [] : [options.clientAssetHref]),
  ];
  const titleTag = options.title === undefined ? EMPTY_HTML : html`<title>${options.title}</title>`;
  const managedHead = createManagedHead({
    head: options.head,
    scripts: scriptHrefs,
    stylesheets: options.stylesheets,
  });

  return [
    html`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
      </html> `,
    titleTag,
    html``,
    managedHead,
    html`</head>
      <body>
        <div data-route-outlet>`,
    options.body,
    html`</div>
      </body>
    </html>`,
  ];
}
