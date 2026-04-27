import { defineConfig } from "oxlint";

export default defineConfig({
  $schema: "./node_modules/oxlint/configuration_schema.json",
  ignorePatterns: ["dist", "node_modules", "playwright-report", "test-results"],
  jsPlugins: ["./oxlint-elemental-plugin.js"],
  options: {
    typeAware: true,
  },
  plugins: ["import", "jsdoc", "node", "oxc", "promise", "typescript", "unicorn", "vitest"],
  rules: {
    "elemental/no-browser-globals-at-top-level": "error",
    "elemental/no-customelements-define": "error",
    "elemental/no-default-with-loader-action": "error",
    "elemental/no-htmlelement-in-server-module": "error",
    "elemental/no-server-import-in-browser": "error",
    "elemental/no-unsafe-safe-html": "error",
    "elemental/require-tag-name": "error",
    "elemental/valid-tag-name": "error",
    "typescript/await-thenable": "error",
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
  },
});
