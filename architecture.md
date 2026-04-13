# Elemental Architecture

This document describes the actual implementation structure of Elemental v0 and explains how it differs from the original `plan.md` proposal.

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
    index.ts                    # Main build orchestration + inline plugins
    discover.ts                 # Route discovery and validation
    manifest.ts                 # Manifest types and writing
    oxc.ts                      # AST transforms (strip custom elements)
  dev/
    index.ts                    # Development server with HMR
  runtime/
    client/
      bootstrap.ts              # Client runtime (navigation, head, forms, registration)
      dev-client.ts             # Development client (SSE, HMR)
      errors.ts                 # Client-side error recovery
    server/
      app.ts                    # Server exports (public API)
      core.ts                   # Core server runtime (routing, rendering, errors)
      node.ts                   # Node.js adapter (srvx)
      render-document.ts        # Document and partial rendering
      worker.ts                 # Cloudflare Workers adapter
    shared/
      browser-runtime.ts        # Browser runtime constants
      error-boundaries.ts       # Error boundary resolution
      html.ts                   # HTML tagged template and escaping
      routes.ts                 # Route matching utilities
      types.ts                  # Shared TypeScript types
  types/
    css.d.ts                    # CSS module type declarations
  index.ts                      # Public package exports
```

## Differences from Plan

The implementation consolidates several modules that the plan proposed as separate files. This section explains each difference and the rationale.

### 1. Build Plugins (Consolidated)

**Plan Expected:**
```
src/build/plugins/
  css.ts
  server-boundary.ts
  strip-custom-elements.ts
```

**Actual Implementation:**

All plugins are defined as inline functions in `src/build/index.ts`:
- `createBrowserServerBoundaryPlugin()` - Prevents browser code from importing `.server.ts`
- `createCssModulePlugin()` - Handles CSS imports differently for browser/server
- `createServerBundleTransformPlugin()` - Strips custom element exports from server bundles
- `createWorkerRuntimeValidationPlugin()` - Validates Worker-safe code

**Rationale:**

- Each plugin is small (10-100 lines)
- Plugins are only used within the build pipeline
- Keeping them inline reduces file count without harming maintainability
- All plugin logic is still well-organized and testable

**Impact:** Low - code is well-organized and easy to find

**Future Consideration:** If plugins grow beyond ~100 lines each, split into separate files

### 2. Client Runtime (Consolidated)

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

`bootstrap.ts` contains all client runtime logic:
- Custom element registration and detection
- Navigation interception (Navigation API + fallback)
- Head content management
- Form enhancement
- Route payload handling
- Asset loading

**Rationale:**

- Client runtime is a cohesive system where all parts interact
- Navigation, head, and forms are tightly coupled (all part of route transitions)
- Splitting would require many cross-module dependencies
- Total size (~400 lines) is manageable as a single module

**Impact:** Medium - larger file but logically cohesive

**Future Consideration:** Consider splitting if file exceeds 500-600 lines

### 3. Server Runtime (Consolidated)

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
- `core.ts` - Core runtime (routing, partial rendering, errors, request handling)
- `render-document.ts` - Document and outlet rendering
- `node.ts` - Node.js adapter
- `worker.ts` - Cloudflare Workers adapter

**Rationale:**

- `core.ts` contains the host-agnostic request → response pipeline
- Routing, errors, and partial rendering are tightly coupled
- Splitting would create many small modules with circular dependencies
- Document rendering is separate because it's used by both full and partial flows
- Adapters are separate because they're deployment-target-specific

**Impact:** Medium - `core.ts` is larger (~500 lines) but represents the unified server pipeline

**Future Consideration:** If core.ts exceeds 700-800 lines, consider extracting routing or error handling

### 4. Missing Modules

**Plan Expected:**

- `src/runtime/shared/responses.ts`

**Actual Implementation:**

This module was not created. Response utilities are inline where needed.

**Rationale:**

- Very few response helper functions are needed in v0
- Standard `Response` constructor and static methods (like `Response.redirect`) are sufficient
- No reusable response patterns accumulated during implementation

**Impact:** None - no utility functions were needed

**Future Consideration:** Create if response helpers accumulate in v1+

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

### Why Inline?

- Each plugin is self-contained and small
- No shared state between plugins
- Easier to understand build pipeline in one file
- Can still be extracted if they grow

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

## Testing Architecture

Tests are organized by concern:

```
tests/
  unit/
    build.test.ts              # Build pipeline, discovery, validation
    client-bootstrap.test.ts   # Custom element registration
    client-errors.test.ts      # Client error recovery
    deployment-fixtures.test.ts # Deployment smoke tests
    dev.test.ts                # Development server utilities
    error-runtime.test.ts      # Error boundary resolution
    html.test.ts               # HTML escaping and rendering
    render-document.test.ts    # Document rendering
    routes.test.ts             # Route matching
    server-runtime.test.ts     # Server request handling
    universal-targets.test.ts  # Node + Worker parity
  e2e/
    dev.spec.ts                # Development mode end-to-end
    smoke.spec.ts              # Browser navigation, forms, recovery
```

### Test Strategy

- **Unit tests** verify isolated behavior
- **E2E tests** verify browser integration
- **Deployment tests** verify packaging
- **Universal tests** verify Node/Worker parity

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

This architecture has proven maintainable through 13 implementation phases while keeping the codebase under 2,000 lines of runtime code. The consolidation decisions have not caused maintainability issues and can be revisited if modules grow significantly.
