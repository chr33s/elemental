# Elemental v0 RFC

## Summary

Elemental v0 is a runtime-SSR meta-framework for native Web Components. It uses filesystem routing, nested layouts, `index.ts` as both the route render module and client component module, route server modules for data loading and mutations, native custom element upgrade on the client, and explicit custom element registration conventions.

v0 intentionally focuses on a single rendering model: runtime SSR. There is no mode flag in v0.

---

## Goals

- Provide a simple Web Components-first application framework.
- Use runtime SSR as the single rendering model for v0.
- Support filesystem routing with dynamic segments.
- Support nested layouts.
- Support route-level data loading and mutations.
- Use `index.ts` as the default route render module.
- Support standard JavaScript template literal rendering for route templates.
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
  layout.html
  layout.ts
  layout.css

  index.ts
  server.ts
  home.css

  about/
    index.ts
    server.ts
    about.css

  blog/
    [slug]/
      index.ts
      server.ts
      post.css
```

### File meanings

- `layout.html`: HTML shell template for a directory layout.
- `layout.ts`: client runtime/setup for a directory layout.
- `layout.css`: global stylesheet for a directory layout.
- `index.ts`: route render module and client component module.
- `server.ts`: route server module.
- any other `*.css`: scoped CSS module.

Any directory may define its own `layout.html`, `layout.ts`, and `layout.css`, allowing nested layouts.

---

## Route definition

A route is defined by a directory containing `index.ts`.

Examples:

- `src/index.ts` -> `/`
- `src/about/index.ts` -> `/about`
- `src/blog/[slug]/index.ts` -> `/blog/:slug`
- `src/docs/[...parts]/index.ts` -> `/docs/*`

`server.ts` is optional.

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
  layout.html
  layout.ts
  layout.css

  dashboard/
    layout.html
    layout.ts
    layout.css

    settings/
      index.ts
      server.ts
      settings.css
```

A request to `/dashboard/settings` uses:

1. the root layout,
2. the dashboard layout,
3. the settings route body from `index.ts`.

Nested layouts compose their body outlet via the same marker used by the root shell.

### Asset composition

For a matched route, Elemental includes all ancestor layout assets in root-to-leaf order, followed by the route’s own assets.

This applies to:

- `layout.css`
- `layout.ts`

---

## Shell markers

Elemental recognizes the following markers in layout HTML:

- `<!--elemental-head-->`
- `<!--elemental-body-->`
- `<!--elemental-scripts-->`

Example `layout.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <!--elemental-head-->
  </head>
  <body>
    <!--elemental-body-->
    <!--elemental-scripts-->
  </body>
</html>
```

The framework injects CSS, rendered body content, and client scripts through these markers.

---

## Route rendering model

`index.ts` is the default route render module.

A route is rendered by:

1. matching the request URL to a route,
2. gathering parent layouts,
3. loading route data through `server.ts` if present,
4. executing the default export from `index.ts`,
5. composing nested layouts,
6. injecting CSS and scripts,
7. streaming the final document response.

This makes `index.ts` the primary source of route markup, while `server.ts` supplies logic and control.

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
- `data` comes from `loader(ctx)` or a non-`Response` default export from `server.ts`,
- `url` is the request URL.

If neither `loader()` nor a non-`Response` default export exists, `data` is an empty object.

---

## `index.ts`

Each route defines its default body renderer in `index.ts`.

### Isomorphic requirement

`index.ts` must be safe to import in both server and browser environments.

Top-level code should avoid direct access to browser-only globals unless guarded.

### Default export contract

`index.ts` exports a default function that returns an HTML string.

Example:

```ts
export default function component(props: RouteRenderProps) {
  return `
    <el-blog-post slug="${props.params.slug}"></el-blog-post>
    <el-blog-sidebar></el-blog-sidebar>
  `;
}
```

### Rendering model

The default export uses standard JavaScript and template literals.

This allows normal JavaScript expressions, such as:

```ts
export default function component(props: RouteRenderProps) {
  return `
    <ul>
      ${props.data.values.map((value) => `<li>${value}</li>`).join('')}
    </ul>
  `;
}
```

This avoids inventing a custom HTML DSL and keeps advanced rendering in plain JavaScript.

### Escaping

Interpolated values are HTML-escaped by default in v0 unless explicitly marked safe.

For example, plain string interpolation is escaped before insertion into the final HTML output.

Elemental should provide an explicit safe-marking mechanism for trusted HTML, such as a helper like `safeHtml(...)`.

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
import sheet from './post.css';

export default function component(props: RouteRenderProps) {
  return `
    <el-blog-post slug="${props.params.slug}"></el-blog-post>
    <el-blog-sidebar></el-blog-sidebar>
  `;
}

export class BlogPost extends HTMLElement {
  static tagName = 'el-blog-post';

  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [sheet];
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

This removes the need for manual `customElements.define(...)` calls in route modules.

Server-side imports of `index.ts` must not attempt to access `customElements`.

---

## Route server module API

Each route may define a `server.ts`.

### Named exports

A route server module may export:

- `loader(ctx)` for route data loading.
- `action(ctx)` for form submissions and mutations.

### Optional default export

A route server module may optionally export a default handler.

If the default handler returns a `Response`, it fully owns the route response.

If the default handler does not return a `Response`, Elemental uses that return value as route data input to the normal `index.ts` render pipeline.

### Example: default path

```ts
export async function loader(ctx) {
  return {
    slug: ctx.params.slug
  };
}
```

In this case, Elemental executes the default export from `index.ts` using the loader result.

### Example: full response ownership

```ts
export default async function Component(ctx) {
  return new Response('Unauthorized', { status: 401 });
}
```

In this case, the route bypasses normal `index.ts` rendering and returns the custom response directly.

### Example: non-Response override data

```ts
export default async function Component(ctx) {
  return {
    title: 'Hello World'
  };
}
```

In this case, Elemental continues through the normal `index.ts` render pipeline using the returned value.

---

## Data loading and mutations

### `loader(ctx)`

- Runs for route data loading.
- Used during initial document requests.
- Used during client-side navigations for GET requests.
- Provides data for the default export in `index.ts`.

Example:

```ts
export async function loader({ params }) {
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
export async function action(ctx) {
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

---

## Runtime SSR model

Elemental v0 uses runtime SSR only.

A request flows through the framework as follows:

1. match the request URL to a route,
2. gather parent layouts,
3. run `loader()` if present,
4. execute the default export from `index.ts` unless a `Response` returned from `server.ts` overrides it,
5. compose nested layouts,
6. inject CSS and scripts into shell markers,
7. stream the final document,
8. load route and layout modules in the browser,
9. auto-register exported custom elements,
10. upgrade custom elements natively.

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

Possible manifest contents include route metadata and asset mappings.

---

## Design principles

- Web Components first.
- Explicit contracts over inference.
- Runtime SSR as the single v0 model.
- Unified route render and component module through `index.ts`.
- Standard JavaScript template literal rendering instead of a custom HTML DSL.
- Escaped-by-default template interpolation.
- Native browser upgrade over virtual DOM hydration.
- Scoped styling by default.
- Convention first, with `server.ts` default export as an escape hatch.

---

## Example route

### `src/blog/[slug]/index.ts`

```ts
import sheet from './post.css';

export default function component(props: RouteRenderProps) {
  return `
    <el-blog-post slug="${props.params.slug}"></el-blog-post>
    <el-blog-sidebar></el-blog-sidebar>
  `;
}

export class BlogPost extends HTMLElement {
  static tagName = 'el-blog-post';

  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [sheet];
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

### `src/blog/[slug]/server.ts`

```ts
export async function loader({ params }) {
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
- route logic lives in optional `server.ts`,
- layouts are defined by `layout.html`, `layout.ts`, and `layout.css`,
- routing is filesystem-based,
- component tag names are explicit via `static tagName`,
- client registration is automatic in the browser runtime, and
- client enhancement happens through native custom element upgrade.