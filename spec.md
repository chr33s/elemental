# Elemental Spec

## Summary

Elemental v0 is a runtime-SSR meta-framework for native Web Components where:

- routes are defined by directories containing `index.ts`,
- route rendering is defined primarily by the default export in `index.ts`,
- route logic lives in optional `index.server.ts`,
- layouts are defined by `layout.ts` and `layout.css`,
- layout rendering is defined by the default export in `layout.ts`,
- routing is filesystem-based,
- component tag names are explicit via `static tagName`,
- client registration is automatic in the browser runtime,
- client enhancement happens through native custom element upgrade,
- the `html` helper auto-quotes attribute interpolations and escapes values by default,
- error handling uses nearest-ancestor `error.server.ts` render modules for 404 and uncaught server errors, plus nearest-ancestor `error.ts` browser boundaries for client-side recovery,
- middleware is a non-goal; per-route guards use `index.server.ts` default exports, and
- the build manifest provides a structured map of routes, modules, and assets.

v0 intentionally focuses on a single rendering model: runtime SSR. There is no mode flag in v0.

---

## Goals

- Provide a simple Web Components-first application framework.
- Use runtime SSR as the single rendering model for v0.
- Support filesystem routing with dynamic segments.
- Support nested layouts.
- Support route-level data loading and mutations.
- Use `index.ts` as the default route render module.
- Use `layout.ts` as the default layout render module.
- Support `import { html, safeHtml } from 'elemental';` for route and layout rendering.
- Escape interpolated values by default unless explicitly marked safe.
- Support client-side navigation and route transitions.
- Support native custom element upgrade in the browser.
- Keep component authoring explicit and low-magic.

## Non-goals for v0

- CSR mode.
- SSR prerender mode.
- Tag-name inference from class names or export names.
- Requiring virtual DOM hydration or reconciliation.
- A custom HTML template DSL.
- Preserving already-rendered layout composition during error rendering.
- Per-component error boundaries inside an already-rendered route tree.
- Middleware or request lifecycle hooks. Per-route guards can be implemented using `index.server.ts` default exports, which fully own the route response and can return redirects or error responses before rendering occurs.

---

## CLI

Elemental v0 has no rendering mode option.

```bash
npx elemental
```

Future commands may include development, build, and start flows, but v0 is defined around a single runtime-SSR model.

---

## Stack

Elemental v0 is specified around a fixed runtime and toolchain shape.

### Runtime requirements

- A documented Node.js baseline as the server runtime target for the v0 build output.
- Native Web Components (`HTMLElement`, `customElements`, shadow DOM, and `adoptedStyleSheets`) as the component model.
- Native browser navigation primitives, including the Navigation API and View Transitions API when available, with fallback behavior when unavailable.
- CSS assets for document-level layout styles, plus non-layout CSS modules that resolve to raw CSS on the server and `CSSStyleSheet` instances in the browser.

### Toolchain requirements

- TypeScript as the primary authoring language for the framework and userland route modules.
- An ESM-oriented build pipeline for both server and browser output.
- A compiler/bundler setup that can produce separate server and browser module graphs.
- Import-boundary enforcement that preserves a hard filesystem boundary between browser-reachable modules and `*.server.ts` modules.
- Manifest generation for routes, modules, and emitted assets.

### Locked choices for v0

- The spec locks the required capabilities above, but does not require a specific compiler or bundler implementation.
- Elemental does not define alternate rendering adapters, alternate component models, or alternate client runtime strategies in v0.

---

## Project structure

```txt
src/
  layout.ts
  layout.css
  error.ts
  error.server.ts

  index.ts
  index.server.ts
  home.css

  about/
    index.ts
    index.server.ts
    about.css

  blog/
    error.ts
    error.server.ts
    [slug]/
      index.ts
      index.server.ts
      post.css
```

### File meanings

- `layout.ts`: layout render module and layout client component module.
- `layout.css`: global stylesheet for a directory layout.
- `error.ts`: browser-side subtree error boundary module.
- `error.server.ts`: server-side subtree error render module.
- `index.ts`: route render module and client component module.
- `index.server.ts`: route server module.
- any other `*.css`: scoped CSS module.

Any directory may define its own `layout.ts`, `layout.css`, `error.ts`, and `error.server.ts`, allowing nested layouts plus separate browser-side and server-side error handling.

---

## Route definition

A route is defined by a directory containing `index.ts`.

Examples:

- `src/index.ts` -> `/`
- `src/about/index.ts` -> `/about`
- `src/blog/[slug]/index.ts` -> `/blog/:slug`
- `src/docs/[...parts]/index.ts` -> `/docs/*`

`index.server.ts` is optional.

---

## Routing

Elemental uses filesystem routing.

### Dynamic segments

- `[param]`: single dynamic segment.
- `[...param]`: catch-all dynamic segment.

### Params shape

Single segment example:

```ts
{
  slug: "hello-world";
}
```

Catch-all example:

```ts
{
  parts: ["guides", "install"];
}
```

---

## Nested layouts

Layouts compose from the root directory to the leaf route directory.

Example:

```txt
src/
  layout.ts
  layout.css

  dashboard/
    layout.ts
    layout.css

    settings/
      index.ts
      index.server.ts
      settings.css
```

A request to `/dashboard/settings` uses:

1. the root layout,
2. the dashboard layout,
3. the settings route body from `index.ts`.

Nested layouts compose by wrapping the already-rendered child content from leaf to root.

### Asset composition

For a matched route, Elemental includes all ancestor layout assets in root-to-leaf order, followed by the route's own assets.

This applies to:

- `layout.css`
- browser bundles for `error.ts`
- browser bundles for `layout.ts`
- browser bundles for `index.ts`

---

## Layout render model

`layout.ts` is the default layout render module.

Each matched layout may export a default function that returns an HTML result using the `html` tagged template helper.

A layout receives the already-composed child content and returns the document or layout wrapper for that subtree.

### Layout render props

When Elemental executes the default export from `layout.ts`, it provides:

```ts
type LayoutProps = {
  outlet: HtmlResult;
  head: HtmlResult;
  params: Record<string, string | string[]>;
  url: URL;
};
```

Where:

- `outlet` is the already-rendered child route or child layout content,
- `head` is the composed `<head>` content from the matched route,
- `params` comes from route matching,
- `url` is the request URL.

### Default export contract

`layout.ts` exports a default function that returns an HTML result using the `html` tagged template helper.

Example:

```ts
import { html } from "elemental";

export default function layout(props: LayoutProps) {
  return html`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        ${props.head}
      </head>
      <body>
        ${props.outlet}
      </body>
    </html>
  `;
}
```

A nested layout may return a fragment or subtree wrapper rather than a full document shell.

Example:

```ts
import { html } from "elemental";

export default function layout(props: LayoutProps) {
  return html`
    <section class="dashboard-layout">
      <nav><el-dashboard-nav></el-dashboard-nav></nav>
      <main>${props.outlet}</main>
    </section>
  `;
}
```

### Layout composition

For a matched route, Elemental composes output in this order:

1. render the route body from `index.ts`,
2. pass that result as `outlet` to the nearest parent layout,
3. continue wrapping through each ancestor layout,
4. stream the final rendered document response.

The outermost layout is responsible for returning the full document shell when a full document response is needed.

---

## Route rendering model

`index.ts` is the default route render module.

A route is rendered by:

1. matching the request URL to a route,
2. gathering parent layouts,
3. running `loader()` from `index.server.ts` if present,
4. executing the default export from `index.ts`,
5. composing nested layouts by executing matched `layout.ts` modules from leaf to root,
6. injecting CSS and scripts,
7. streaming the final document response.

This makes `index.ts` the primary source of route body markup, while `layout.ts` defines the surrounding layout structure and document shell.

---

## Route render props

When Elemental executes the default export from `index.ts`, it provides:

```ts
type RouteProps = {
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  url: URL;
};
```

Where:

- `params` comes from route matching,
- `data` comes from `loader(ctx)`,
- `url` is the request URL.

If no `loader()` exists, `data` is an empty object.

---

## `index.ts`

Each route defines its default body renderer in `index.ts`.

### Isomorphic requirement

`index.ts` must be safe to import in both server and browser environments.

Top-level code should avoid direct access to browser-only globals unless guarded.

Elemental compiles separate server and browser bundles from `index.ts`. Named exports that define custom element classes (subclasses of `HTMLElement`) are excluded from the server bundle. The default export is included in both bundles. This means authors write a single file, but the framework ensures that browser-only code such as custom element class bodies does not execute on the server.

### Default export contract

`index.ts` exports a default function that returns an HTML result using the `html` tagged template helper.

To ensure true SSR capabilities for SEO and Fast Contentful Paint (FCP), authors should render the inner HTML directly in the server response (using Declarative Shadow DOM or Light DOM) rather than waiting for client-side `connectedCallback()` hydration.

Example:

```ts
import { html } from "elemental";

export default function route(props: RouteProps) {
  return html`
    <el-blog-post slug="${props.params.slug}">
      <template shadowrootmode="open">
        <article>
          <h1>${props.data.title}</h1>
        </article>
      </template>
    </el-blog-post>
    <el-blog-sidebar></el-blog-sidebar>
  `;
}
```

### Rendering model

Route rendering uses standard JavaScript plus Elemental's tagged template helpers:

```ts
import { html, safeHtml } from "elemental";
```

This allows normal JavaScript expressions without inventing a custom HTML DSL.

Example:

```ts
import { html } from "elemental";

export default function route(props: RouteProps) {
  return html`
    <ul>
      ${props.data.values.map((value) => html`<li>${value}</li>`)}
    </ul>
  `;
}
```

### Escaping

The `html` tagged template escapes interpolated values by default.

Elemental should:

- HTML-escape strings by default,
- auto-quote attribute-position interpolations,
- flatten arrays,
- ignore `null`, `undefined`, and `false`,
- stringify primitive values,
- support nested `html` results,
- allow explicitly trusted HTML through `safeHtml(...)`.

Example:

```ts
import { html, safeHtml } from "elemental";

export default function route(props: RouteProps) {
  return html`
    <h1>${props.data.title}</h1>
    ${props.data.values.map((value) => html`<li>${value}</li>`)}
    ${safeHtml(props.data.descriptionHtml)}
  `;
}
```

`safeHtml(...)` must only be used with trusted content.

### Named exports for client components

`index.ts` may also define named exports for custom element classes.

Any named export that:

- is a subclass of `HTMLElement`, and
- defines a valid `static tagName`

is automatically registered by Elemental in the browser runtime.

Elemental does not infer tag names from class names or export names.

### Tag name requirements

Each auto-registered component must define:

```ts
static tagName = 'el-example-component';
```

The tag name must:

- be a string,
- contain a hyphen,
- be unique within the custom element registry.

### Example

```ts
import { html } from "elemental";
import sheet from "./post.css";

export default function route(props: RouteProps) {
  return html`
    <el-blog-post slug="${props.params.slug}"></el-blog-post>
    <el-blog-sidebar></el-blog-sidebar>
  `;
}

export class BlogPost extends HTMLElement {
  static tagName = "el-blog-post";

  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.adoptedStyleSheets = [sheet];
    // Note: innerHTML is not escaped. Only use with trusted or sanitized content.
    root.innerHTML = `
      <article>
        <h1>${this.getAttribute("slug") ?? ""}</h1>
      </article>
    `;
  }
}

export class BlogSidebar extends HTMLElement {
  static tagName = "el-blog-sidebar";

  connectedCallback() {
    this.innerHTML = `<aside>Sidebar</aside>`;
  }
}
```

### Auto-registration rule

Elemental imports all named exports from `index.ts` and automatically registers every export that matches the component contract in the browser runtime.

Elemental must not redefine an already registered custom element. If a tag name is already present in `customElements`, registration for that class is skipped.

This removes the need for manual `customElements.define(...)` calls in route modules.

Server-side imports of `index.ts` must not attempt to access `customElements`.

---

## `layout.ts`

`layout.ts` is both a layout render module and a layout client component module.

### Isomorphic requirement

`layout.ts` must be safe to import in both server and browser environments.

Top-level code should avoid direct access to browser-only globals unless guarded.

Elemental compiles separate server and browser bundles from `layout.ts`. Named exports that define custom element classes (subclasses of `HTMLElement`) are excluded from the server bundle. The default export is included in both bundles. This means authors write a single file, but the framework ensures that browser-only code such as custom element class bodies does not execute on the server.

### Default export

`layout.ts` may export a default function that returns layout HTML using the `html` tagged template helper.

This default export participates in server-side layout composition.

Example:

```ts
import { html } from "elemental";

export default function layout(props: LayoutProps) {
  return html`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </head>
      <body>
        <el-app-shell> ${props.outlet} </el-app-shell>
      </body>
    </html>
  `;
}
```

### Named exports for layout client components

`layout.ts` may also define named exports for shared custom elements and layout-level browser behavior.

Any named export that:

- is a subclass of `HTMLElement`, and
- defines a valid `static tagName`

is automatically registered by Elemental in the browser runtime using the same rules as route modules.

Example:

```ts
import { html } from "elemental";

export default function layout(props: LayoutProps) {
  return html`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </head>
      <body>
        <el-app-shell> ${props.outlet} </el-app-shell>
      </body>
    </html>
  `;
}

export class AppShell extends HTMLElement {
  static tagName = "el-app-shell";

  connectedCallback() {
    this.setAttribute("ready", "");
  }
}
```

### Auto-registration rule

Elemental imports all named exports from `layout.ts` and automatically registers every export that matches the component contract in the browser runtime.

Elemental must not redefine an already registered custom element. If a tag name is already present in `customElements`, registration for that class is skipped.

Server-side imports of `layout.ts` must not attempt to access `customElements`.

---

## Route server context

When Elemental executes `loader()`, `action()`, or the default export from `index.server.ts`, it provides a context object:

```ts
type RouteServerContext = {
  request: Request;
  params: Record<string, string | string[]>;
  url: URL;
};
```

Where:

- `request` is the incoming `Request` object,
- `params` comes from route matching,
- `url` is the request URL.

---

## Route server module API

Each route may define a `index.server.ts`.

### Named exports

A route server module may export:

- `loader(ctx: RouteServerContext)` for route data loading.
- `action(ctx: RouteServerContext)` for form submissions and mutations.

### Optional default export

A route server module may optionally export a default handler.

The default handler must return a `Response`. When present, it fully owns the route response. No layout composition is applied. This can be used as a per-route guard for authentication, authorization, or redirects.

If a route defines a default export in `index.server.ts`, `loader()` and `action()` must not also be used in that same route.

### Example: default path

```ts
export async function loader(ctx: RouteServerContext) {
  return {
    slug: ctx.params.slug,
  };
}
```

In this case, Elemental executes the default export from `index.ts` using the loader result.

### Example: full response ownership

```ts
export default async function route(ctx: RouteServerContext) {
  return new Response("Unauthorized", { status: 401 });
}
```

In this case, the route bypasses normal `index.ts` rendering and layout composition and returns the custom response directly.

---

## Security boundary

Elemental enforces a strict security boundary between server-only code and isomorphic or browser code through the filesystem convention.

### Server-only file boundaries

`index.server.ts` and `error.server.ts` files are never included in the browser bundle. This is not a build-time stripping heuristic — each file is simply excluded from the client bundler's module graph entirely.

This guarantees that:

- database clients, ORMs, and internal service SDKs imported by `loader()` or `action()` never appear in client bundles,
- server-only helpers imported by `error.server.ts` never appear in client bundles,
- environment variables and secrets accessed in server modules are never exposed to the browser,
- server-only dependencies and their transitive dependency trees are never shipped to the client.

### Why server code lives in a separate file

Elemental uses build-time heuristics to strip `HTMLElement` subclasses from the server bundle in `index.ts` and `layout.ts`. This is a **correctness** boundary — `HTMLElement` does not exist on the server, so a missed strip causes a build error or server crash.

Server-only code like `loader()` and `action()` involves a fundamentally different boundary. A `loader()` that imports `db.query(...)` or reads `process.env.DATABASE_URL` is valid JavaScript in both environments. If the build fails to strip it from the browser bundle, the failure mode is **silent secret exposure** — not a crash.

By keeping server-only code in `index.server.ts` and `error.server.ts`, the security boundary is a filesystem boundary. No stripping heuristic is needed. The browser bundler never sees those files.

### Bundle isolation rules

| File                 | Server bundle                                                     | Browser bundle                                       |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| `error.ts`           | Never included.                                                   | Default export included. All named exports included. |
| `error.server.ts`    | Fully included.                                                   | Never included.                                      |
| `index.ts`           | Default export included. `HTMLElement` subclass exports excluded. | Default export included. All named exports included. |
| `index.server.ts`    | Fully included.                                                   | Never included.                                      |
| `layout.ts`          | Default export included. `HTMLElement` subclass exports excluded. | Default export included. All named exports included. |
| `layout.css`         | Not imported. Injected via asset composition.                     | Injected as `<link>` tag.                            |
| `*.css` (non-layout) | Resolves to raw CSS text.                                         | Resolves to `CSSStyleSheet` instance.                |

### Author responsibilities

- Never import from `index.server.ts` or `error.server.ts` in `index.ts`, `layout.ts`, `error.ts`, or any browser-reachable module. The build should treat such imports as errors.
- Do not place secrets, database access, or internal API calls in `index.ts`, `layout.ts`, or `error.ts`. These files are included in the browser bundle.
- Use `index.server.ts` and `error.server.ts` for code that must remain server-only.

---

## Data loading and mutations

### `loader(ctx)`

- Runs for route data loading.
- Used during initial document requests.
- Used during client-side navigations for GET requests.
- Provides data for the default export in `index.ts`.
- Must return a plain, serializable object. The return value becomes `data` in `RouteProps`.
- May return a `Response` to short-circuit rendering (e.g., for redirects or error responses). When a `Response` is returned, layout composition is skipped and the response is sent directly.
- If `loader()` throws, Elemental returns a 500 response. See the error handling section for details.

Example:

```ts
export async function loader({ params }: RouteServerContext) {
  return {
    slug: params.slug,
    title: "Hello World",
    values: ["a", "b", "c"],
  };
}
```

### `action(ctx)`

- Handles form submissions and mutations.
- Intended for POST/PUT/PATCH/DELETE-style operations.
- Must return a `Response` in v0.
- May return redirects or document responses.
- Non-`Response` mutation result objects are out of scope for v0.

Example:

```ts
export async function action(ctx: RouteServerContext) {
  const form = await ctx.request.formData();
  const title = form.get("title");

  await createPost({ title });

  return Response.redirect("/posts", 303);
}
```

---

## Styling

Styling rules in v0 are:

- `layout.css` is global.
- every other `*.css` file is a scoped CSS module.

### Global CSS

Layout-level CSS files apply globally for their layout scope.

Examples:

- `src/layout.css`
- `src/dashboard/layout.css`

`layout.css` files are not directly importable. Elemental automatically injects them into the document `<head>` as `<link>` tags for all routes within the layout's scope.

### Scoped CSS

Non-layout `*.css` files compile to `CSSStyleSheet` instances for use with `adoptedStyleSheets`.

Example:

```ts
import sheet from "./post.css";

class BlogPost extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.adoptedStyleSheets = [sheet];
  }
}
```

Preferred usage is with Shadow DOM and `adoptedStyleSheets`.

### CSS import resolution

- In the browser bundle, `import sheet from './post.css'` resolves to a `CSSStyleSheet` instance.
- In the server bundle, CSS imports resolve to their string text content. Elemental handles CSS injection automatically, injecting scoped styles as inline `<style>` tags during SSR (either within Declarative Shadow DOM or in the document head) to prevent Flashes of Unstyled Content (FOUC).
- TypeScript authors should declare an ambient module for CSS imports:

```ts
// src/env.d.ts
declare module "*.css" {
  const sheet: CSSStyleSheet | string;
  export default sheet;
}
```

Route and layout modules may branch on the runtime environment when they need to use the same CSS import for both SSR and browser upgrade behavior.

---

## Head management

Routes can inject `<title>`, `<meta>`, and other `<head>` content by exporting a `head()` function from `index.ts`.

Example:

```ts
export function head(props: RouteProps) {
  return html`
    <title>${props.data.title} | My App</title>
    <meta name="description" content="${props.data.description}" />
  `;
}
```

During server rendering, Elemental gathers the matched route's `head()` result and passes it via the `head` property in `LayoutProps`. The layouts then explicitly render `${props.head}` within their document `<head>`. This ensures complete metadata for SEO and social media scrapers on the initial request, while adhering to the framework's principle of explicit contracts over inference.

For subsequent client-side navigations, the router reads the returned head payload and updates the existing document `<head>`.

---

## Error handling

Elemental v0 uses separate nearest-ancestor error conventions for server and browser environments.

### `error.server.ts` convention

Any directory may define an `error.server.ts` file.

`error.server.ts` is a server-only render module for errors within that directory subtree.

When Elemental needs to render a 404 or an uncaught server-side error, it resolves the nearest applicable `error.server.ts` by walking upward from the relevant directory toward `src/`.

### Error render context

When Elemental executes the default export from `error.server.ts`, it provides:

```ts
type ErrorProps = {
  error: unknown;
  status: number;
  statusText: string;
  request: Request;
  params: Record<string, string | string[]>;
  url: URL;
};
```

Where:

- `error` is the thrown value, or `null` for framework-generated 404s,
- `status` is the HTTP status code,
- `statusText` is the HTTP status text,
- `request` is the incoming `Request`,
- `params` comes from route matching when available,
- `url` is the request URL.

### Default export contract

`error.server.ts` exports a default function that returns an HTML result using the `html` tagged template helper.

Example:

```ts
import { html } from "elemental";

export default function error(props: ErrorProps) {
  return html`
    <main>
      <h1>${props.status} ${props.statusText}</h1>
      <p>Please try again.</p>
    </main>
  `;
}
```

### Optional `head()` export

`error.server.ts` may also export a `head(props: ErrorProps)` function.

Example:

```ts
import { html } from "elemental";

export function head(props: ErrorProps) {
  return html`<title>${props.status} ${props.statusText}</title>`;
}
```

### Error response rendering

For initial document requests, Elemental renders the output of `error.server.ts` inside a minimal built-in document shell.

That shell:

- does not execute any `layout.ts` modules,
- renders the result of `error.server.ts` `head()` when present,
- renders the error content inside `data-route-outlet`.

For client-side navigations that receive an error response from the server, Elemental returns the rendered `error.server.ts` subtree through the normal router payload shape, along with the resolved head content and final HTTP status.

### `error.ts` browser boundary convention

Any directory may define an `error.ts` file.

`error.ts` is a browser-side error boundary module for client-side failures within that directory subtree.

It is used for failures that occur after the initial HTML has been delivered, such as:

- client-side route payload processing errors,
- route, layout, or error boundary module loading and evaluation errors,
- router-controlled DOM replacement errors.

`error.ts` does not handle arbitrary userland event-handler errors or general async background task failures.

When the client router needs to recover from a client-side error, it resolves the nearest applicable `error.ts` by walking upward from the target route directory toward `src/`.

### Browser error boundary context

When Elemental executes the default export from `error.ts`, it provides:

```ts
type ClientErrorProps = {
  error: unknown;
  status?: number;
  statusText?: string;
  params: Record<string, string | string[]>;
  url: URL;
};
```

Where:

- `error` is the thrown value,
- `status` and `statusText` are provided when the failure originated from an HTTP response,
- `params` comes from route matching when available,
- `url` is the target URL.

### Browser boundary contract

`error.ts` exports a default function that returns an HTML result using the `html` tagged template helper.

Example:

```ts
import { html } from "elemental";

export default function error(props: ClientErrorProps) {
  return html`
    <main>
      <h1>Something went wrong</h1>
      <p>${props.statusText ?? "Please refresh and try again."}</p>
    </main>
  `;
}
```

`error.ts` may also export a `head(props: ClientErrorProps)` function. When present, the client router uses it to update `document.head` after the boundary renders.

### Browser boundary resolution rules

- For a client-side navigation or module-loading failure, Elemental starts from the target route directory and walks upward toward `src/`, using the first `error.ts` it finds.
- If no applicable `error.ts` exists, the router falls back to a full document navigation to the target URL.
- If the chosen `error.ts` throws while rendering, Elemental logs the error and falls back to a full document navigation to the target URL.

### Resolution rules

- For a matched route that throws on the server, Elemental starts from the failing route directory and walks upward toward `src/`, using the first `error.server.ts` it finds.
- For an unmatched route, Elemental starts from the nearest existing ancestor directory implied by the URL path and walks upward toward `src/`, using the first `error.server.ts` it finds.
- If no applicable `error.server.ts` exists, Elemental falls back to a plain text 404 or 500 response.
- If the chosen `error.server.ts` throws while rendering, Elemental logs the error and falls back to a plain text 500 response.

### Unmatched routes (404)

If no route matches the request URL, Elemental resolves the nearest applicable `error.server.ts` and renders it with `status: 404` and `statusText: "Not Found"`.

If no applicable `error.server.ts` exists, Elemental returns a plain `404 Not Found` response.

### Loader or render errors (500)

If `index.server.ts` default export, `loader()`, `action()`, or the default export from `index.ts` or `layout.ts` throws during execution, Elemental resolves the nearest applicable `error.server.ts` and renders it with `status: 500` and `statusText: "Internal Server Error"`. The error is logged to stderr.

Layout composition is never applied to error responses.

### Explicit responses

Returned `Response` objects bypass `error.server.ts`.

This applies to:

- the default export from `index.server.ts`,
- `loader()` when it returns a `Response`,
- `action()` when it returns a `Response`.

This allows redirects, authorization failures, and other explicit responses to fully own the result.

Example:

```ts
export default async function route(ctx: RouteServerContext) {
  return new Response("Unauthorized", { status: 401 });
}
```

### Non-goals for v0

- Granular error recovery.
- Recovery that preserves already-rendered parent layouts.
- Catching arbitrary userland event-handler errors with framework-managed browser boundaries.

These may be introduced in a future version.

---

## Runtime SSR model

Elemental v0 uses runtime SSR only.

A request flows through the framework as follows:

1. match the request URL to a route,
2. gather parent layouts,
3. if `index.server.ts` default export exists, execute it and return its `Response` directly,
4. otherwise run `loader()` if present,
5. execute the default export from `index.ts`,
6. execute matched `layout.ts` default exports from leaf to root, passing child content through `outlet`,
7. inject CSS and scripts,
8. stream the final document or partial router payload,
9. load route, layout, and `error.ts` boundary modules in the browser,
10. auto-register exported custom elements,
11. upgrade custom elements natively.

If step 1 does not find a route, Elemental resolves and renders the nearest applicable `error.server.ts` with a 404 response.

If any step (3–6) throws, Elemental logs the error, resolves the nearest applicable `error.server.ts`, and renders it with a 500 response.

If no applicable `error.server.ts` exists, Elemental falls back to a plain text 404 or 500 response.

The framework does not use virtual DOM hydration. Client-side enhancement is based on native custom element upgrade.

---

## Client navigation and transitions

Elemental v0 includes client-side navigation support.

### Router

The client router is responsible for:

- intercepting same-origin navigations,
- using the Navigation API when available,
- falling back as needed,
- fetching the next route payload (sending an `X-Elemental-Router: true` header),
- extracting and swapping the current route outlet subtree,
- loading route and browser error boundary modules,
- rendering error payloads for 404 and 500 navigations,
- resolving `error.ts` boundaries for client-side failures,
- updating document head state,
- preserving history and redirects.

### Routing efficiency

To minimize wasted CPU and bandwidth during client navigations, the router sends an `X-Elemental-Router: true` header. When the server detects this header, it returns a structured partial payload instead of a full document. The payload includes:

- the fully composed subtree that belongs inside `data-route-outlet`, including any nested layouts beneath the outermost document shell, or the resolved `error.server.ts` subtree when navigation ends in a server-rendered error,
- the route's resolved `<head>` content,
- the final HTTP status,
- the CSS and JS assets needed for the target route.

This avoids generating and parsing a full document shell while preserving correct nested-layout behavior.

If a client-side navigation fails after the payload has been received, the router resolves the nearest applicable `error.ts` and renders it into `data-route-outlet`. If no boundary exists, the router falls back to a full document navigation.

### Route outlet

The route outlet is the DOM subtree that is replaced during client-side navigations. Elemental identifies the outlet as the element marked with the `data-route-outlet` attribute.

The outermost layout should mark the content insertion point:

```ts
export default function layout(props: LayoutProps) {
  return html`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        ${props.head}
      </head>
      <body>
        <div data-route-outlet>${props.outlet}</div>
      </body>
    </html>
  `;
}
```

During client navigation, the router fetches the next route payload, extracts the rendered subtree intended for `data-route-outlet`, and replaces the current outlet's contents with the new content.

### Route transitions

Route transitions are supported during client navigation.

Preferred implementation:

- use the View Transitions API when available,
- fall back to non-animated DOM replacement otherwise.

---

## Forms and mutations

Forms are progressively enhanced.

- Without client enhancement, standard document submission still works through `action(ctx)`.
- With client enhancement, submissions may be intercepted and handled through the client router.

This preserves standard HTML form behavior while allowing richer client navigation flows.

---

## Output

Elemental v0 emits a runtime-oriented build output with shared route metadata plus target-specific runtime entries.

```txt
dist/
  index.js
  cli.js
  server.js
  server/*
  srvx.js
  worker.js
  wrangler.jsonc
  assets/*
  manifest.json
```

`server.js`, `server/*`, `assets/*`, and `manifest.json` are the shared build artifacts. `srvx.js` is the Node adapter entry, while `worker.js` and `wrangler.jsonc` are emitted for the Worker target.

### Manifest

The manifest describes the discovered app root, client entrypoint, route tree, browser bundles, server bundles, and emitted assets:

```ts
type ManifestRoute = {
  source: string;
  serverSource?: string;
  pattern: string;
  errorBoundaries: string[];
  serverErrorBoundaries: string[];
  layouts: string[];
  layoutStylesheets: string[];
  browser: {
    route: string;
    layouts: string[];
    errorBoundaries: string[];
  };
  server: {
    route: string;
    routeServer?: string;
    layouts: string[];
    serverErrorBoundaries: string[];
  };
  assets: {
    css?: string[];
    js?: string[];
    layoutCss?: string[];
    scripts?: string[];
  };
};

type Manifest = {
  appDir: string;
  assets: {
    clientEntry?: string;
  };
  generatedAt: string;
  routes: ManifestRoute[];
};
```

Where:

- `appDir` is the discovered application root relative to the build root,
- `assets.clientEntry` is the browser bootstrap bundle path,
- `generatedAt` records when the manifest was emitted,
- `routes` is an ordered array in route-match precedence,
- `pattern` is the URL pattern string,
- `source` is the route `index.ts` source path,
- `serverSource` is the route `index.server.ts` source path when present,
- `errorBoundaries`, `serverErrorBoundaries`, `layouts`, and `layoutStylesheets` are ordered source-path ancestry lists from root to leaf,
- `browser.route` is the browser bundle path for `index.ts`,
- `browser.layouts` and `browser.errorBoundaries` are browser bundle paths for matched layouts and browser error boundaries,
- `server.route` is the server bundle path for `index.ts`,
- `server.routeServer` is the server bundle path for `index.server.ts` when present,
- `server.layouts` and `server.serverErrorBoundaries` are server bundle paths for matched layouts and server error boundaries,
- `assets.css` and `assets.layoutCss` list emitted stylesheet asset paths,
- `assets.js` and `assets.scripts` list emitted browser script asset paths.

---

## Design principles

- Web Components first.
- Explicit contracts over inference.
- Runtime SSR as the single v0 model.
- Unified route render and component module through `index.ts`.
- Unified layout render and component module through `layout.ts`.
- `html` and `safeHtml` instead of a custom HTML DSL.
- Escaped-by-default template interpolation.
- Auto-quoted attribute-position interpolations.
- Native browser upgrade over virtual DOM hydration.
- Scoped styling by default.
- Convention first, with `index.server.ts` default export as a full-response escape hatch.
- Separate `error.server.ts` and `error.ts` conventions for server and browser error recovery.
- Filesystem-level security boundary between server-only and browser-reachable code.

---

## Example route

### `src/layout.ts`

```ts
import { html } from "elemental";

export default function layout(props: LayoutProps) {
  return html`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        ${props.head}
      </head>
      <body>
        <el-app-shell>
          <div data-route-outlet>${props.outlet}</div>
        </el-app-shell>
      </body>
    </html>
  `;
}

export class AppShell extends HTMLElement {
  static tagName = "el-app-shell";

  connectedCallback() {
    this.setAttribute("ready", "");
  }
}
```

### `src/blog/[slug]/index.ts`

```ts
import { html } from "elemental";
import sheet from "./post.css";

export function head(props: RouteProps) {
  return html`<title>${props.data.title} | Blog</title>`;
}

export default function route(props: RouteProps) {
  return html`
    <el-blog-post slug="${props.params.slug}">
      <template shadowrootmode="open">
        <style>
          ${typeof sheet === "string" ? sheet : ""}
        </style>
        <article>
          <h1>${props.data.title}</h1>
          <p>Rendered on the server, upgraded on the client.</p>
        </article>
      </template>
    </el-blog-post>
    <el-blog-sidebar></el-blog-sidebar>
  `;
}

export class BlogPost extends HTMLElement {
  static tagName = "el-blog-post";

  connectedCallback() {
    // Automatically picks up the Declarative Shadow DOM
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    if (sheet instanceof CSSStyleSheet) {
      root.adoptedStyleSheets = [sheet];
    }
  }
}

export class BlogSidebar extends HTMLElement {
  static tagName = "el-blog-sidebar";

  connectedCallback() {
    this.innerHTML = `<aside>Sidebar</aside>`;
  }
}
```

### `src/blog/[slug]/index.server.ts`

```ts
export async function loader({ params }: RouteServerContext) {
  return {
    slug: params.slug,
    title: "Hello World",
  };
}
```
