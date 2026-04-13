# deploy-srvx

Thin spec wrapper around `../basic-app/src` for the Node deployment target.

- `npm run build` emits the shared app into this fixture's `dist/` directory using `--target node`.
- `npm run dev` builds once and previews the generated `dist/srvx.js` handler through the local `srvx` CLI.
- `npm run start` does the same with `srvx --prod`.
- `npm run smoke` builds the fixture, executes `dist/srvx.js`, and verifies an SSR route plus a generated browser asset.
- `dist/server.js` remains the baseline Node entrypoint.
- `dist/srvx.js` is the fetch-style deployment artifact for `srvx`-compatible hosts.

Run `npm install` in this fixture before using `dev` or `start` so the local `srvx` dependency is available.
