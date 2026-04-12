# Elemental v0 RFC

## Summary

Elemental v0 is a runtime-SSR meta-framework for native Web Components. It uses filesystem routing, nested layouts, `index.ts` as both the route render module and client component module, route server modules in `index.server.ts`, and `layout.ts` as both the layout render module and layout client component module.

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
- Middleware or request lifecycle hooks. Per-route guards can be implemented using `index.server.ts` default exports, which fully own the route response and can return redirects or error responses before rendering occurs.

---

## CLI

Elemental v0 has no rendering mode option.

```bash
npx elemental
```

Future commands may include development, build, and start flows, but v0 is defined around a single runtime-SSR model.

---

## Project structure

```txt
src/
  layout.ts
  layout.css

  index.ts
  index.server.ts
  home.css

  about/
    index.ts
    index.server.ts
    about.css

  blog/
    [slug]/
      index.ts
      index.server.ts
      post.css
```

### File meanings

- `layout.ts`: layout render module and layout client component module.
- `layout.css`: global stylesheet for a directory layout.
- `index.ts`: route render module and client component module.
- `index.server.ts`: route server module.
- any other `*.css`: scoped CSS module.

Any directory may define its own `layout.ts` and `layout.css`, allowing nested layouts.

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
{ slug: 'hello-world' }
```

Catch-all example:

```ts
{ parts: ['guides', 'install'] }
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
type LayoutRenderProps = {
  content: HtmlResult;
  params: Record<string, string | string[]>;
  url: URL;
};
```

Where:

- `content` is the already-rendered child route or child layout content,
- `params` comes from route matching,
- `url` is the request URL.

### Default export contract

`layout.ts` exports a default function that returns an HTML result using the `html` tagged template helper.

Example:

```ts
import { html } from 'elemental';

export default function layout(props: LayoutRenderProps) {
  return html`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </head>
      <body>
        ${props.content}
      </body>
    </html>
  `;
}
```

A nested layout may return a fragment or subtree wrapper rather than a full document shell.

Example:

```ts
import { html } from 'elemental';

export default function layout(props: LayoutRenderProps) {
  return html`
    <section class="dashboard-layout">
      <nav><el-dashboard-nav></el-dashboard-nav></nav>
      <main>${props.content}</main>
    </section>
  `;
}
```

### Layout composition

For a matched route, Elemental composes output in this order:

1. render the route body from `index.ts`,
2. pass that result as `content` to the nearest parent layout,
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
type RouteRenderProps = {
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

Example:

```ts
import { html } from 'elemental';

export default function component(props: RouteRenderProps) {
  return html`
    <el-blog-post slug="${props.params.slug}"></el-blog-post>
    <el-blog-sidebar></el-blog-sidebar>
  `;
}
```

### Rendering model

Route rendering uses standard JavaScript plus Elemental's tagged template helpers:

```ts
import { html, safeHtml } from 'elemental';
```

This allows normal JavaScript expressions without inventing a custom HTML DSL.

Example:

```ts
import { html } from 'elemental';

export default function component(props: RouteRenderProps) {
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
import { html, safeHtml } from 'elemental';

export default function component(props: RouteRenderProps) {
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
import { html } from 'elemental';
import sheet from './post.css';

export default function component(props: RouteRenderProps) {
  return html`
    <el-blog-post slug="${props.params.slug}"></el-blog-post>
    <el-blog-sidebar></el-blog-sidebar>
  `;
}

export class BlogPost extends HTMLElement {
  static tagName = 'el-blog-post';

  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [sheet];
    // Note: innerHTML is not escaped. Only use with trusted or sanitized content.
    root.innerHTML = `
      <article>
        <h1>${this.getAttribute('slug') ?? ''}</h1>
      </article>
    `;
  }
}

export class BlogSidebar extends HTMLElement {
  static tagName = 'el-blog-sidebar';

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
import { html } from 'elemental';

export default function layout(props: LayoutRenderProps) {
  return html`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </head>
      <body>
        <el-app-shell>
          ${props.content}
        </el-app-shell>
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
import { html } from 'elemental';

export default function layout(props: LayoutRenderProps) {
  return html`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </head>
      <body>
        <el-app-shell>
          ${props.content}
        </el-app-shell>
      </body>
    </html>
  `;
}

export class AppShell extends HTMLElement {
  static tagName = 'el-app-shell';

  connectedCallback() {
    this.setAttribute('ready', '');
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

If the default handler returns a `Response`, it fully owns the route response. No layout composition is applied. This can be used as a per-route guard for authentication, authorization, or redirects.

If a route defines a default export in `index.server.ts`, `loader()` must not also be used in that same route.

### Example: default path

```ts
export async function loader(ctx: RouteServerContext) {
  return {
    slug: ctx.params.slug
  };
}
```

In this case, Elemental executes the default export from `index.ts` using the loader result.

### Example: full response ownership

```ts
export default async function component(ctx: RouteServerContext) {
  return new Response('Unauthorized', { status: 401 });
}
```

In this case, the route bypasses normal `index.ts` rendering and layout composition and returns the custom response directly.

---

## Security boundary

Elemental enforces a strict security boundary between server-only code and isomorphic or browser code through the filesystem convention.

### The `.server.ts` boundary

`index.server.ts` files are never included in the browser bundle. This is not a build-time stripping heuristic — the file is simply excluded from the client bundler's module graph entirely.

This guarantees that:

- database clients, ORMs, and internal service SDKs imported by `loader()` or `action()` never appear in client bundles,
- environment variables and secrets accessed in server modules are never exposed to the browser,
- server-only dependencies and their transitive dependency trees are never shipped to the client.

### Why server code lives in a separate file

Elemental uses build-time heuristics to strip `HTMLElement` subclasses from the server bundle in `index.ts` and `layout.ts`. This is a **correctness** boundary — `HTMLElement` does not exist on the server, so a missed strip causes a build error or server crash.

Server-only code like `loader()` and `action()` involves a fundamentally different boundary. A `loader()` that imports `db.query(...)` or reads `process.env.DATABASE_URL` is valid JavaScript in both environments. If the build fails to strip it from the browser bundle, the failure mode is **silent secret exposure** — not a crash.

By keeping server-only code in `index.server.ts`, the security boundary is a filesystem boundary. No stripping heuristic is needed. The browser bundler never sees the file.

### Bundle isolation rules

| File | Server bundle | Browser bundle |
|---|---|---|
| `index.ts` | Default export included. `HTMLElement` subclass exports excluded. | Default export included. All named exports included. |
| `index.server.ts` | Fully included. | Never included. |
| `layout.ts` | Default export included. `HTMLElement` subclass exports excluded. | Default export included. All named exports included. |
| `layout.css` | Not imported. Injected via asset composition. | Injected as `<link>` tag. |
| `*.css` (non-layout) | Resolves to no-op. | Resolves to `CSSStyleSheet` instance. |

### Author responsibilities

- Never import from `index.server.ts` in `index.ts`, `layout.ts`, or any browser-reachable module. The build should treat such imports as errors.
- Do not place secrets, database access, or internal API calls in `index.ts` or `layout.ts`. These files are included in the browser bundle.
- Use `index.server.ts` for all code that must remain server-only.

---

## Data loading and mutations

### `loader(ctx)`

- Runs for route data loading.
- Used during initial document requests.
- Used during client-side navigations for GET requests.
- Provides data for the default export in `index.ts`.
- Must return a plain, serializable object. The return value becomes `data` in `RouteRenderProps`.
- May return a `Response` to short-circuit rendering (e.g., for redirects or error responses). When a `Response` is returned, layout composition is skipped and the response is sent directly.
- If `loader()` throws, Elemental returns a 500 response. See the error handling section for details.

Example:

```ts
export async function loader({ params }: RouteServerContext) {
  return {
    slug: params.slug,
    title: 'Hello World',
    values: ['a', 'b', 'c']
  };
}
```

### `action(ctx)`

- Handles form submissions and mutations.
- Intended for POST/PUT/PATCH/DELETE-style operations.
- May return redirects, document responses, or mutation results.

Example:

```ts
export async function action(ctx: RouteServerContext) {
  const form = await ctx.request.formData();
  const title = form.get('title');

  await createPost({ title });

  return Response.redirect('/posts', 303);
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
import sheet from './post.css';

class BlogPost extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [sheet];
  }
}
```

Preferred usage is with Shadow DOM and `adoptedStyleSheets`.

### CSS import resolution

- In the browser bundle, `import sheet from './post.css'` resolves to a `CSSStyleSheet` instance.
- In the server bundle, CSS imports resolve to no-ops. Elemental handles CSS injection separately through asset composition.
- TypeScript authors should declare an ambient module for CSS imports:

```ts
// src/env.d.ts
declare module '*.css' {
  const sheet: CSSStyleSheet;
  export default sheet;
}
```

---

## Head management

In v0, the root layout owns the `<head>` element. Routes cannot inject `<title>`, `<meta>`, or other `<head>` content upward into the layout from `index.ts`.

For dynamic head content:

- Static head content (charset, viewport) should be defined in the root layout.
- Route-specific head content can be managed on the client by custom elements that manipulate `document.head` in their `connectedCallback`.

Example:

```ts
export class PageMeta extends HTMLElement {
  static tagName = 'el-page-meta';

  connectedCallback() {
    const title = this.getAttribute('title');
    if (title) document.title = title;
  }
}
```

Used in a route:

```ts
export default function component(props: RouteRenderProps) {
  return html`
    <el-page-meta title="${props.data.title}"></el-page-meta>
    <h1>${props.data.title}</h1>
  `;
}
```

A dedicated `head()` export or server-side head composition may be introduced in a future version.

---

## Error handling

Elemental v0 uses a minimal error model.

### Unmatched routes (404)

If no route matches the request URL, Elemental returns a plain `404 Not Found` response. There is no custom 404 page convention in v0.

### Loader or render errors (500)

If `loader()`, `action()`, or the default export from `index.ts` or `layout.ts` throws during execution, Elemental catches the error and returns a plain `500 Internal Server Error` response. The error is logged to stderr.

Layout composition is not applied to error responses.

### Custom error responses

Routes that need custom error handling can use the `index.server.ts` default export to catch errors and return a custom `Response`:

```ts
export default async function component(ctx: RouteServerContext) {
  try {
    const data = await fetchData(ctx.params.slug);
    return data;
  } catch (err) {
    return new Response('Not Found', { status: 404 });
  }
}
```

### Non-goals for v0

- `error.ts` convention for custom error pages.
- Per-layout error boundaries.
- Granular error recovery.

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
6. execute matched `layout.ts` default exports from leaf to root, passing child content through `content`,
7. inject CSS and scripts,
8. stream the final document,
9. load route and layout modules in the browser,
10. auto-register exported custom elements,
11. upgrade custom elements natively.

If any step (3–6) throws, Elemental returns a `500` response and logs the error. If no route matches at step 1, Elemental returns a `404` response.

The framework does not use virtual DOM hydration. Client-side enhancement is based on native custom element upgrade.

---

## Client navigation and transitions

Elemental v0 includes client-side navigation support.

### Router

The client router is responsible for:

- intercepting same-origin navigations,
- using the Navigation API when available,
- falling back as needed,
- fetching the next full document response,
- extracting and swapping the current route outlet,
- loading route client modules,
- preserving history and redirects.

### Route outlet

The route outlet is the DOM subtree that is replaced during client-side navigations. Elemental identifies the outlet as the element marked with the `data-route-outlet` attribute.

The outermost layout should mark the content insertion point:

```ts
export default function layout(props: LayoutRenderProps) {
  return html`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </head>
      <body>
        <div data-route-outlet>${props.content}</div>
      </body>
    </html>
  `;
}
```

During client navigation, the router fetches the next document, extracts the element with `data-route-outlet`, and replaces the current outlet's contents with the new content.

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

Elemental v0 emits a runtime-oriented build output.

```txt
dist/
  server.js
  assets/*
  manifest.json
```

### Manifest

The manifest describes the route tree and its associated assets:

```ts
type ManifestRoute = {
  pattern: string;
  module: string;
  serverModule?: string;
  layouts: string[];
  assets: {
    css: string[];
    js: string[];
  };
};

type Manifest = {
  routes: Record<string, ManifestRoute>;
};
```

Where:

- keys in `routes` are the route path patterns (e.g., `/`, `/blog/:slug`),
- `pattern` is the URL pattern string,
- `module` is the client bundle path for `index.ts`,
- `serverModule` is the server bundle path for `index.server.ts` (if present),
- `layouts` is an ordered list of layout bundle paths from root to leaf,
- `assets.css` lists all CSS asset paths (layout and route),
- `assets.js` lists all JS asset paths (layout and route).

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
- Filesystem-level security boundary between server-only and browser-reachable code.

---

## Example route

### `src/layout.ts`

```ts
import { html } from 'elemental';

export default function layout(props: LayoutRenderProps) {
  return html`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </head>
      <body>
        <el-app-shell>
          <div data-route-outlet>${props.content}</div>
        </el-app-shell>
      </body>
    </html>
  `;
}

export class AppShell extends HTMLElement {
  static tagName = 'el-app-shell';

  connectedCallback() {
    this.setAttribute('ready', '');
  }
}
```

### `src/blog/[slug]/index.ts`

```ts
import { html } from 'elemental';
import sheet from './post.css';

export default function component(props: RouteRenderProps) {
  return html`
    <el-page-meta title="${props.data.title}"></el-page-meta>
    <el-blog-post slug="${props.params.slug}"></el-blog-post>
    <el-blog-sidebar></el-blog-sidebar>
  `;
}

export class BlogPost extends HTMLElement {
  static tagName = 'el-blog-post';

  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [sheet];
    // Note: innerHTML is not escaped. Only use with trusted or sanitized content.
    root.innerHTML = `
      <article>
        <h1>${this.getAttribute('slug') ?? ''}</h1>
        <p>Upgraded on the client.</p>
      </article>
    `;
  }
}

export class BlogSidebar extends HTMLElement {
  static tagName = 'el-blog-sidebar';

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
    title: 'Hello World'
  };
}
```

---

## Final v0 position

Elemental v0 is a runtime-SSR framework for Web Components where:

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
- error handling is minimal: unmatched routes return 404, thrown errors return 500,
- middleware is a non-goal; per-route guards use `index.server.ts` default exports, and
- the build manifest provides a structured map of routes, modules, and assets.
