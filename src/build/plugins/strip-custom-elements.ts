import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "esbuild";
import { stripNamedHTMLElementExportsFromServerModule } from "../oxc.ts";

export function createServerBundleTransformPlugin(appDir: string): Plugin {
  return {
    name: "elemental-server-bundle-transform",
    setup(build) {
      build.onLoad({ filter: /\.(ts|tsx)$/ }, async (args) => {
        if (!isAppRouteOrLayoutModule(args.path, appDir)) {
          return undefined;
        }

        const sourceText = await readFile(args.path, "utf8");

        return {
          contents: stripNamedHTMLElementExportsFromServerModule(args.path, sourceText),
          loader: args.path.endsWith(".tsx") ? "tsx" : "ts",
        };
      });
    },
  };
}

function isAppRouteOrLayoutModule(filePath: string, appDir: string): boolean {
  const relativePath = path.relative(appDir, filePath);
  const fileName = path.basename(filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return false;
  }

  return fileName === "index.ts" || fileName === "layout.ts";
}
