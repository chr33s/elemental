# Elemental

## Requirements

- Node.js 24 LTS

## Scripts

- `npm run build` builds the framework entrypoints plus a stub fixture app into `dist/`
- `npm run dev` reruns the build command in watch mode using Node's built-in TypeScript support
- `npm run format` formats the workspace with `oxfmt`
- `npm run format:check` verifies formatting without writing changes
- `npm run lint` runs `oxlint` with type-aware TypeScript rules
- `npm run lint:fix` runs `oxlint` with autofix enabled
- `npm run start` starts the built server from `dist/server.js`
- `npm run test` runs the unit and browser smoke suites
- `npm run typecheck` runs TypeScript in strict no-emit mode
