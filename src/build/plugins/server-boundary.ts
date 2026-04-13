import { builtinModules } from "node:module";
import path from "node:path";
import type { Plugin } from "esbuild";

const workerIncompatibleNodeBuiltins = new Set(
  builtinModules.flatMap((moduleName) => {
    const normalizedModuleName = moduleName.startsWith("node:")
      ? moduleName.slice("node:".length)
      : moduleName;

    return [normalizedModuleName, `node:${normalizedModuleName}`];
  }),
);

export function createBrowserServerBoundaryPlugin(): Plugin {
  return {
    name: "elemental-browser-server-boundary",
    setup(build) {
      build.onResolve({ filter: /(^|\/)(index|error)\.server(\.[cm]?[jt]sx?)?$/ }, (args) => ({
        errors: [
          {
            text: `Browser-reachable module ${args.importer || "<entry>"} must not import server-only module ${args.path}.`,
          },
        ],
      }));
    },
  };
}

export function createWorkerRuntimeValidationPlugin(appDir: string): Plugin {
  return {
    name: "elemental-worker-runtime-validation",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.importer === "" || !isWithinDirectory(args.importer, appDir)) {
          return undefined;
        }

        if (!workerIncompatibleNodeBuiltins.has(args.path)) {
          return undefined;
        }

        return {
          errors: [
            {
              text: `Worker-reachable server module ${args.importer} must not import Node builtin ${args.path}.`,
            },
          ],
        };
      });
    },
  };
}

function isWithinDirectory(filePath: string, directoryPath: string): boolean {
  const relativePath = path.relative(directoryPath, filePath);

  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}
