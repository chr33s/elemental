# Elemental v1 Readiness Gap Analysis

## Summary

This document reviews the Elemental implementation against `plan.md` and identifies missing, incomplete, or actionable changes required for v1 framework readiness.

**Overall Status**: The implementation is substantially complete for v0 scope as defined in the plan. Phases 1-13 have been implemented with good fidelity. However, several areas need attention before declaring v1 readiness:

1. **Repository structure differs from plan**: Plugins are inline rather than in separate files
2. **Missing some runtime modules**: Some planned files don't exist as separate modules
3. **Documentation gaps**: Some implementation details lack documentation
4. **Test coverage gaps**: Several test scenarios from Phase 9 are not explicitly covered
5. **Package publishing readiness**: Some final packaging concerns for npm distribution

---

## Phase-by-Phase Analysis

### Phase 1: Bootstrap The Framework Skeleton ✅ COMPLETE

**Plan Deliverables:**

- ✅ `package.json` with build, dev, start, test, and typecheck commands
- ✅ TypeScript configuration for ESM output
- ✅ Initial CLI entrypoint for `npx elemental`
- ✅ `esbuild` and `oxc` bootstrap capable of separate server and browser builds
- ✅ Test runner setup for unit and integration coverage
- ✅ Browser test setup for navigation and form behavior

**Gaps:**

- ✅ None - Phase 1 is complete

---

### Phase 2: Implement The Core HTML Runtime ✅ COMPLETE

**Plan Deliverables:**

- ✅ `html` tagged template helper
- ✅ `safeHtml` trusted wrapper
- ✅ `HtmlResult` internal representation
- ✅ Server render utilities for document and subtree output

**Implementation Location:** `src/runtime/shared/html.ts`

**Gaps:**

- ✅ None - All acceptance criteria met based on test coverage in `tests/unit/html.test.ts`

---

### Phase 3: Build Route Discovery And Validation ✅ COMPLETE

**Plan Deliverables:**

- ✅ Filesystem scanner for app directories
- ✅ Route pattern parser for static, dynamic, and catch-all segments
- ✅ Ancestor resolution for layouts, `error.ts`, and `error.server.ts`
- ✅ Validation layer that rejects invalid project shapes

**Implementation Location:** `src/build/discover.ts`

**Gaps:**

- ✅ None - Route discovery is comprehensive with good test coverage

---

### Phase 4: Build The Bundling Pipeline ⚠️ MOSTLY COMPLETE

**Plan Deliverables:**

- ✅ Browser bundling for `index.ts`, `layout.ts`, and `error.ts`
- ✅ Server bundling for SSR modules and server-only route modules
- ✅ `oxc` transforms for graph isolation and named export stripping
- ✅ CSS handling aligned with the spec
- ✅ Import-boundary enforcement to protect server-only code

**Implementation Location:** `src/build/index.ts`, `src/build/oxc.ts`

**Gaps:**

#### 1. Plugin Organization Does Not Match Plan Structure

**Plan Expected:**

```
src/build/plugins/
  css.ts
  server-boundary.ts
  strip-custom-elements.ts
```

**Actual Implementation:**

- All plugins are defined inline in `src/build/index.ts` as functions:
  - `createBrowserServerBoundaryPlugin()` (lines 484-497)
  - `createCssModulePlugin()` (lines 499-547)
  - `createServerBundleTransformPlugin()` (lines 549-567)
  - `createWorkerRuntimeValidationPlugin()` (lines 569-592)

**Impact:** Low - functionality exists, just organized differently

**Recommendation for v1:**

- **Option A (Minimal):** Document this architectural decision and why inline plugins are preferred
- **Option B (Align with Plan):** Extract plugins to `src/build/plugins/` directory for better maintainability and separation of concerns

#### 2. Missing Standalone Manifest Generation Documentation

**Current State:** Manifest generation happens in `src/build/manifest.ts` but only exports types and `writeManifest()`. The actual manifest structure creation is in `src/build/index.ts`.

**Gap:** The plan describes manifest generation as a separate concern, but it's tightly coupled to the build process.

**Recommendation for v1:**

- Document why manifest generation is build-integrated rather than standalone
- OR extract manifest creation logic to `src/build/manifest.ts` for better testability

---

### Phase 5: Implement The Server Runtime ✅ COMPLETE

**Plan Deliverables:**

- ✅ Request router
- ✅ Route server context creation
- ✅ Full document SSR renderer
- ✅ Partial router payload renderer
- ✅ Action, loader, and full-response execution paths

**Implementation Locations:**

- `src/runtime/server/app.ts` (exports only)
- `src/runtime/server/core.ts` (actual implementation)
- `src/runtime/server/render-document.ts`
- `src/runtime/server/node.ts`

**Gaps:**

#### Missing Dedicated Files from Plan

**Plan Expected:**

```
src/runtime/server/
  render-partial.ts
  errors.ts
  routing.ts
  assets.ts
```

**Actual State:**

- No `render-partial.ts` - partial rendering is in `core.ts`
- No `errors.ts` - error handling is in `core.ts` and shared in `src/runtime/shared/error-boundaries.ts`
- No `routing.ts` - routing is in `core.ts`
- No `assets.ts` - asset handling is in `render-document.ts` and `core.ts`

**Impact:** Low - all functionality exists, just consolidated differently

**Recommendation for v1:**

- **Option A:** Document the actual module organization and reasoning
- **Option B:** Refactor to match plan structure if module sizes become unwieldy (current `core.ts` is manageable)

---

### Phase 6: Implement Error Resolution And Recovery ✅ COMPLETE

**Plan Deliverables:**

- ✅ Shared error-boundary resolution helpers
- ✅ Server-side `error.server.ts` rendering path
- ✅ Minimal built-in error document shell
- ✅ Client-side `error.ts` rendering path

**Implementation Locations:**

- `src/runtime/shared/error-boundaries.ts`
- `src/runtime/client/errors.ts`
- Error handling in `src/runtime/server/core.ts`

**Gaps:**

- ✅ None - test coverage in `tests/unit/error-runtime.test.ts` confirms implementation

---

### Phase 7: Implement The Browser Runtime ✅ COMPLETE

**Plan Deliverables:**

- ✅ Browser bootstrap entrypoint
- ✅ Automatic custom element registration
- ✅ Client router with navigation interception and DOM swapping
- ✅ Head manager
- ✅ Form enhancement layer

**Implementation Location:** `src/runtime/client/bootstrap.ts`

**Gaps:**

#### Missing Dedicated Files from Plan

**Plan Expected:**

```
src/runtime/client/
  navigation.ts
  head.ts
  forms.ts
  register-elements.ts
```

**Actual State:**

- All functionality is in `bootstrap.ts` (one large file with all client runtime logic)

**Impact:** Low for v0, Medium for v1 maintainability

**Recommendation for v1:**

- Consider splitting `bootstrap.ts` into smaller modules as planned for better code organization:
  - Extract custom element registration logic → `register-elements.ts`
  - Extract navigation handling → `navigation.ts`
  - Extract head management → `head.ts`
  - Extract form enhancement → `forms.ts`
- This would improve testability and maintainability for future development

---

### Phase 8: Implement Styling And Asset Composition ✅ COMPLETE

**Plan Deliverables:**

- ✅ Root-to-leaf layout CSS injection
- ✅ Route and layout JS asset tracking
- ✅ Scoped CSS SSR support for Shadow DOM use cases

**Implementation Location:** CSS plugin in `src/build/index.ts`, asset handling in `render-document.ts`

**Gaps:**

- ✅ None - CSS behavior matches spec

---

### Phase 9: Testing Matrix ⚠️ MOSTLY COMPLETE

**Plan Required Tests:**

#### Unit Tests

- ✅ HTML escaping, attribute quoting, and `safeHtml` behavior - `tests/unit/html.test.ts`
- ✅ Route parsing and specificity sorting - `tests/unit/routes.test.ts`
- ✅ Ancestor layout and error boundary resolution - `tests/unit/error-runtime.test.ts`
- ✅ Manifest generation - `tests/unit/build.test.ts`
- ✅ Custom element detection and registration skipping - `tests/unit/client-bootstrap.test.ts`

#### Integration Tests

- ✅ Full document rendering with nested layouts - `tests/unit/server-runtime.test.ts`
- ✅ Dynamic route params and catch-all params - `tests/unit/routes.test.ts`
- ✅ `loader()` data flow into `index.ts` - `tests/unit/server-runtime.test.ts`
- ✅ `action()` behavior for mutations - `tests/unit/server-runtime.test.ts`
- ✅ `index.server.ts` default export bypass behavior - `tests/unit/server-runtime.test.ts`
- ✅ `loader()` returning a `Response` bypasses layout composition - `tests/unit/server-runtime.test.ts`
- ⚠️ `action()` returning a `Response` bypasses layout composition - _Likely covered but needs explicit test case verification_
- ✅ Error rendering for 404 and 500 cases - `tests/unit/error-runtime.test.ts`
- ✅ Unmatched-route `error.server.ts` resolution - `tests/unit/error-runtime.test.ts`
- ✅ `error.server.ts` render failures fall back to plain-text 500 - `tests/unit/error-runtime.test.ts`
- ✅ CSS handling in server and browser builds - `tests/unit/build.test.ts`

#### Browser End-to-End Tests

- ✅ Same-origin navigation swaps only `data-route-outlet` - `tests/e2e/smoke.spec.ts`
- ✅ Head updates during client transitions - `tests/e2e/smoke.spec.ts`
- ✅ Route-level asset loading - `tests/e2e/smoke.spec.ts`
- ✅ Progressive enhancement for forms - `tests/e2e/smoke.spec.ts`
- ✅ Browser-side error boundary recovery - `tests/e2e/smoke.spec.ts`
- ⚠️ `error.ts` `head()` output updates `document.head` during client-side recovery - _Needs verification_
- ✅ Full reload fallback when no boundary exists - `tests/e2e/smoke.spec.ts`

#### Security Tests

- ✅ `.server.ts` imports into browser-reachable modules fail the build - `tests/unit/build.test.ts`
- ✅ Server-only modules never appear in emitted browser bundles - `tests/unit/build.test.ts`
- ✅ Named `HTMLElement` exports do not leak into server runtime - `tests/unit/build.test.ts`

**Gaps:**

1. **Missing explicit test case:** Action returning Response bypasses layout composition
   - **Impact:** Medium - core contract behavior
   - **Recommendation:** Add explicit test case to `tests/unit/server-runtime.test.ts`

2. **Missing explicit test case:** `error.ts` `head()` updates during client recovery
   - **Impact:** Medium - specified behavior in Phase 9
   - **Recommendation:** Add test case to `tests/e2e/smoke.spec.ts`

---

### Phase 10: Documentation And Example App ⚠️ MOSTLY COMPLETE

**Plan Deliverables:**

- ✅ Expanded `readme.md` with installation, commands, and authoring conventions
- ✅ One runnable example app covering the core conventions
- ⚠️ A spec-to-implementation checklist for release readiness

**Implementation:**

- ✅ `readme.md` is comprehensive and well-written
- ✅ Example app at `spec/fixtures/basic-app/src` covers all major features
- ⚠️ Release checklist exists in `readme.md` but is marked complete - needs v1 verification

**Gaps:**

1. **Release Checklist Status**
   - The checklist in `readme.md` lines 232-242 shows all items as complete `[x]`
   - Need to verify each item actually works in an end-to-end flow before declaring v1 ready

2. **Missing: API Reference Documentation**
   - Plan mentions "Document the HTML helper and CSS behavior" - covered in readme
   - Missing: Comprehensive API docs for:
     - `RouteServerContext` interface
     - `LayoutProps` interface
     - `loader()` / `action()` / `head()` function signatures
     - Custom element registration requirements
     - Error boundary interfaces
   - **Recommendation for v1:** Add API reference section to readme or separate `api.md`

3. **Missing: Migration/Upgrade Guide**
   - No documentation on how to upgrade when framework changes
   - **Recommendation for v1:** Add upgrade guide framework even if v0 is first release

---

### Phase 11: Gaps ✅ COMPLETE

**Plan Deliverables:**

- ✅ Correct package entrypoints for the published library and CLI
- ✅ A resolved contract for non-`Response` `action()` returns (v0 is Response-only)
- ✅ Release-readiness verification through public entrypoints

**Implementation:** Package.json correctly configured with exports and bin entry

**Gaps:**

- ✅ None - Phase 11 addressed the original gaps

---

### Phase 12: Developer Reloading ✅ COMPLETE

**Plan Deliverables:**

- ✅ `elemental dev` command for local development
- ✅ Watch-mode rebuild pipeline
- ✅ Browser reload channel using WebSocket or SSE
- ✅ Full-page live reload path
- ✅ CSS-only hot swap for layout stylesheets
- ✅ Framework-aware JavaScript HMR for route modules
- ✅ Coordinated server-module restart and invalidation

**Implementation Location:** `src/dev/index.ts`, `src/runtime/client/dev-client.ts`

**Gaps:**

1. **Dev Mode Documentation Could Be Expanded**
   - Current readme section (lines 206-227) covers the basics
   - Missing: Detailed troubleshooting guide for dev mode issues
   - Missing: Explanation of when each update strategy applies
   - **Recommendation for v1:** Add dev mode troubleshooting section

2. **Missing Test Coverage for Dev Mode Edge Cases**
   - `tests/unit/dev.test.ts` (114 lines) and `tests/e2e/dev.spec.ts` (319 lines) exist
   - May be missing: Tests for rapid successive file changes, network failure recovery
   - **Recommendation for v1:** Review dev test coverage for edge cases

---

### Phase 13: Universal Deployment Targets ✅ COMPLETE

**Plan Deliverables:**

- ✅ Host-agnostic server runtime core
- ✅ Node production target using `srvx`
- ✅ Cloudflare Workers production target using Wrangler
- ✅ Shared server-module resolution strategy
- ✅ Target-aware build, validation, and smoke coverage

**Implementation Locations:**

- `src/runtime/server/core.ts` - shared runtime
- `src/runtime/server/node.ts` - Node adapter
- `src/runtime/server/worker.ts` - Worker adapter
- `spec/fixtures/deploy-srvx/` - Node deployment fixture
- `spec/fixtures/deploy-wrangler/` - Worker deployment fixture

**Gaps:**

1. **Deployment Fixture Testing Requires Manual Steps**
   - Fixtures have `npm run smoke` scripts
   - Not integrated into main test suite
   - **Recommendation for v1:** Integrate deployment smoke tests into CI/CD pipeline

2. **Missing Deployment Documentation**
   - Readme mentions deployment fixtures (lines 31-40) but lacks detailed deployment guides
   - Missing: Step-by-step guide for deploying to production
   - Missing: Environment variable configuration docs
   - Missing: Performance tuning recommendations
   - **Recommendation for v1:** Add deployment guide for both Node and Workers

---

## Cross-Cutting Issues

### 1. Repository Structure vs Plan

**Issue:** The actual directory structure doesn't match `plan.md` section "Proposed Repository Layout"

**Plan Expected:**

```
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
```

**Actual Structure:**

```
src/
  cli/
    index.ts
  build/
    index.ts
    discover.ts
    manifest.ts
    oxc.ts
  dev/
    index.ts
  runtime/
    client/
      bootstrap.ts        (contains all navigation, head, forms, register logic)
      dev-client.ts
      errors.ts
    server/
      app.ts              (exports only)
      core.ts             (contains routing, partial, errors, assets)
      node.ts
      render-document.ts
      worker.ts
    shared/
      browser-runtime.ts
      error-boundaries.ts
      html.ts
      routes.ts
      types.ts
  types/
    css.d.ts
  index.ts
```

**Impact:** Medium - harder to navigate codebase, but functionality is complete

**Recommendations for v1:**

- **Option A (Document):** Update `plan.md` to reflect actual structure and explain consolidation choices
- **Option B (Refactor):** Split large files like `bootstrap.ts` and `core.ts` to match original plan for better maintainability
- **Option C (Hybrid):** Keep current structure but add code comments documenting which logical sections correspond to planned modules

### 2. Missing `responses.ts` Module

**Issue:** Plan mentions `src/runtime/shared/responses.ts` but this file doesn't exist

**Current State:** Response handling is distributed across server modules

**Impact:** Low - functionality exists elsewhere

**Recommendation for v1:**

- Document why dedicated responses module was not needed
- OR create it if response utilities accumulate

### 3. Test Organization

**Current State:**

- Unit tests: ~2,449 lines
- E2E tests: ~610 lines
- Total: ~3,059 lines of test code

**Strengths:**

- Good coverage of core functionality
- Both unit and E2E tests exist
- Tests are well-organized by concern

**Gaps:**

- Some Phase 9 test cases not explicitly verified (see Phase 9 section)
- Deployment fixtures have smoke tests but not integrated into main suite
- Dev mode edge cases may need more coverage

**Recommendation for v1:**

- Add missing explicit test cases from Phase 9
- Integrate deployment smoke tests into CI
- Consider adding performance benchmarks

### 4. Type Safety and Exports

**Current State:** `src/index.ts` exports types and runtime functions

**Strengths:**

- Clean public API surface
- TypeScript support is good

**Gaps:**

- No explicit versioning strategy documented
- No deprecation policy for future breaking changes
- Missing: Type-only exports vs runtime exports documentation

**Recommendation for v1:**

- Document semantic versioning commitment
- Document public API stability guarantees
- Consider separating type exports for better tree-shaking

---

## V1 Readiness Checklist

Based on this gap analysis, here are the actionable items for v1 readiness:

### Critical (Must Fix Before v1)

1. ✅ **Verify all Phase 10 release checklist items actually work end-to-end**
   - Run full example app through production build
   - Test all documented features work as described

2. ⚠️ **Add missing explicit test cases from Phase 9:**
   - `action()` returning Response bypasses layout composition
   - `error.ts` `head()` updates during client-side recovery

3. ⚠️ **Complete API documentation**
   - Document all public interfaces
   - Add JSDoc comments to exported types and functions
   - Create API reference section

### High Priority (Should Fix Before v1)

4. ⚠️ **Integrate deployment smoke tests into main test suite**
   - Make `spec/fixtures/deploy-srvx` smoke test part of CI
   - Make `spec/fixtures/deploy-wrangler` smoke test part of CI

5. ⚠️ **Add deployment documentation**
   - Node deployment guide
   - Cloudflare Workers deployment guide
   - Environment configuration reference

6. ⚠️ **Document actual vs planned structure**
   - Update `plan.md` or add `architecture.md`
   - Explain why certain modules were consolidated
   - Document current module organization

### Medium Priority (Consider for v1)

7. 🔄 **Refactor large modules to match plan**
   - Split `src/runtime/client/bootstrap.ts` into smaller modules
   - Extract plugin definitions to `src/build/plugins/`
   - This improves maintainability for post-v1 development

8. 🔄 **Enhance dev mode documentation**
   - Add troubleshooting section
   - Document update strategy decision tree
   - Add common issues and solutions

9. 🔄 **Add versioning and deprecation policy**
   - Document semantic versioning commitment
   - Define public API stability guarantees
   - Create deprecation policy for future changes

### Low Priority (Nice to Have)

10. 📝 **Add migration guide framework**
    - Even though v0/v1 is first release
    - Sets pattern for future versions

11. 📝 **Add performance benchmarks**
    - Build time benchmarks
    - Runtime SSR performance benchmarks
    - Client navigation benchmarks

12. 📝 **Code organization improvements**
    - Add code comments mapping to plan sections
    - Consider extracting `responses.ts` if needed
    - Improve internal API documentation

---

## Summary and Recommendations

### Overall Assessment

The Elemental framework implementation is **substantially complete** for v0 scope. All 13 phases from `plan.md` have been implemented with working code, good test coverage, and a comprehensive example app.

**Strengths:**

- ✅ All core features from spec are implemented
- ✅ Good separation of concerns (server/client/shared)
- ✅ Comprehensive test coverage (~3,000 lines)
- ✅ Working example app demonstrating all features
- ✅ Both Node and Cloudflare Workers deployment targets
- ✅ Developer reloading with HMR support
- ✅ Clean public API surface

**Gaps:**

- ⚠️ Code organization differs from plan (consolidated vs split files)
- ⚠️ Some documentation gaps (API reference, deployment guides)
- ⚠️ A few explicit test cases from Phase 9 need verification
- ⚠️ Deployment smoke tests not integrated into main CI

### Path to V1

**Option A: Conservative V1 (Recommended)**

- Fix critical items (1-3)
- Fix high priority items (4-6)
- Ship v1 with current architecture
- Address medium/low priority items in v1.1+

**Estimated Effort:** 2-3 days of focused work

**Option B: Comprehensive V1**

- Fix all critical and high priority items
- Refactor to match original plan structure
- Add all medium priority improvements
- Ship more polished v1

**Estimated Effort:** 1-2 weeks of work

**Option C: Ship Current State as v0.9**

- Fix only critical test gaps
- Document known issues
- Get user feedback before v1
- Use feedback to prioritize remaining gaps

**Estimated Effort:** 1 day of work

### Recommendation

Ship **Option A (Conservative V1)** because:

1. Core functionality is solid and tested
2. Code organization differences are acceptable
3. Can iterate on documentation and tooling post-v1
4. Gets framework in users' hands faster
5. Can gather real-world feedback to prioritize improvements

The framework is **ready for v1** after addressing the critical and high-priority items listed above.

---

## Appendix: File Count Comparison

**Plan Expected:** ~25 TypeScript files across planned structure

**Actual Implementation:** 21 TypeScript files

- `src/build/`: 4 files (vs 7 planned - plugins consolidated)
- `src/cli/`: 1 file (as planned)
- `src/dev/`: 1 file (not in original plan, added in Phase 12)
- `src/runtime/client/`: 3 files (vs 5 planned - consolidated)
- `src/runtime/server/`: 5 files (vs 6 planned + added worker.ts)
- `src/runtime/shared/`: 5 files (vs 4 planned + added error-boundaries.ts, browser-runtime.ts)
- `src/types/`: 1 file
- `src/index.ts`: 1 file

**Conclusion:** Actual implementation has fewer but larger files. This is acceptable for v0/v1 but consider splitting for maintainability in future versions.
