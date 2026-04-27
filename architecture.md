# Elemental Architecture

This document describes the actual implementation structure of Elemental v0 after the runtime and build refactor that split the original monolithic modules into smaller build and runtime units.

## Overview

The Elemental framework is organized into four main areas:

1. **Build system** (`src/build/`) - Route discovery, bundling, manifest generation
2. **Runtime** (`src/runtime/`) - Server SSR, client navigation, shared utilities
3. **Development** (`src/dev/`) - Watch mode, live reload, HMR
4. **CLI** (`src/cli/`) - Command-line interface

## Actual Structure

```
src/
  cli/
    index.ts                    # CLI entry point
  build/
    index.ts                    # Main build orchestration
    discover.ts                 # Route discovery and validation
    manifest.ts                 # Manifest types and writing
    oxc.ts                      # AST transforms (strip custom elements)
    plugins/
      css.ts                    # CSS import handling for browser/server targets
      server-boundary.ts        # Browser and worker import-boundary enforcement
      strip-custom-elements.ts  # Server bundle transform for HTMLElement exports
  dev/
    index.ts                    # Development server with HMR
  runtime/
    client/
      bootstrap.ts              # Client runtime entrypoint and public helper re-exports
      dev-client.ts             # Development client (SSE, HMR)
      errors.ts                 # Client-side error recovery
      forms.ts                  # Same-origin form interception helpers
      head.ts                   # Managed head and stylesheet synchronization
      navigation.ts             # Client navigation, DSD-aware swaps, and document replacement flow
      register-elements.ts      # Custom element detection and registration
    server/
      app.ts                    # Server exports (public API)
      assets.ts                 # Asset resolution and managed head composition
      core.ts                   # Core server runtime orchestration
      errors.ts                 # Server error-boundary rendering
      node.ts                   # Node.js adapter (srvx)
      render-document.ts        # Document and partial rendering
      render-partial.ts         # Partial payload detection and JSON responses
      routing.ts                # Route execution and layout composition
      worker.ts                 # Cloudflare Workers adapter
    shared/
      browser-runtime.ts        # Browser runtime constants
      error-boundaries.ts       # Error boundary resolution
      html.ts                   # HTML tagged template, escaping, cssText, and DSD helper
      responses.ts              # Shared HTML and text response helpers
      routes.ts                 # Route matching utilities
      types.ts                  # Shared TypeScript types
  types/
    css.d.ts                    # CSS module type declarations
  index.ts                      # Public package exports
```

## Differences from Plan

The current structure is closer to the original `plan.md` proposal than the first v0 implementation. The main differences are now about a few extra support modules rather than large consolidations.

### 1. Build Plugins

**Plan Expected:**

```
src/build/plugins/
  css.ts
  server-boundary.ts
  strip-custom-elements.ts
```

**Actual Implementation:**

Build plugins now live in `src/build/plugins/`:

- `createBrowserServerBoundaryPlugin()` - Prevents browser code from importing `.server.ts`
- `createCssModulePlugin()` - Handles CSS imports differently for browser/server
- `createServerBundleTransformPlugin()` - Strips custom element exports from server bundles
- `createWorkerRuntimeValidationPlugin()` - Validates Worker-safe code

**Rationale:**

- Plugin concerns are isolated and easier to scan during build debugging
- The build entrypoint now stays focused on orchestration instead of esbuild callback bodies
- Worker validation remains grouped with server-boundary enforcement because both are build-time import-boundary checks

**Impact:** Low - improves navigation without changing the build contract

### 2. Client Runtime

**Plan Expected:**

```
src/runtime/client/
  bootstrap.ts
  navigation.ts
  head.ts
  forms.ts
  register-elements.ts
```

**Actual Implementation:**

The client runtime is split by responsibility:

- `bootstrap.ts` wires startup and exposes the browser runtime API
- `navigation.ts` owns client transitions, partial payload application, DSD-aware outlet insertion, and document fallbacks
- `head.ts` owns managed `<head>` markers and stylesheet synchronization
- `forms.ts` owns request shaping for enhanced same-origin forms
- `register-elements.ts` owns custom element collection and registration

**Rationale:**

- The browser runtime still behaves as one cohesive system, but the files now align with the main responsibilities in the plan
- Test-facing helpers stay reachable through `bootstrap.ts` via re-exports, so the public surface does not change
- Navigation remains the coordinator, while head/forms/registration stay reusable and smaller
- Declarative Shadow DOM payloads stay inside the navigation boundary: DSD-bearing partial responses use native fragment parsing when available and fall back to full document navigation when unavailable

**Impact:** Medium - easier maintenance and clearer internal ownership

### 3. Server Runtime

**Plan Expected:**

```
src/runtime/server/
  app.ts
  render-document.ts
  render-partial.ts
  errors.ts
  routing.ts
  assets.ts
```

**Actual Implementation:**

Server runtime is split into:

- `app.ts` - Public exports only (re-exports from other modules)
- `core.ts` - Request orchestration and top-level request routing
- `routing.ts` - Route execution, layout composition, and document/partial rendering paths
- `errors.ts` - Nearest-boundary server error rendering and fallback handling
- `assets.ts` - Route asset resolution and managed head composition
- `render-document.ts` - Document and outlet rendering
- `render-partial.ts` - Router-payload detection and JSON response helpers
- `node.ts` - Node.js adapter
- `worker.ts` - Cloudflare Workers adapter

Document and server-error HTML responses stream UTF-8 chunks through the shared HTML response helper instead of collapsing the full document into one final string before creating the `Response`.

**Rationale:**

- The host-agnostic request pipeline stays in `core.ts`, but rendering concerns now live in dedicated modules
- Error rendering, route rendering, and partial-response shaping have distinct contracts and test surfaces
- Adapters remain deployment-target-specific and unchanged

**Impact:** Medium - request orchestration stays centralized while rendering logic is easier to reason about

### 4. Shared Responses Module

**Plan Expected:**

- `src/runtime/shared/responses.ts`

**Actual Implementation:**

`src/runtime/shared/responses.ts` now contains the small shared HTML and plain-text response helpers used by the server runtime.

**Rationale:**

- The helper count is still small, but centralizing them avoids duplicating content-type setup across routing and error paths
- This also brings the runtime layout closer to the plan without inventing unnecessary abstractions

**Impact:** Low - mostly organizational, with slightly cleaner server modules

## Module Organization Principles

The actual implementation follows these principles:

1. **Cohesion over file count** - Keep tightly coupled code together
2. **Avoid circular dependencies** - Structure prevents import cycles
3. **Clear boundaries** - Public APIs, build tools, runtime, and dev are well-separated
4. **Size threshold** - Split when modules exceed ~600 lines or when logical boundaries emerge

## Plugin Architecture

### Build Plugins

Elemental uses esbuild plugins for build-time transforms:

1. **Browser Server Boundary** - Prevents `.server.ts` imports in browser code
   - Runs during browser bundle resolution
   - Fails build with clear error message

2. **CSS Module** - Handles CSS imports
   - Browser: transforms to `CSSStyleSheet` instances
   - Server: transforms to raw CSS text via `cssText()`
   - Rejects direct `layout.css` imports

3. **Server Bundle Transform** - Strips custom elements
   - Uses oxc parser for AST-based transforms
   - Removes named HTMLElement exports
   - Preserves default exports and other code

4. **Worker Runtime Validation** - Validates Worker-safe code
   - Prevents Node.js built-in imports in Worker-reachable code
   - Only runs for Worker target builds

### Why Separate Files?

- The extracted plugin files match the build responsibilities described in the plan
- The orchestration file now highlights the overall build flow instead of implementation detail
- Individual plugin behavior is easier to inspect when a build error points at a specific concern

## Error Handling Architecture

Error handling has two distinct paths:

### Server-Side (`error.server.ts`)

```
Request → Error → Find nearest error.server.ts → Render in minimal shell → Response
```

- Used for 404 (unmatched routes) and 500 (server errors)
- Does NOT compose with layouts
- Renders inside framework-owned minimal document shell
- Falls back to plain text if error boundary throws

### Client-Side (`error.ts`)

```
Navigation → Error → Find nearest error.ts → Render in outlet → Update head
```

- Used for client navigation failures and module load errors
- Renders in `data-route-outlet` (preserves document shell)
- Can update head via `head()` export
- Falls back to full page reload if error boundary throws

## Development Mode Architecture

`elemental dev` orchestrates three separate systems:

1. **Build watcher** - Monitors source files, triggers rebuilds
2. **Server process** - Runs generated `dist/server.js`, restarts on changes
3. **Dev client** - Browser SSE client, handles live reload and HMR

### Update Flow

```
File change → Rebuild → Server restart → SSE notification → Browser update
                                            |
                                            v
                                    [reload | css | route]
```

### Update Strategies

- **reload** - Full page reload for:
  - Server contract changes (`.server.ts`)
  - Route graph changes (new routes, deleted routes)
  - Framework runtime changes
  - Custom element definition changes

- **css** - Hot swap for:
  - `layout.css` changes

- **route** - Subtree rerender for:
  - Route module changes (`index.ts`, `layout.ts`, `error.ts`)
  - Dependencies of route modules

## Deployment Architecture

### Shared Core

Both Node and Worker targets use the same:

- Route discovery
- Browser asset generation
- Manifest structure
- Server runtime core (host-agnostic)

### Node Target

```
dist/
  server.js       # Server modules bundle
  srvx.js         # srvx adapter entry
  assets/         # Browser assets
  manifest.json   # Route manifest
```

- Uses filesystem for asset serving
- Dynamic imports for server modules
- Native Node.js APIs available

### Worker Target

```
dist/
  worker.js       # Worker entry (bundled)
  wrangler.jsonc  # Generated config
  assets/         # Browser assets (served via ASSETS binding)
  manifest.json   # Route manifest
```

- Bundled server modules (no filesystem)
- Module registry for server-side imports
- Web APIs only (no Node.js builtins)
- Asset binding for static files

## Type System Architecture

Types are organized by usage:

1. **Public types** (`src/runtime/shared/types.ts`)
   - Exported from `elemental` package
   - Used in route modules
   - Well-documented with JSDoc

2. **Internal types** (co-located with implementation)
   - Build-only types in `src/build/`
   - Runtime-only types in specific modules
   - Not exported from package

3. **Ambient types** (`src/types/`)
   - CSS module declarations
   - Global augmentations

Public rendering helpers such as `html`, `safeHtml`, `cssText`, and `declarativeShadowDom` live in `src/runtime/shared/html.ts` and are exported from `src/index.ts`. `declarativeShadowDom(...)` remains a render-time helper: it returns an `HtmlResult`, uses the same escaped-by-default content model as `html`, and relies on `cssText()`-branded server CSS values for raw style emission inside generated `<style>` tags.

## Testing Architecture

Tests are organized by concern:

```
tests/
  unit/
    build.test.ts              # Build pipeline, discovery, validation
    client-bootstrap.test.ts   # Custom element registration
    client-navigation.test.ts  # Client navigation, DSD-aware swaps, fallbacks
    client-errors.test.ts      # Client error recovery
    deployment-fixtures.test.ts # Deployment smoke tests
    dev.test.ts                # Development server utilities
    error-runtime.test.ts      # Error boundary resolution
    html.test.ts               # HTML escaping, rendering, DSD helper
    render-document.test.ts    # Document rendering
    routes.test.ts             # Route matching
    server-runtime.test.ts     # Server request handling
    universal-targets.test.ts  # Node + Worker parity
  e2e/
    dev.spec.ts                # Development mode end-to-end
    smoke.spec.ts              # Browser navigation, DSD, forms, recovery
```

### Test Strategy

- **Unit tests** verify isolated behavior
- **E2E tests** verify browser integration
- **Deployment tests** verify packaging
- **Universal tests** verify Node/Worker parity
- **DSD coverage** verifies helper output, partial-navigation parsing/fallbacks, and the basic app's shadow-root upgrade path

## Future Considerations

### When to Split Modules

Consider splitting when:

1. File exceeds 600-800 lines
2. Clear logical boundaries emerge
3. Circular dependencies appear
4. Reusability across contexts is needed

### Candidates for Extraction

If these areas grow significantly:

1. **Build plugins** → `src/build/plugins/` (if any plugin >100 lines)
2. **Client navigation** → `src/runtime/client/navigation.ts` (if navigation >200 lines)
3. **Server routing** → `src/runtime/server/routing.ts` (if routing >200 lines)

### Maintaining Coherence

When splitting modules:

- Keep public API surface in one place
- Avoid circular dependencies
- Update this document
- Ensure test coverage remains clear

## Conclusion

The actual implementation prioritizes cohesion and simplicity over strict adherence to the planned file structure. All functionality from the plan exists and is well-tested - it's just organized slightly differently.

This architecture has proven maintainable through 15 implementation phases while keeping the codebase under 2,000 lines of runtime code. The consolidation decisions have not caused maintainability issues and can be revisited if modules grow significantly.
