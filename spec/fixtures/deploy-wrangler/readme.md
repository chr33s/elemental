# deploy-wrangler

Thin spec wrapper around `../basic-app/src` for the Worker deployment target.

- `npm run build` emits the shared app into this fixture's `dist/` directory using `--target worker`.
- `npm run preview:config` rewrites the generated `dist/wrangler.jsonc` into a fixture-root `wrangler.jsonc` for local preview.
- `npm run dev` builds once and starts Wrangler against that fixture-root preview config.
- `npm run start` aliases the same Wrangler preview flow.
- `npm run smoke` builds the fixture, executes `dist/worker.js`, and verifies an SSR route plus asset delegation through `ASSETS.fetch()`.
- `dist/worker.js` is the generated Worker entrypoint.
- `dist/wrangler.jsonc` is the generated Wrangler config that points at the built artifacts.
- `wrangler.jsonc` is the local preview config and points at `./dist/worker.js` and `./dist`.

Run `npm install` in this fixture before using `dev` or `start` so the local `wrangler` dependency is available.
