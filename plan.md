# Elemental Implementation Plan

## Objective

Build Elemental v0 as a runtime-SSR meta-framework for native Web Components, matching the behavior defined in `spec.md`.

The implementation should ship:

- a single runtime-SSR execution model,
- filesystem routing with nested layouts and dynamic segments,
- route/server/layout/error conventions exactly as specified,
- a browser runtime for client navigation and custom element registration,
- a build output containing `dist/server.js`, hashed assets, and `manifest.json`, and
- enough tests and fixtures to prove the framework behaves as designed.

## Locked Scope

The following are explicitly in scope for v0:

- runtime SSR only,
- `index.ts` as the route render module,
- `index.server.ts` as the optional route server module,
- `layout.ts` and `layout.css` for nested layouts,
- `error.server.ts` for server-rendered errors,
- `error.ts` for browser-side recovery during client navigation,
- escaped-by-default HTML rendering with `html` and trusted opt-in through `safeHtml`,
- automatic client registration of named `HTMLElement` exports with `static tagName`,
- structured partial router payloads for client navigation, and
- a manifest describing route modules and assets.

The following remain out of scope for v0:

- CSR mode,
- prerender mode,
- middleware or global request hooks,
- inferred custom element tag names,
- virtual DOM hydration or reconciliation,
- preserving already-rendered parent layouts during error recovery, and
- fine-grained per-component error boundaries.

## Confirmed Decisions From The Spec

- Router navigations should request a structured partial payload whose outlet is the fully composed subtree intended for `data-route-outlet`, plus head, status, and asset metadata.
- Non-layout CSS imports should resolve to raw CSS text on the server and `CSSStyleSheet` instances in the browser.
- `index.server.ts` default exports are a full-response escape hatch and must return `Response`.
- Error handling uses nearest-ancestor `error.server.ts` for server-side 404 and 500 rendering, and nearest-ancestor `error.ts` for client-side recovery.
- Error responses do not compose previously matched layouts; they render inside a minimal built-in shell.

## Implementation Stack

The implementation should use a concrete stack instead of leaving the toolchain abstract:

### Runtime

- Node.js 24 LTS as the documented server runtime baseline.
- Native Web APIs in Node where possible: `Request`, `Response`, `URL`, and streams.
- Native browser component model: `HTMLElement`, `customElements`, Shadow DOM, and `adoptedStyleSheets`.
- Navigation API and View Transitions API when available, with framework fallbacks when unavailable.

### Language And Modules

- TypeScript as the primary authoring language for framework code and userland route modules.
- ESM-only output for both the server and browser build products.
- Standard CSS files with split behavior: `layout.css` emitted as document assets and non-layout CSS compiled per-target.

### Compiler And Build

- `esbuild` as the primary bundler for server and browser graphs.
- `oxc` for AST-based validation and transforms where `esbuild` alone is too limited.
- Custom build plugins for route discovery, manifest generation, CSS handling, and server-boundary enforcement.
- AST-based stripping of named `HTMLElement` subclass exports from the server build for `index.ts` and `layout.ts`.

### Test Stack

- `vitest` for unit and integration tests.
- `playwright` for browser navigation, form, and recovery flows.

### Why This Stack

- `esbuild` keeps the build fast and simple while still supporting separate browser and server outputs.
- `oxc` gives the compiler layer a concrete way to implement reliable module-boundary validation and export stripping without relying on regex-like heuristics.
- `vitest` and `playwright` cover the two critical feedback loops: framework semantics and real browser behavior.

## Proposed Repository Layout

Use the root `src/` directory for framework code and keep spec fixtures under `spec/`.

```txt
src/
	cli/
		index.ts
	build/
		index.ts
		discover.ts
		manifest.ts
		plugins/
			css.ts
			server-boundary.ts
			strip-custom-elements.ts
	runtime/
		client/
			bootstrap.ts
			navigation.ts
			head.ts
			forms.ts
			register-elements.ts
		server/
			app.ts
			render-document.ts
			render-partial.ts
			errors.ts
			routing.ts
			assets.ts
		shared/
			html.ts
			routes.ts
			types.ts
			responses.ts
	index.ts

spec/
	fixtures/
		basic-app/
		nested-layouts/
		errors/
		actions/
```

This keeps the implementation split by responsibility:

- `build/` owns source discovery, bundling, manifest generation, and graph validation.
- `runtime/server/` owns request handling and SSR behavior.
- `runtime/client/` owns navigation, form enhancement, and browser-only recovery.
- `runtime/shared/` owns common data structures and the HTML helper.
- `spec/fixtures/` provides executable examples used in tests.

## Implementation Strategy

Use a single route graph and manifest pipeline that both the server runtime and client runtime consume. The same route metadata should drive:

- filesystem matching,
- layout and error boundary resolution,
- asset injection,
- client module preloading,
- server partial payload responses, and
- test fixture assertions.

This is the main guard against server/client behavior drift.

Use `esbuild` as the primary bundler and `oxc` for AST-level validation and transforms. That combination gives the build pipeline explicit support for dual server/browser graphs, CSS target-specific handling, hard `*.server.ts` boundary enforcement, and server-side stripping of named `HTMLElement` subclass exports.

## Phase 1: Bootstrap The Framework Skeleton

Deliverables:

- `package.json` with build, dev, start, test, and typecheck commands.
- TypeScript configuration for ESM output.
- Initial CLI entrypoint for `npx elemental`.
- `esbuild` and `oxc` bootstrap capable of separate server and browser builds.
- Test runner setup for unit and integration coverage.
- Browser test setup for navigation and form behavior.

Tasks:

- Pin Node.js 24 LTS as the runtime baseline and document it.
- Add TypeScript, `esbuild`, `oxc`, `vitest`, and `playwright`.
- Define the public package entrypoints for `elemental` imports.
- Add ambient CSS module typing for author apps.
- Create a minimal fixture app that can render a root route.

Acceptance criteria:

- Repository installs and typechecks cleanly.
- CLI can execute a no-op or stub build command.
- `esbuild` and `oxc` bootstrap can emit distinct stub server and browser outputs.
- Test harness can run at least one unit test and one end-to-end smoke test.

## Phase 2: Implement The Core HTML Runtime

Deliverables:

- `html` tagged template helper.
- `safeHtml` trusted wrapper.
- `HtmlResult` internal representation.
- Server render utilities for document and subtree output.

Tasks:

- Implement default escaping for interpolated string values.
- Support nested `html` results, primitive coercion, array flattening, and ignoring `null`, `undefined`, and `false`.
- Implement attribute-position auto-quoting.
- Ensure `safeHtml` only bypasses escaping through an explicit branded wrapper.
- Make the renderer usable for both full-document and partial-outlet payloads.

Acceptance criteria:

- Strings are HTML-escaped by default.
- Attribute interpolations are emitted with quotes.
- Arrays render in order without extra separators.
- Nested results preserve structure.
- Trusted HTML passes through only via `safeHtml`.

## Phase 3: Build Route Discovery And Validation

Deliverables:

- Filesystem scanner for app directories.
- Route pattern parser for static, dynamic, and catch-all segments.
- Ancestor resolution for layouts, `error.ts`, and `error.server.ts`.
- Validation layer that rejects invalid project shapes.

Tasks:

- Treat any directory containing `index.ts` as a route.
- Convert `[param]` to `:param` and `[...param]` to catch-all metadata.
- Compute route specificity ordering so static routes win over dynamic and catch-all routes.
- Resolve nearest ancestor layouts from root to leaf.
- Resolve nearest ancestor browser and server error boundaries from root to leaf for manifest generation.
- Validate that routes do not combine `index.server.ts` default export with `loader()` or `action()`.
- Validate custom element exports only on the browser side and validate `static tagName` shape where possible.

Acceptance criteria:

- `/`, nested routes, dynamic routes, and catch-all routes are discovered correctly.
- The route graph produces stable matching order.
- Layout and error ancestor chains are correct for every route.
- Invalid route module combinations fail the build with actionable errors.

## Phase 4: Build The Bundling Pipeline

Deliverables:

- Browser bundling for `index.ts`, `layout.ts`, and `error.ts`.
- Server bundling for SSR modules and server-only route modules.
- `oxc` transforms for graph isolation and named export stripping.
- CSS handling aligned with the spec.
- Import-boundary enforcement to protect server-only code.

Tasks:

- Bundle route and layout modules into browser chunks referenced by the manifest.
- Bundle SSR-capable modules for the server runtime.
- Exclude `.server.ts` modules from the browser graph entirely.
- Add a build error when browser-reachable code imports `index.server.ts` or `error.server.ts`.
- Strip named `HTMLElement` subclass exports from server bundles for `index.ts` and `layout.ts` while retaining their default exports.
- Exclude `error.ts` from the server bundle entirely. It is browser-only and requires no export stripping.
- Emit `layout.css` as global linkable assets.
- Resolve non-layout CSS imports to `CSSStyleSheet` in browser output and raw CSS text in server output.
- Produce a manifest that records route patterns, module paths, ancestor boundaries, and asset lists.

Acceptance criteria:

- Browser bundles never contain server-only modules.
- Server bundles can execute route and layout default exports safely.
- Layout CSS is emitted as an asset instead of an importable module.
- Manifest entries match the discovered route graph and emitted asset files.

## Phase 5: Implement The Server Runtime

Deliverables:

- Request router.
- Route server context creation.
- Full document SSR renderer.
- Partial router payload renderer.
- Action, loader, and full-response execution paths.

Tasks:

- Match incoming URLs using the generated route graph.
- Create `RouteServerContext` with `request`, `params`, and `url`.
- For non-GET mutations, route to `action()` when present.
- Require `action()` to return a `Response` in v0.
- Treat non-`Response` `action()` returns as contract errors and route them through the standard 500 error handling path.
- If `index.server.ts` has a default export, execute it first and return the `Response` directly.
- Otherwise execute `loader()` when present.
- If `loader()` returns a `Response`, bypass layout composition and return it directly. This is a distinct short-circuit path from the `index.server.ts` default-export escape hatch and must be handled separately.
- Execute route `head()` from `index.ts` during normal route rendering and compose the result into `LayoutProps.head`.
- Pass the composed `head` result through each `layout.ts` via `LayoutProps` so layouts can render `${props.head}` in the document `<head>`.
- Execute the default export from `index.ts`.
- Compose layouts from leaf to root using `outlet` and resolved head content.
- Inject route and layout assets into the response.
- Detect the `X-Elemental-Router: true` header and return the structured partial payload instead of a full document.

Acceptance criteria:

- Full document requests return SSR HTML with the correct layout nesting.
- Router payload requests return outlet, head, status, and asset metadata without a full shell.
- `loader()` and `action()` receive the documented context.
- `action()` returns are `Response`-only in v0.
- `loader()` returning a `Response` bypasses layout composition and returns it directly.
- Explicit `Response` returns from `index.server.ts` default exports bypass rendering exactly as specified.
- Route `head()` output is composed into `LayoutProps.head` and rendered in the document `<head>`.

## Phase 6: Implement Error Resolution And Recovery

Deliverables:

- Shared error-boundary resolution helpers.
- Server-side `error.server.ts` rendering path.
- Minimal built-in error document shell.
- Client-side `error.ts` rendering path.

Tasks:

- Resolve nearest ancestor `error.server.ts` for thrown server-side errors, and for unmatched routes start from the nearest existing ancestor directory implied by the URL before walking upward.
- Render `error.server.ts` output inside a framework-owned minimal document shell.
- Include `head()` output from `error.server.ts` when present.
- Return plain text `404 Not Found` or `500 Internal Server Error` when no server boundary exists.
- Log thrown server-side errors to stderr.
- Resolve nearest ancestor `error.ts` for client navigation and module loading failures.
- When a chosen `error.ts` exports `head()`, update `document.head` after the browser boundary renders.
- If no browser boundary exists, fall back to a full document navigation.
- If the chosen browser boundary throws, log and fall back to a full document navigation.

Acceptance criteria:

- Unmatched routes return 404 via nearest server boundary when present.
- Loader, action, route render, and layout render failures return 500 via nearest server boundary when present.
- Error responses do not execute `layout.ts`.
- Client-side navigation failures recover through nearest `error.ts` or escalate to full reload.

## Phase 7: Implement The Browser Runtime

Deliverables:

- Browser bootstrap entrypoint.
- Automatic custom element registration.
- Client router with navigation interception and DOM swapping.
- Head manager.
- Form enhancement layer.

Tasks:

- Load route, layout, and nearest-applicable `error.ts` browser modules for the active route.
- Register named exports that are `HTMLElement` subclasses with a valid `static tagName`.
- Skip registration when `customElements.get(tagName)` already exists.
- Intercept same-origin navigations.
- Use the Navigation API when available and fall back when not.
- Request partial payloads with `X-Elemental-Router: true`.
- Replace the `data-route-outlet` subtree using the returned composed subtree.
- Load new JS and CSS assets before swapping when required.
- Update `document.head` from the returned head payload.
- Preserve redirects, history, and status-aware behavior.
- Intercept qualifying form submissions and route them through the same navigation pipeline.
- Use the View Transitions API when available, with plain replacement fallback otherwise.

Acceptance criteria:

- Same-origin link navigations update only the route outlet.
- Required assets are loaded for the target route.
- Browser-side failures recover through `error.ts` as specified.
- Forms still work without JavaScript and are enhanced when the router is active.

## Phase 8: Implement Styling And Asset Composition

Deliverables:

- Root-to-leaf layout CSS injection.
- Route and layout JS asset tracking.
- Scoped CSS SSR support for Shadow DOM use cases.

Tasks:

- Include all ancestor `layout.css` assets in root-to-leaf order.
- Include route-specific CSS and JS assets in the manifest.
- For scoped CSS SSR, resolve non-layout CSS imports to raw text on the server and emit them as inline `<style>` tags within Declarative Shadow DOM templates or in the document head during SSR. This prevents FOUC without requiring the browser to fetch a stylesheet before first paint.
- In the browser bundle, resolve non-layout CSS imports to `CSSStyleSheet` instances for use with `adoptedStyleSheets`.
- Avoid duplicate asset injection when a navigation revisits already-loaded modules.
- Keep asset resolution identical between full-document responses and router partial payloads.

Acceptance criteria:

- Layout CSS is loaded in a deterministic order.
- Scoped CSS is emitted as inline `<style>` tags during SSR and as `CSSStyleSheet` instances in the browser.
- Client navigations only load missing assets.

## Phase 9: Testing Matrix

Unit tests:

- HTML escaping, attribute quoting, and `safeHtml` behavior.
- Route parsing and specificity sorting.
- Ancestor layout and error boundary resolution.
- Manifest generation.
- Custom element detection and registration skipping.

Integration tests:

- Full document rendering with nested layouts.
- Dynamic route params and catch-all params.
- `loader()` data flow into `index.ts`.
- `action()` behavior for mutations, including the v0 `Response`-only contract.
- `index.server.ts` default export bypass behavior.
- `loader()` returning a `Response` bypasses layout composition.
- `action()` returning a `Response` bypasses layout composition.
- Error rendering for 404 and 500 cases.
- Unmatched-route `error.server.ts` resolution starts from the nearest existing ancestor directory.
- `error.server.ts` render failures fall back to plain-text 500 responses.
- CSS handling in server and browser builds.

Browser end-to-end tests:

- Same-origin navigation swaps only `data-route-outlet`.
- Head updates during client transitions.
- Route-level asset loading.
- Progressive enhancement for forms.
- Browser-side error boundary recovery.
- `error.ts` `head()` output updates `document.head` during client-side recovery.
- Full reload fallback when no boundary exists.

Security tests:

- `.server.ts` imports into browser-reachable modules fail the build.
- Server-only modules never appear in emitted browser bundles.

- Named `HTMLElement` exports do not leak into server runtime execution paths.

## Phase 10: Documentation And Example App

Deliverables:

- Expanded `readme.md` with installation, commands, and authoring conventions.
- One runnable example app covering the core conventions.
- A spec-to-implementation checklist for release readiness.

Tasks:

- Document route, layout, and error file conventions.
- Document the HTML helper and CSS behavior.
- Document the router header and partial payload semantics.
- Include an example using nested layouts, dynamic params, route data, a form action, and client-side navigation.
- Add a release checklist that maps implemented features back to the spec.

Acceptance criteria:

- A new user can create a small app from the README without reading the full spec first.
- The example app exercises the major framework features.
- Release readiness can be evaluated with a single checklist.

## Phase 11: Gaps

Deliverables:

- Correct package entrypoints for the published library and CLI.
- A resolved contract for non-`Response` `action()` returns, or an explicit scope reduction that removes that path from v0.
- Release-readiness verification that exercises the package through its public entrypoints instead of only internal source paths.

Tasks:

- Fix the package export map so the `import` entry points at emitted JavaScript instead of a non-existent TypeScript artifact.
- Fix the package `bin` entry so `npx elemental` resolves to the real CLI entrypoint.
- Add a verification step that confirms `import "elemental"` works after build output is generated.
- Add a verification step that confirms the declared CLI entrypoint can execute a build command.
- Finalize the v0 `action()` contract as `Response`-only and keep runtime, README, plan, and spec language aligned.
- Update tests or release checks so unresolved package metadata or CLI wiring regressions fail before release.

Acceptance criteria:

- `import "elemental"` resolves through the package export map after a build without referencing missing files.
- `npx elemental build` resolves through the package `bin` entry and executes successfully.
- The release checklist no longer contains open-ended completion blockers for v0.
- The plan, runtime behavior, README, and spec agree on the v0 `Response`-only `action()` contract.

## Phase 12: Developer Reloading

Deliverables:

- `elemental dev` command for local development.
- Watch-mode rebuild pipeline for browser assets, server output, and manifest updates.
- Browser reload channel using WebSocket or SSE for development notifications.
- Full-page live reload path for updates that cannot be applied safely in place.
- CSS-only hot swap for emitted stylesheet assets when the change can be handled without a full reload.
- Framework-aware JavaScript HMR for browser route, layout, and error modules, with explicit fallback to live reload when an update crosses an unsafe boundary.
- Coordinated server-module restart and invalidation behavior for `index.server.ts`, manifest changes, and other SSR-affecting updates.

Tasks:

- Add an `elemental dev` entrypoint that wraps the existing `esbuild` pipeline in watch mode instead of treating development as manual rebuilds.
- Keep the development flow centered on the existing `dist/server.js`, `dist/assets/*`, and `dist/manifest.json` outputs so dev mode exercises the same artifacts as production builds.
- Add a small development transport layer that notifies connected browsers when a rebuild finishes.
- Implement full-page live reload as the fallback response when a change cannot be handled safely through CSS or JavaScript hot updates.
- Restart or refresh the running server process when server output changes, and only notify the browser after the new build artifacts are ready.
- Detect CSS-only changes, especially `layout.css` and other emitted stylesheet assets, and replace the affected stylesheet references in the browser without forcing a full page reload.
- Define HMR invalidation boundaries for `index.ts`, `layout.ts`, `error.ts`, shared browser runtime modules, and route-adjacent dependencies so the framework can decide between in-place update, subtree rerender, or full reload.
- Implement client-side HMR handlers for route, layout, and browser error modules so browser updates can be accepted without tearing down the entire page when the update remains inside a safe boundary.
- Define how route-module and layout-module hot updates affect SSR-driven head content, `data-route-outlet`, and any active custom element registrations.
- Treat `index.server.ts`, route manifest changes, route discovery changes, and other server-side contract changes as restart-plus-notify events that may still require browser reload instead of in-place HMR.
- Preserve browser state across safe JavaScript hot updates where possible, and fall back to route-subtree rerender or full reload when the framework cannot preserve correctness.
- Document the staged rollout inside the phase: live reload first, CSS hot reload second, JavaScript HMR third, while keeping all three inside the phase scope.
- Add end-to-end coverage for dev-mode rebuild notifications, full-page reload fallback, CSS-only hot swap on stylesheet edits, and safe JavaScript HMR behavior for route or layout module changes.

Acceptance criteria:

- `elemental dev` rebuilds the app automatically after file changes without requiring manual restart steps.
- Browser sessions reload automatically after rebuilds when a change falls outside the supported CSS or JavaScript HMR boundaries.
- Stylesheet-only edits update in the browser without a full-page reload when the affected asset can be swapped safely.
- Supported JavaScript changes in route, layout, and browser error modules update in place during development without a full-page reload.
- Server-contract changes, route graph changes, and unsafe JavaScript updates fall back to restart plus full-page reload instead of leaving the app in a stale or inconsistent state.
- The development workflow uses the same route graph, manifest generation, and output structure as the production build pipeline.
- The README and plan explicitly describe live reload, CSS hot reload, and JavaScript HMR as in-scope parts of `elemental dev`, including the fallback rules that protect correctness.

## Cross-Cutting Rules

These rules should be enforced throughout the implementation:

- Keep one source of truth for route graph and manifest data.
- Keep server-only boundaries filesystem-based rather than heuristic-based whenever possible.
- Reuse the same render pipeline for full document output and router partial output so layout, head, and asset behavior stay consistent.
- Prefer explicit validation errors during build over silent runtime fallbacks.
- Keep error fallback behavior simple and deterministic.

## Primary Risks And Mitigations

Risk: server/client bundle drift causes different route or asset resolution.

Mitigation: derive both runtimes from the same discovered route graph and emitted manifest.

Risk: stripping `HTMLElement` exports from server bundles is brittle.

Mitigation: implement this as an AST-based transform with fixture coverage for edge cases.

Risk: CSS behavior diverges between server SSR and browser upgrade paths.

Mitigation: test the same fixture route in full SSR, client navigation, and custom element upgrade scenarios.

Risk: error handling duplicates logic across server and browser flows.

Mitigation: centralize ancestor-boundary resolution and keep environment-specific rendering adapters thin.

## Definition Of Done

Elemental v0 is ready when all of the following are true:

- every feature defined in `spec.md` has an implementation path and test coverage,
- `npx elemental` can build a fixture app into `dist/server.js`, `dist/assets/*`, and `dist/manifest.json`,
- full document requests, partial router payloads, and progressive form submissions all work against the same route graph,
- route, layout, error, and CSS conventions behave exactly as documented, and
- the example app demonstrates runtime SSR, nested layouts, client navigation, route data loading, mutations, and error recovery.
