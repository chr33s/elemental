import { defineConfig } from "oxlint";

export default defineConfig({
  $schema: "./node_modules/oxlint/configuration_schema.json",
  ignorePatterns: ["dist", "node_modules", "playwright-report", "test-results"],
  options: {
    typeAware: true,
  },
  plugins: ["import", "jsdoc", "node", "oxc", "promise", "typescript", "unicorn", "vitest"],
  rules: {
    "typescript/await-thenable": "error",
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
  },
});
