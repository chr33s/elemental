# Elemental v0 RFC

## Summary

Elemental v0 is a runtime-SSR meta-framework for native Web Components. It uses filesystem routing, nested layouts, `client.ts` as both the route template module and client component module, route server modules for data loading and mutations, native custom element upgrade on the client, and explicit custom element registration conventions.

v0 intentionally focuses on a single rendering model: runtime SSR. There is no mode flag in v0.

---

## Goals

- Provide a simple Web Components-first application framework.
- Use runtime SSR as the single rendering model for v0.
- Support filesystem routing with dynamic segments.
- Support nested layouts.
- Support route-level data loading and mutations.
- Use `client.ts` as the default route body template module.
- Support standard JavaScript template literal rendering for route templates.
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

  server.ts
  client.ts
  home.css

  about/
    server.ts
    client.ts
    about.css

  blog/
    [slug]/
      server.ts
      client.ts
      post.css
```

### File meanings

- `layout.html`: HTML shell template for a directory layout.
- `layout.ts`: client runtime/setup for a directory layout.
- `layout.css`: global stylesheet for a directory layout.
- `server.ts`: route server module.
- `client.ts`: route template and client component module.
- any other `*.css`: scoped CSS module.

Any directory may define its own `layout.html`, `layout.ts`, and `layout.css`, allowing nested layouts.

---

## Routing

Elemental uses filesystem routing.

### Route mapping examples

- `src/client.ts` -> `/`
- `src/about/client.ts` -> `/about`
- `src/blog/[slug]/client.ts` -> `/blog/:slug`
- `src/docs/[...parts]/client.ts` -> `/docs/*`

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
      server.ts
      client.ts
      settings.css
```

A request to `/dashboard/settings` uses:

1. the root layout,
2. the dashboard layout,
3. the settings route body from `client.ts`.

Nested layouts compose their body outlet via the same marker used by the root shell.

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

`client.ts` is the default route body template module.

A route is rendered by:

1. matching the request URL to a route,
2. gathering parent layouts,
3. loading route data through `server.ts` if present,
4. executing the default export from `client.ts`,
5. composing nested layouts,
6. injecting CSS and scripts,
7. streaming the final document response.

This makes `client.ts` the primary source of route markup, while `server.ts` supplies logic and control.

---

## `client.ts`

Each route defines its default body renderer in `client.ts`.

### Default export contract

`client.ts` exports a default function that returns an HTML string.

Example:

```ts
export default function component(props) {
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
export default function component(props) {
  return `
    <ul>
      ${props.data.values.map((value) => `<li>${value}</li>`).join('')}
    </ul>
  `;
}
```

This avoids inventing a custom HTML DSL and keeps advanced rendering in plain JavaScript.

### Named exports for client components

`client.ts` may also define named exports for custom element classes.

Any named export that:

- is a subclass of `HTMLElement`, and
- defines a valid `static tagName`

is automatically registered by Elemental on the client.

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

export default function component(props) {
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

Elemental imports all named exports from `client.ts` and automatically registers every export that matches the component contract.

This removes the need for manual `customElements.define(...)` calls in route client modules.

---

## Route server module API

Each route may define a `server.ts`.

### Named exports

A route server module may export:

- `loader(ctx)` for route data loading.
- `action(ctx)` for form submissions and mutations.

### Optional default export

A route server module may optionally export a default handler that returns a `Response`.

If present, the default export is an escape hatch for full response control.

If absent, Elemental renders the default export from `client.ts` automatically.

### Example: default path

```ts
export async function loader(ctx) {
  return {
    slug: ctx.params.slug
  };
}
```

In this case, Elemental executes the default export from `client.ts` using the loader result.

### Example: escape hatch

```ts
export default async function Component(ctx) {
  return new Response('Unauthorized', { status: 401 });
}
```

In this case, the route bypasses default `client.ts` rendering and returns the custom response directly.

---

## Default route rendering contract

If a route does not export a default server handler, Elemental renders the default export from `client.ts` into a `Response` automatically.

That default render pipeline is:

1. run `loader(ctx)` if present,
2. collect `params` and loader `data`,
3. execute the default export from `client.ts`,
4. compose layouts,
5. produce the final `Response`.

This allows most routes to avoid manual response construction.

---

## Route context

Recommended route context shape:

```ts
type RouteContext = {
  request: Request;
  url: URL;
  params: Record<string, string | string[]>;
  assets: {
    js: string[];
    css: string[];
  };
};
```

This shape may evolve, but `request`, `url`, and `params` are core to the v0 contract.

---

## Template props model

When executing the default export from `client.ts`, Elemental provides a props object containing:

- `params`
- `data`

Example:

```ts
export default function component(props) {
  return `
    <el-blog-post
      slug="${props.params.slug}"
      title="${props.data.title}">
    </el-blog-post>
  `;
}
```

Where:

- `params` comes from route matching,
- `data` comes from `loader(ctx)`.

If no `loader()` exists, `data` is an empty object.

---

## Data loading and mutations

### `loader(ctx)`

- Runs for route data loading.
- Used during initial document requests.
- Used during client-side navigations for GET requests.
- Provides data for the default export in `client.ts`.

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

Route/component CSS files are scoped modules and are intended to be imported by component modules.

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
4. execute the default export from `client.ts` unless a custom default response handler overrides it,
5. compose nested layouts,
6. inject CSS and scripts into shell markers,
7. stream the final document,
8. load client modules in the browser,
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
- loading the next route document/data,
- swapping the current route outlet,
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
- Unified route template and component module through `client.ts`.
- Standard JavaScript template literal rendering instead of a custom HTML DSL.
- Native browser upgrade over virtual DOM hydration.
- Scoped styling by default.
- Convention first, with `server.ts` default export as an escape hatch.

---

## Example route

### `src/blog/[slug]/client.ts`

```ts
import sheet from './post.css';

export default function component(props) {
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

- routes are defined primarily by the default export in `client.ts`,
- route logic lives in `server.ts`,
- layouts are defined by `layout.html`, `layout.ts`, and `layout.css`,
- routing is filesystem-based,
- component tag names are explicit via `static tagName`,
- client registration is automatic, and
- client enhancement happens through native custom element upgrade.