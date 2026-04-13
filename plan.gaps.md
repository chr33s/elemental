# Elemental v1 Readiness Gap Analysis

## Summary

This document reviews the current Elemental implementation against `plan.md` after the build/runtime refactor, documentation updates, and verification work completed on the `claude/review-implementation-for-v1` branch.

**Overall Status**: The framework is functionally ready for v1 by the original critical and high-priority bar from this gap analysis. The previously identified implementation blockers are now closed:

1. Root package command flows now support `build`, `dev`, `start`, `test`, and `typecheck`.
2. Explicit missing Phase 9 tests were added.
3. API, deployment, versioning, and upgrade documentation now exist.
4. Deployment smoke tests are part of the main automated test suite.
5. The runtime/build module layout was refactored to align much more closely with the planned structure.

What remains is mostly follow-up polish rather than release-blocking correctness work:

- richer dev-mode troubleshooting guidance,
- benchmark coverage and reporting, and
- optional CI workflow materialization if the repository wants an in-repo GitHub Actions definition.

---

## Phase-by-Phase Status

### Phase 1: Bootstrap The Framework Skeleton ✅ COMPLETE

**Current Evidence:**

- Root scripts exist in `package.json` for `build`, `dev`, `start`, `test`, and `typecheck`.
- TypeScript, `esbuild`, `oxc`, `vitest`, and `playwright` are configured and exercised by the current test flow.
- The CLI entrypoint supports build and dev flows.

**Status:** No remaining implementation gap.

---

### Phase 2: Implement The Core HTML Runtime ✅ COMPLETE

**Current Evidence:**

- Core HTML runtime remains implemented in `src/runtime/shared/html.ts`.
- Behavior is covered by `tests/unit/html.test.ts`.

**Status:** No remaining implementation gap.

---

### Phase 3: Build Route Discovery And Validation ✅ COMPLETE

**Current Evidence:**

- Route discovery and validation remain implemented in `src/build/discover.ts`.
- Matching and graph behavior are covered by `tests/unit/routes.test.ts` and `tests/unit/build.test.ts`.

**Status:** No remaining implementation gap.

---

### Phase 4: Build The Bundling Pipeline ✅ COMPLETE

**Current Evidence:**

- Build orchestration remains in `src/build/index.ts`.
- Plugins now live under `src/build/plugins/`:
  - `css.ts`
  - `server-boundary.ts`
  - `strip-custom-elements.ts`
- Manifest types and writing remain in `src/build/manifest.ts`.
- Build behavior is covered by `tests/unit/build.test.ts` and `tests/unit/universal-targets.test.ts`.

**Status Changes Since The Original Gap Draft:**

- The old plugin-organization gap is closed.
- The old "inline plugin" recommendation is now stale.

**Residual Note:** Manifest creation is still orchestrated from `src/build/index.ts`, which is acceptable for v1 and documented by the current architecture.

---

### Phase 5: Implement The Server Runtime ✅ COMPLETE

**Current Evidence:**

- Public exports live in `src/runtime/server/app.ts`.
- Request orchestration lives in `src/runtime/server/core.ts`.
- Dedicated server modules now exist:
  - `assets.ts`
  - `errors.ts`
  - `render-document.ts`
  - `render-partial.ts`
  - `routing.ts`
  - `node.ts`
  - `worker.ts`

**Status Changes Since The Original Gap Draft:**

- The old "missing dedicated files" gap is closed.

---

### Phase 6: Implement Error Resolution And Recovery ✅ COMPLETE

**Current Evidence:**

- Shared resolution helpers are in `src/runtime/shared/error-boundaries.ts`.
- Client recovery logic remains in `src/runtime/client/errors.ts`.
- Server error rendering now lives in `src/runtime/server/errors.ts`.
- Behavior is covered by `tests/unit/error-runtime.test.ts` and `tests/unit/client-errors.test.ts`.

**Status:** No remaining implementation gap.

---

### Phase 7: Implement The Browser Runtime ✅ COMPLETE

**Current Evidence:**

- Client runtime entrypoint remains `src/runtime/client/bootstrap.ts`.
- Dedicated browser runtime modules now exist:
  - `navigation.ts`
  - `head.ts`
  - `forms.ts`
  - `register-elements.ts`
  - `errors.ts`
  - `dev-client.ts`

**Status Changes Since The Original Gap Draft:**

- The old "bootstrap.ts contains everything" gap is closed.

---

### Phase 8: Implement Styling And Asset Composition ✅ COMPLETE

**Current Evidence:**

- CSS target handling is implemented in `src/build/plugins/css.ts`.
- Document/head asset rendering is implemented in `src/runtime/server/assets.ts` and `src/runtime/server/render-document.ts`.
- Scoped CSS SSR behavior is covered by unit tests.

**Status:** No remaining implementation gap.

---

### Phase 9: Testing Matrix ✅ COMPLETE

**Current Evidence:**

- Explicit action-response bypass coverage exists in `tests/unit/server-runtime.test.ts`.
- Explicit `error.ts` `head()` recovery coverage exists in `tests/e2e/smoke.spec.ts`.
- Core server/client/build/error behavior remains covered across unit and e2e suites.

**Status Changes Since The Original Gap Draft:**

- Both previously missing explicit Phase 9 tests are now present.

**Residual Note:** Dev-mode edge-case coverage can still expand over time, but the original missing Phase 9 correctness gaps are closed.

---

### Phase 10: Documentation And Example App ✅ COMPLETE

**Current Evidence:**

- `readme.md` now contains:
  - command documentation,
  - authoring model and examples,
  - API reference,
  - deployment guidance,
  - release checklist,
  - versioning and compatibility notes,
  - upgrade guidance.
- `spec/fixtures/basic-app/src` remains the runnable canonical example app.

**Status Changes Since The Original Gap Draft:**

- The old API-reference gap is closed.
- The old deployment-doc gap is closed.
- The old migration/upgrade gap is closed.
- The old release-checklist verification concern was addressed by wiring the root `build`/`start` flow and validating the full test/build path.

---

### Phase 11: Gaps ✅ COMPLETE

**Current Evidence:**

- Public package entrypoints and CLI bin remain configured in `package.json`.
- Non-`Response` action handling remains enforced and covered by tests.

**Status:** No remaining implementation gap.

---

### Phase 12: Developer Reloading ✅ COMPLETE

**Current Evidence:**

- `elemental dev` is implemented.
- Dev-mode behavior is covered by `tests/unit/dev.test.ts` and `tests/e2e/dev.spec.ts`.
- The README documents dev update modes and HMR/reload behavior.

**Residual Follow-Up:**

- Dev-mode troubleshooting documentation could still be expanded with a dedicated "common failure modes" section.
- This is a polish item, not a release blocker.

---

### Phase 13: Universal Deployment Targets ✅ COMPLETE

**Current Evidence:**

- Shared server core remains host-agnostic.
- Node and Worker targets remain implemented.
- Deployment wrappers exist under `spec/fixtures/deploy-srvx/` and `spec/fixtures/deploy-wrangler/`.
- Deployment smoke coverage is now part of the main unit suite in `tests/unit/deployment-fixtures.test.ts`.

**Status Changes Since The Original Gap Draft:**

- The old "deployment smoke tests are manual-only" gap is closed for the repository test suite.
- Deployment documentation now exists in the README.

**Residual Follow-Up:**

- There is no in-repo GitHub Actions workflow at the time of this review, so "CI pipeline integration" is only implicitly satisfied through `npm test`, not via a committed workflow definition.

---

## Cross-Cutting Status

### Repository Structure vs Plan ✅ ADDRESSED

The earlier structure mismatch is no longer an active concern for v1 readiness:

- build plugins were extracted to `src/build/plugins/`,
- client runtime responsibilities were split into dedicated files,
- server runtime responsibilities were split into dedicated files,
- `src/runtime/shared/responses.ts` now exists, and
- `architecture.md` documents the resulting structure and rationale.

Residual differences from `plan.md` are minor and acceptable:

- `src/dev/` exists as an additional phase-12 area,
- `browser-runtime.ts` and `error-boundaries.ts` remain useful support modules beyond the original sketch,
- `core.ts` still serves as the top-level orchestration point.

### Type Safety And Exports ✅ ADDRESSED FOR V1

The earlier documentation gap around versioning and deprecation is now closed by README sections for:

- semantic versioning,
- compatibility surface, and
- deprecation policy.

Type-only versus runtime export documentation could still be expanded if needed, but it is not a v1 blocker.

### Test Organization ✅ ADDRESSED FOR V1

The earlier gap-analysis claim that deployment smoke coverage was outside the main suite is stale. The repository now includes those checks in `tests/unit/deployment-fixtures.test.ts` and the top-level `npm test` path remains green.

---

## Remaining Follow-Up Items

These are the items that still exist after the current re-review. They are not blocking the original v1-readiness bar, but they remain reasonable post-v1 work.

### Medium Priority Follow-Up

1. **Expand dev troubleshooting docs**
   - Add concrete guidance for watcher failures, rebuild loops, port binding issues, and browser reload fallback scenarios.

2. **Clarify CI expectations**
   - If the repository wants explicit CI/CD configuration in-tree, add a GitHub Actions workflow or equivalent definition that runs lint, typecheck, and tests.

### Low Priority Follow-Up

3. **Add benchmark coverage**
   - Build-time benchmarks
   - SSR/runtime benchmarks
   - Client-navigation benchmarks

4. **Expand internal implementation notes where helpful**
   - Add more code comments or internal docs only if future maintenance pressure justifies them.

---

## Final Assessment

The current branch has completed the substantive work that originally prevented `plan.gaps.md` from confirming v1 readiness.

### Closed Since The Original Gap Draft

- Root command flow (`build`, `dev`, `start`) exists and works.
- API reference exists.
- Deployment guide exists.
- Versioning and upgrade guidance exist.
- Explicit missing tests were added.
- Deployment smoke tests are in the automated suite.
- The build/runtime module layout was refactored to align with the planned structure.
- `responses.ts` now exists.
- `architecture.md` now documents the actual module organization.

### Conclusion

By the original critical and high-priority criteria, Elemental is ready for v1.

The remaining work is optional polish rather than missing framework capability or unverified core behavior.
