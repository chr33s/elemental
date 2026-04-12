# Elemental

Elemental is a runtime-SSR meta-framework for native Web Components. v0 keeps one rendering model, one route graph, and one manifest that both the server and browser runtimes consume.

## Requirements

- Node.js 24 LTS
- npm 10+

## Quick Start

Install dependencies, build the default example app, and start the generated server:

```bash
npm install
npm run build
npm run start
```

Open `http://127.0.0.1:3000`.

The repository currently builds the example app in `spec/fixtures/basic-app/src` by default. A successful build writes:

- `dist/server.js`
- `dist/assets/*`
- `dist/manifest.json`

## Example App Tour

The built-in example app exercises the framework conventions that are already implemented:

- `/` shows the root layout shell and a custom element that upgrades in the browser runtime.
- `/about` proves client-side navigation and head updates.
- `/guides` uses a nested layout.
- `/guides/[topic]` uses a dynamic segment plus `index.server.ts` loader data.
- `/guestbook` uses a `POST` action that returns a redirect `Response`.
- `/search` demonstrates enhanced same-origin `GET` forms.
- `/recover/broken` demonstrates nearest-ancestor browser recovery through `error.ts`.
- `/reload` demonstrates the full-document fallback when no browser boundary exists.

## Commands

- `npm run build`: bundle the framework plus the default example app into `dist/`
- `npm run dev`: rerun the build in watch mode using Node's built-in TypeScript support
- `npm run start`: start the generated server from `dist/server.js`
- `npm run test`: run the unit suite and Playwright smoke coverage
- `npm run test:unit`: run only the Vitest suite
- `npm run test:e2e`: run only the Playwright suite
- `npm run lint`: run `oxlint`
- `npm run lint:fix`: run `oxlint` with autofix enabled
- `npm run format`: format the repo with `oxfmt`
- `npm run format:check`: verify formatting without writing changes
- `npm run typecheck`: run TypeScript in strict no-emit mode

## Authoring Model

Elemental uses filesystem routing. Any directory containing `index.ts` is a route.

```txt
src/
	layout.ts
	layout.css
	error.server.ts
	index.ts
	about/
		index.ts
	guides/
		layout.ts
		layout.css
		index.ts
		[topic]/
			index.ts
			index.server.ts
	guestbook/
		index.ts
		index.server.ts
```

### Route And Layout Files

- `index.ts`: route render module. Its default export returns an `html` result.
- `index.server.ts`: optional route server module. It can export `loader()`, `action()`, or a default `Response`-returning guard.
- `layout.ts`: optional ancestor layout module. Layouts compose from root to leaf.
- `layout.css`: optional document-level stylesheet for that layout directory.
- `error.ts`: optional browser-side recovery boundary for client navigation failures.
- `error.server.ts`: optional server-side error renderer for 404 and 500 responses.

### Small Route Example

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
  return {
    slug: context.params.slug,
  };
}
```

### Action Example

`action()` is intentionally held to a `Response`-only contract right now. The safest pattern is to return a redirect after a successful mutation.

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

Import the rendering primitives from `elemental`:

```ts
import { html, safeHtml } from "elemental";
```

`html` escapes interpolated values by default, flattens arrays, and preserves nested `html` results. Attribute interpolations are auto-quoted.

```ts
const name = "<Chris>";

html`<p data-name=${name}>Hello ${name}</p>`;
```

That renders escaped text and a quoted attribute value. Use `safeHtml()` only when you explicitly trust the input.

## CSS Behavior

Elemental treats CSS in two distinct ways:

- `layout.css` is emitted as a document stylesheet asset and injected in root-to-leaf layout order.
- Any other imported CSS resolves to raw CSS text on the server and `CSSStyleSheet` in the browser bundle.

That split is what enables server-rendered inline styles for shadow DOM use cases without giving up `adoptedStyleSheets` in the browser.

## Client Router Payloads

The browser runtime requests partial payloads by sending `X-Elemental-Router: true`.

```bash
curl -H 'X-Elemental-Router: true' http://127.0.0.1:3000/guides/runtime-ssr
```

The server responds with JSON shaped like:

```json
{
  "assets": {
    "scripts": ["/assets/bootstrap-abc123.js", "/assets/route-def456.js"],
    "stylesheets": ["/assets/layout-123abc.css"]
  },
  "head": "<title>Guide: Runtime SSR</title>",
  "outlet": "<section class=\"guides-shell\">...</section>",
  "status": 200
}
```

The client runtime uses that payload to:

- load missing scripts and stylesheets,
- replace only the `data-route-outlet` subtree,
- update managed head nodes, and
- preserve the surrounding document shell when recovery is not needed.

## Release Checklist

Use this checklist as the phase-level release gate for v0:

- [x] Runtime SSR is the only rendering mode.
- [x] Filesystem routes discover static, dynamic, and catch-all segments.
- [x] Layouts compose from root to leaf and emit layout CSS assets in deterministic order.
- [x] `index.server.ts` default exports can short-circuit with a `Response`.
- [x] `loader()` can provide route data or short-circuit with a `Response`.
- [x] Browser navigation uses structured partial payloads with asset and head metadata.
- [x] Named `HTMLElement` exports auto-register in the browser runtime when `static tagName` is valid.
- [x] Nearest-ancestor `error.server.ts` and `error.ts` resolution is covered by tests.
- [x] The built-in example app demonstrates nested layouts, dynamic params, route data, form actions, client navigation, and browser recovery.
- [ ] Finalize non-`Response` `action()` semantics. The runtime still returns `501` on that path by design.

## Current Scope Notes

- The default CLI flow builds `spec/fixtures/basic-app/src` today.
- The project is ESM-only.
- Browser-reachable modules cannot import `*.server.ts` files.
- `error.ts` is browser-only and is excluded from the server bundle.
