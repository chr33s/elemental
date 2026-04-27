> [!WARNING]  
> Experimental: API is unstable and not production-ready.

# Elemental

A runtime-SSR meta-framework for native Web Components. One rendering model, one route graph, and one manifest that both the server and browser runtimes consume.

- Node.js 24 LTS, npm 10+
- ESM-only
- See [architecture.md](architecture.md) for internals, [plan.md](plan.md) for implementation phases

## Quick Start

```bash
npm install
npm run build
npm run start
```

Open `http://127.0.0.1:3000`. The default build uses the example app in `spec/fixtures/basic-app/src`.

## Commands

| Command                            | Description                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `npm run build`                    | Bundle the framework and example app into `dist/` (both Node and Worker targets) |
| `npm run build -- --target node`   | Emit only Node deployment artifacts                                              |
| `npm run build -- --target worker` | Emit only Worker deployment artifacts and generated Wrangler config              |
| `npm run build -- --watch`         | Rebuild on source changes                                                        |
| `npm run dev`                      | Watch mode with server restarts, live reload, CSS hot swaps, and route rerenders |
| `npm run start`                    | Start the generated server from `dist/server.js`                                 |
| `npm run bench`                    | Build and runtime benchmarks against the example app                             |
| `npm run test`                     | Unit suite (Vitest) and Playwright smoke coverage                                |
| `npm run test:unit`                | Vitest only                                                                      |
| `npm run test:e2e`                 | Playwright only                                                                  |
| `npm run lint`                     | Run `oxlint`                                                                     |
| `npm run lint:fix`                 | Run `oxlint` with autofix                                                        |
| `npm run format`                   | Format with `oxfmt`                                                              |
| `npm run format:check`             | Verify formatting without writing                                                |
| `npm run typecheck`                | TypeScript strict no-emit check                                                  |

## Authoring Model

Filesystem routing — any directory containing `index.ts` is a route.

| File              | Purpose                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| `index.ts`        | Route render module. Default export returns an `html` result. Optional `head()` export. |
| `index.server.ts` | Optional server module: `loader()`, `action()`, or a default `Response` guard.          |
| `layout.ts`       | Optional layout. Composes from root to leaf via `outlet` and `head` props.              |
| `layout.css`      | Optional document-level stylesheet, injected in root-to-leaf order.                     |
| `error.ts`        | Optional browser-side recovery boundary for client navigation failures.                 |
| `error.server.ts` | Optional server-side error renderer for 404 and 500 responses.                          |

### Route Example

```ts
import { html } from "elemental";

export function head() {
  return html`<title>Hello</title>`;
}

export default function helloRoute() {
  return html`<section>
    <h1>Hello</h1>
    <p>Elemental route</p>
  </section>`;
}
```

### Loader Example

```ts
import type { RouteServerContext } from "elemental";

export async function loader(context: RouteServerContext) {
  return { slug: context.params.slug };
}
```

### Action Example

`action()` must return a `Response` (redirect, error, or full document).

```ts
import type { RouteServerContext } from "elemental";

export async function action(context: RouteServerContext) {
  const form = await context.request.formData();
  const redirectUrl = new URL("/guestbook", context.url);
  redirectUrl.searchParams.set("name", String(form.get("name") ?? "Anonymous"));
  return Response.redirect(redirectUrl, 303);
}
```

## HTML Helper

```ts
import { declarativeShadowDom, html, safeHtml } from "elemental";
```

`html` escapes interpolated values by default, flattens arrays, preserves nested `html` results, and auto-quotes attribute interpolations. Use `safeHtml()` only for trusted input.

```ts
const name = "<Chris>";
html`<p data-name=${name}>Hello ${name}</p>`;
```

### Security Note

`safeHtml()` is a raw trust escape hatch, not a sanitizer. Values passed to it can later reach client-side DOM insertion paths used for route outlet replacement and managed `<head>` updates.

Unsafe:

```ts
import { html, safeHtml } from "elemental";

export default function route({ data }: { data: { bioHtml: string } }) {
  return html`<section>${safeHtml(data.bioHtml)}</section>`;
}
```

Safer:

```ts
import { html } from "elemental";

export default function route({ data }: { data: { bio: string } }) {
  return html`<section>${data.bio}</section>`;
}
```

Only pass values to `safeHtml()` after they were produced by framework-controlled markup generation or sanitized by a library you trust for the exact HTML policy you need.

`oxlint` reports direct `safeHtml()` calls in app route, layout, and browser error-boundary modules. For intentionally reviewed exceptions, use a local `oxlint-disable-next-line elemental/no-unsafe-safe-html` comment and explain the trust boundary inline.

### Declarative Shadow DOM

Use `declarativeShadowDom()` when a custom element should paint its shadow content from SSR before the browser module upgrades it.

```ts
import { declarativeShadowDom, html } from "elemental";
import sheet from "./card.css";

export default function route() {
  return html`
    <user-card>
      ${declarativeShadowDom({
        content: html`<article><slot name="title"></slot></article>`,
        styles: [sheet],
      })}
      <span slot="title">Hello</span>
    </user-card>
  `;
}

export class UserCard extends HTMLElement {
  static tagName = "user-card";

  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });

    if (sheet instanceof CSSStyleSheet) {
      root.adoptedStyleSheets = [sheet];
    }
  }
}
```

Server CSS imports are emitted as raw CSS inside the helper's generated `<style>` tags. Browser CSS imports remain `CSSStyleSheet` instances for upgraded custom elements. Client navigations parse DSD-bearing router payloads with native fragment parsing when available; unsupported browsers fall back to a full document navigation instead of inserting inert shadow templates.

#### Deferred Activation

Two cooperating mechanisms ship in the public API:

1. **`deferActivation(...)`** — a standalone client primitive for delaying browser-side work inside an auto-registered custom element.
2. **`island(...)` plus `<appDir>/islands/`** — framework-managed island modules with their own browser bundles, manifest entries, and shared activation runtime.

##### `deferActivation()` from within a custom element

```ts
import { deferActivation } from "elemental";

export class UserCard extends HTMLElement {
  static tagName = "user-card";

  #controller?: ReturnType<typeof deferActivation>;

  connectedCallback() {
    this.#controller = deferActivation({
      element: this,
      strategy: "visible",
      activate: async () => {
        const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        const { mount } = await import("./user-card.client.ts");
        mount(root, this);
      },
    });
  }

  disconnectedCallback() {
    this.#controller?.cancel();
  }
}
```

`deferActivation()` supports four strategies — `eager` (default), `idle`, `interaction`, `visible` — runs `activate()` at most once per controller, tears down observers/listeners on `cancel()` or via `AbortSignal`, and falls back to eager activation when the underlying browser primitive (`IntersectionObserver`, `requestIdleCallback`) is missing.

The companion `readActivationStrategy(element, fallback?)` helper reads the `data-activate` attribute (`eager` | `idle` | `interaction` | `visible`) and returns a validated strategy, so a custom element can honor the same authoring convention used by framework-managed island hosts:

```ts
import { deferActivation, readActivationStrategy } from "elemental";

connectedCallback() {
  this.#controller = deferActivation({
    element: this,
    strategy: readActivationStrategy(this),
    activate: () => {/* ... */},
  });
}
```

Authors then opt in via markup: `<user-card data-activate="visible">…</user-card>`.

##### Framework-managed islands

Place island modules under `<appDir>/islands/`. Each file becomes one island whose id is the relative path without the `.ts` extension (`islands/card.ts` → `card`, `islands/charts/line.ts` → `charts/line`). Each module must export a `mount` function (or a default function with the same signature):

```ts
// src/islands/card.ts
export function mount(host: HTMLElement, props: unknown) {
  host.dataset.mountedAt = String(Date.now());
  host.textContent = JSON.stringify(props);
}
```

Render the host with the server `island()` helper:

```ts
import { html, island } from "elemental";

export default function route() {
  return html`
    <section>
      ${island({
        id: "card",
        props: { highlighted: true },
        strategy: "visible",
        content: html`<article>Server-rendered shell</article>`,
      })}
    </section>
  `;
}
```

The build emits one browser bundle per island and records it in `manifest.islands[id]`. The client island runtime activates each host according to its strategy on initial bootstrap and after every client navigation, mounts it exactly once per connected lifetime, and tags it with `data-elemental-island-active` when complete. Module resolution is constrained to manifest-listed ids, preserving the framework's manifest-driven trust boundary for dynamic `import()`.

## CSS Behavior

- `layout.css` — emitted as a document stylesheet asset, injected in root-to-leaf layout order.
- Other imported CSS — resolves to raw CSS text on the server and `CSSStyleSheet` in the browser bundle (enabling `adoptedStyleSheets` for shadow DOM).

## Linting

Elemental ships an `oxlint` plugin that encodes framework conventions which the build cannot enforce on its own. The plugin is loaded by [oxlint.config.ts](oxlint.config.ts) via `jsPlugins: ["./oxlint-elemental-plugin.js"]`, so consumers of this repository pick it up automatically through `npm run lint`.

### Setup

To use the plugin in your own app, copy [oxlint-elemental-plugin.js](oxlint-elemental-plugin.js) to your project and reference it from your `oxlint` config:

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["./oxlint-elemental-plugin.js"],
  rules: {
    "elemental/no-browser-globals-at-top-level": "error",
    "elemental/no-customelements-define": "error",
    "elemental/no-default-with-loader-action": "error",
    "elemental/no-htmlelement-in-server-module": "error",
    "elemental/no-server-import-in-browser": "error",
    "elemental/no-unsafe-safe-html": "error",
    "elemental/require-tag-name": "error",
    "elemental/valid-tag-name": "error",
  },
});
```

Then run:

```bash
npx oxlint
```

Rules apply by filename convention (`index.ts`, `index.server.ts`, `layout.ts`, `error.ts`, `error.server.ts`, plus `*.server.*` and `*.client.*`), so they cover any directory in the route tree without extra configuration.

### Rules

| Rule                                        | What it flags                                                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `elemental/no-unsafe-safe-html`             | Direct `safeHtml()` calls in route-facing modules. Disable inline with `oxlint-disable-next-line` when the trust boundary is reviewed.         |
| `elemental/no-server-import-in-browser`     | Imports of `*.server.*` modules from `index.ts`, `layout.ts`, `error.ts`, or any `*.client.*` file — these would leak into the browser bundle. |
| `elemental/no-customelements-define`        | Manual `customElements.define()` in `index.ts` or `layout.ts`. Export the class with `static tagName` and let auto-registration handle it.     |
| `elemental/require-tag-name`                | Exported `HTMLElement` subclasses in `index.ts`/`layout.ts` that omit `static tagName`. Without it the class cannot be auto-registered.        |
| `elemental/valid-tag-name`                  | `static tagName` declarations that are not a string literal, or are missing the required hyphen.                                               |
| `elemental/no-htmlelement-in-server-module` | `HTMLElement` subclasses inside `*.server.ts` files — `HTMLElement` does not exist on the server.                                              |
| `elemental/no-default-with-loader-action`   | `index.server.ts` files that combine a default `Response` handler with `loader`/`action`. The default handler fully owns the response.         |
| `elemental/no-browser-globals-at-top-level` | Top-level references to `window`, `document`, `customElements`, `navigator`, etc. in isomorphic route modules. Guard with `typeof X` first.    |

## API Reference

### Rendering

| Export                   | Signature                                       | Description                                                             |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------- |
| `html`                   | ``html`...`: HtmlResult``                       | Tagged template with auto-escaping, array flattening, attribute quoting |
| `safeHtml`               | `safeHtml(value: string): SafeHtmlValue`        | Bypass escaping for trusted HTML                                        |
| `declarativeShadowDom`   | `declarativeShadowDom(options): HtmlResult`     | Emit a DSD `<template>` with optional scoped styles                     |
| `escapeHtml`             | `escapeHtml(value: string): string`             | Escape `& < > " '`                                                      |
| `island`                 | `island(options): HtmlResult`                   | Emit a framework-managed island host with strategy and serialized props |
| `serializeIslandProps`   | `serializeIslandProps(value): string`           | JSON-encode island props with `<` escaped to `\u003c`                   |
| `deferActivation`        | `deferActivation(options): Controller`          | Strategy-based activation gate (`eager`/`idle`/`interaction`/`visible`) |
| `readActivationStrategy` | `readActivationStrategy(el, fallback?): string` | Read a validated activation strategy from the `data-activate` attribute |

### Types

#### `RouteProps`

```ts
interface RouteProps {
  params: RouteParams;
  data: Record<string, unknown>;
  url: URL;
}
```

#### `RouteServerContext`

```ts
interface RouteServerContext {
  request: Request;
  params: RouteParams;
  url: URL;
}
```

#### `LayoutProps`

```ts
interface LayoutProps {
  outlet: HtmlResult;
  head: HtmlResult;
  params: RouteParams;
  url: URL;
}
```

#### `ErrorProps`

```ts
interface ErrorProps {
  error: unknown;
  params: RouteParams;
  request: Request;
  status: number;
  statusText: string;
  url: URL;
}
```

#### `ClientErrorProps`

```ts
interface ClientErrorProps {
  error: unknown;
  params: RouteParams;
  status?: number;
  statusText?: string;
  url: URL;
}
```

#### `RouteParams`

```ts
type RouteParams = Record<string, string | string[]>;
```

`[slug]` produces `string`, `[...path]` produces `string[]`.

### Custom Elements

Named `HTMLElement` exports from `index.ts` or `layout.ts` with `static tagName` are auto-registered in the browser. Skipped when already defined. Stripped from server bundles.

```ts
export class MyButton extends HTMLElement {
  static tagName = "my-button";
  connectedCallback() {
    this.innerHTML = "<button>Click me</button>";
  }
}
```

## Deployment

### Node.js (srvx)

```bash
npm run build -- --target node
node dist/srvx.js
```

Outputs `dist/server.js`, `dist/srvx.js`, `dist/assets/*`, `dist/manifest.json`.

Environment: `PORT` (default 3000), `HOST` (default 0.0.0.0), `ELEMENTAL_CANONICAL_ORIGIN` to decouple request URL construction from inbound `Host`, and `ELEMENTAL_ALLOWED_HOSTS` as a comma-separated allowlist for accepted hostnames or host:port values. Runs on any Node.js 24+ platform.

For production deployments behind a proxy or load balancer, prefer setting `ELEMENTAL_CANONICAL_ORIGIN` and optionally `ELEMENTAL_ALLOWED_HOSTS` instead of relying on raw inbound `Host` headers.

At runtime, `/manifest.json` serves a client-safe subset for the browser runtime with `cache-control: no-store`. Production deployments that serve this endpoint through a CDN may override this with a short `max-age` or `stale-while-revalidate` to reduce origin load between builds. The full `dist/manifest.json` remains a trusted build artifact for deployment and server-side tooling.

### Cloudflare Workers

```bash
npm run build -- --target worker
wrangler deploy dist/worker.js --config dist/wrangler.jsonc
```

Outputs `dist/worker.js`, `dist/wrangler.jsonc`, `dist/assets/*`, `dist/manifest.json`.

Web APIs only — the build validates Worker-safe code. Static assets are served via the Workers asset binding.

## Versioning

Elemental follows semver. The public compatibility surface covers documented `elemental` exports, route-module conventions, manifest and build artifacts, and the CLI commands above.
