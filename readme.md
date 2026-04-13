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
- `dist/srvx.js`
- `dist/worker.js`
- `dist/wrangler.jsonc`

## Deployment Fixtures

`spec/fixtures/basic-app/src` remains the canonical app fixture. Deployment-specific wrappers live beside it so Node and Worker packaging can be exercised without copying route code:

- `spec/fixtures/deploy-srvx`: builds the shared app with `--target node` and emits `dist/srvx.js`
- `spec/fixtures/deploy-wrangler`: builds the shared app with `--target worker` and emits `dist/worker.js` plus `dist/wrangler.jsonc`

From either fixture directory, `npm run build` writes artifacts into that fixture's local `dist/` directory.
Each wrapper also exposes `npm run smoke` to validate the generated runtime artifact without installing `srvx` or Wrangler into the repo.

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

- `npm run build`: bundle the framework plus the default example app into `dist/`, including both Node and Worker deployment artifacts
- `npm run build -- --target node`: emit only the Node deployment artifacts
- `npm run build -- --target worker`: emit only the Worker deployment artifacts and generated Wrangler config
- `npm run build -- --watch`: rerun the build when framework or app source files change using Node's watcher and built-in TypeScript support
- `npm run dev`: run `elemental dev` with rebuilds, server restarts, live reload, layout stylesheet hot swaps, and safe route-subtree rerenders for browser-only updates
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

`action()` is `Response`-only in v0. Return a redirect, error response, or full document response after the mutation completes.

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

## Developer Reloading

`elemental dev` keeps the development loop centered on the same outputs as production: `dist/server.js`, `dist/assets/*`, and `dist/manifest.json`.

```bash
npm run dev
```

The development wrapper does three distinct things after each successful rebuild:

- restarts the generated server process against the fresh `dist/` artifacts,
- notifies connected browsers over an SSE channel only after the new server is ready, and
- chooses the safest browser update mode for the changed files.

The update modes are:

- live reload for server contract changes, route graph changes, framework runtime changes, non-layout CSS changes, and any browser module that appears to define custom elements,
- stylesheet hot swap for `layout.css` updates, and
- route-subtree rerender for safe browser-side route, layout, `error.ts`, and route-adjacent module edits.

JavaScript HMR in v0 is intentionally framework-aware rather than module-local. Elemental reloads the current route payload, updates managed head content, reloads any new browser chunks, and replaces the current `data-route-outlet` subtree. That preserves the surrounding document shell while still falling back to a full reload when correctness is uncertain.

## API Reference

### HTML Rendering

#### `html`

```ts
function html(strings: TemplateStringsArray, ...values: HtmlRenderable[]): HtmlResult
```

Tagged template for rendering HTML with automatic escaping. Interpolated values are escaped by default unless wrapped in `safeHtml()`. Attribute values are automatically quoted. Arrays are flattened. Null, undefined, and false are ignored.

**Example:**

```ts
const name = "<script>";
html`<p>Hello ${name}</p>`; // <p>Hello &lt;script&gt;</p>

html`<div class=${className}>...</div>`; // <div class="value">...</div>
```

#### `safeHtml`

```ts
function safeHtml(value: string): SafeHtmlValue
```

Marks a string as trusted HTML that should bypass escaping. **Warning**: Only use with content you trust. Improper use can lead to XSS vulnerabilities.

**Example:**

```ts
const trustedMarkup = "<strong>Safe</strong>";
html`<div>${safeHtml(trustedMarkup)}</div>`; // <div><strong>Safe</strong></div>
```

#### `escapeHtml`

```ts
function escapeHtml(value: string): string
```

Escapes HTML special characters (&, <, >, ", ') to prevent XSS attacks. Used internally by the `html` tagged template.

### Type Definitions

#### `RouteProps`

Props passed to route render functions (`index.ts` default export).

```ts
interface RouteProps {
  params: RouteParams;     // Route parameters from dynamic URL segments
  data: Record<string, unknown>;  // Data from loader()
  url: URL;                // Current page URL
}
```

#### `RouteServerContext`

Context object passed to server-side route functions (`loader()` and `action()` in `index.server.ts`).

```ts
interface RouteServerContext {
  request: Request;  // The incoming HTTP request
  params: RouteParams;  // Route parameters from URL
  url: URL;          // Parsed request URL
}
```

#### `LayoutProps`

Props passed to layout render functions (`layout.ts` default export). Layouts compose from root to leaf.

```ts
interface LayoutProps {
  outlet: HtmlResult;  // Composed child content
  head: HtmlResult;    // Aggregated head content
  params: RouteParams; // Route parameters
  url: URL;            // Current page URL
}
```

#### `ErrorProps`

Props passed to server-side error boundary modules (`error.server.ts`).

```ts
interface ErrorProps {
  error: unknown;      // The error that was thrown
  params: RouteParams; // Route parameters
  request: Request;    // The incoming request
  status: number;      // HTTP status (404 or 500)
  statusText: string;  // HTTP status text
  url: URL;            // Parsed request URL
}
```

#### `ClientErrorProps`

Props passed to client-side error boundary modules (`error.ts`).

```ts
interface ClientErrorProps {
  error: unknown;       // The error during navigation
  params: RouteParams;  // Route parameters
  status?: number;      // HTTP status if available
  statusText?: string;  // HTTP status text if available
  url: URL;             // Current page URL
}
```

#### `RouteParams`

Route parameter values extracted from dynamic URL segments.

```ts
type RouteParams = Record<string, string | string[]>
```

- Dynamic segments like `[slug]` produce `string` values
- Catch-all segments like `[...path]` produce `string[]` values

### Server Functions

#### `loader()`

Optional function in `index.server.ts` that loads data for a route.

```ts
export async function loader(context: RouteServerContext): Promise<Record<string, unknown> | Response>
```

- Returns data object that becomes available as `props.data` in the route render function
- Can return a `Response` to bypass layout composition and return directly
- Only executed on GET requests

**Example:**

```ts
export async function loader({ params }: RouteServerContext) {
  return {
    title: `Post ${params.slug}`,
    content: await fetchPost(params.slug),
  };
}
```

#### `action()`

Optional function in `index.server.ts` that handles mutations (POST, PUT, DELETE, PATCH).

```ts
export async function action(context: RouteServerContext): Promise<Response>
```

- **Must return a `Response` in v0** (redirect, error, or full document)
- Executed before route rendering on mutation requests
- Non-Response returns trigger 500 errors

**Example:**

```ts
export async function action({ request, url }: RouteServerContext) {
  const form = await request.formData();
  await saveEntry(form);
  return Response.redirect(new URL("/success", url), 303);
}
```

#### `head()`

Optional function in `index.ts` or `error.ts` that provides document head content.

```ts
export function head(props: RouteProps | ClientErrorProps): HtmlRenderable
```

- Returns HTML to be inserted into `<head>`
- Composed through layouts via `LayoutProps.head`
- Supports `<title>`, `<meta>`, `<link>`, etc.

**Example:**

```ts
export function head(props: RouteProps) {
  return html`<title>${props.data.title}</title>
    <meta name="description" content=${props.data.description} />`;
}
```

### Route Module Exports

#### Route Render (`index.ts`)

```ts
export default function routeName(props: RouteProps): HtmlRenderable {
  return html`<main>...</main>`;
}

// Optional
export function head(props: RouteProps): HtmlRenderable {
  return html`<title>...</title>`;
}
```

#### Layout Render (`layout.ts`)

```ts
export default function layoutName(props: LayoutProps): HtmlRenderable {
  return html`<!doctype html>
    <html>
      <head>${props.head}</head>
      <body>
        <div data-route-outlet>${props.outlet}</div>
      </body>
    </html>`;
}
```

#### Server Route (`index.server.ts`)

```ts
// Option 1: Loader for GET requests
export async function loader(ctx: RouteServerContext) {
  return { data: "value" };
}

// Option 2: Action for mutations
export async function action(ctx: RouteServerContext): Promise<Response> {
  return Response.redirect("/success", 303);
}

// Option 3: Full response guard (bypasses route rendering)
export default async function guard(ctx: RouteServerContext): Promise<Response> {
  if (!authorized) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Must return Response when used
}
```

#### Error Boundaries

Server error boundary (`error.server.ts`):

```ts
export function head(props: ErrorProps): HtmlRenderable {
  return html`<title>Error ${props.status}</title>`;
}

export default function errorBoundary(props: ErrorProps): HtmlRenderable {
  return html`<main>
    <h1>Error ${props.status}</h1>
    <p>${String(props.error)}</p>
  </main>`;
}
```

Client error boundary (`error.ts`):

```ts
export function head(props: ClientErrorProps): HtmlRenderable {
  return html`<title>Error</title>`;
}

export default function errorRecovery(props: ClientErrorProps): HtmlRenderable {
  return html`<section>
    <h1>Recovered</h1>
    <p>${String(props.error)}</p>
  </section>`;
}
```

### Custom Elements

Named exports from `index.ts` or `layout.ts` that are `HTMLElement` subclasses with `static tagName` are automatically registered in the browser.

```ts
export class MyButton extends HTMLElement {
  static tagName = "my-button";

  connectedCallback() {
    this.innerHTML = "<button>Click me</button>";
  }
}

export default function route() {
  return html`<my-button></my-button>`;
}
```

- Registration happens automatically in the browser runtime
- Skipped if `customElements.get(tagName)` already exists
- Must have valid custom element tag name (contains hyphen)
- Stripped from server bundles (never execute on server)

## Deployment

### Node.js with srvx

Elemental generates a Node.js server adapter using [srvx](https://github.com/h3js/srvx).

**Build for Node:**

```bash
npm run build -- --target node
# or build both targets:
npm run build
```

**Output:**
- `dist/server.js` - Main server module
- `dist/srvx.js` - srvx adapter entry
- `dist/assets/*` - Browser assets
- `dist/manifest.json` - Route manifest

**Run in production:**

```bash
node dist/srvx.js
```

**Environment variables:**
- `PORT` - Server port (default: 3000)
- `HOST` - Bind address (default: 0.0.0.0)

**Deployment targets:**
- Any Node.js 24+ hosting platform
- Traditional VPS or bare metal servers
- Container platforms (Docker, Kubernetes)
- PaaS platforms (Heroku, Railway, Render, Fly.io)

**Example Dockerfile:**

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY dist ./dist
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/srvx.js"]
```

### Cloudflare Workers

Elemental generates a Cloudflare Workers adapter with static asset bindings.

**Build for Workers:**

```bash
npm run build -- --target worker
# or build both targets:
npm run build
```

**Output:**
- `dist/worker.js` - Worker entry point
- `dist/wrangler.jsonc` - Generated Wrangler config
- `dist/assets/*` - Browser assets
- `dist/manifest.json` - Route manifest

**Deploy with Wrangler:**

```bash
# Install wrangler if not already installed
npm install -g wrangler

# Deploy from your project root
wrangler deploy dist/worker.js --config dist/wrangler.jsonc
```

**Development with Wrangler:**

```bash
wrangler dev dist/worker.js --config dist/wrangler.jsonc
```

**Wrangler configuration:**

The generated `dist/wrangler.jsonc` includes:
- Asset bindings for static files
- Worker-first routing for SSR requests
- Appropriate build settings

**Environment variables:**

Workers environment variables can be configured via `wrangler.toml` or the Cloudflare dashboard.

**Deployment targets:**
- Cloudflare Workers (global edge network)
- Supports all Workers features (KV, Durable Objects, R2, etc.)

**Limitations:**
- No Node.js built-in modules (uses Web APIs only)
- Build validates Worker-safe code
- Some server-side patterns may need adaptation

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
- [x] `action()` is `Response`-only in v0; non-`Response` returns fail through standard 500 error handling.

## Current Scope Notes

- The default CLI flow builds `spec/fixtures/basic-app/src` today.
- The project is ESM-only.
- `action()` must return a `Response` in v0.
- Browser-reachable modules cannot import `*.server.ts` files.
- `error.ts` is browser-only and is excluded from the server bundle.
- `elemental dev` supports full-page live reload, `layout.css` hot swaps, and safe route-subtree rerenders with automatic fallback to reload when an update crosses an unsafe boundary.
