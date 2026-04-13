import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "esbuild";

export function createCssModulePlugin(target: "browser" | "server"): Plugin {
  const namespace = `elemental-css-${target}`;

  return {
    name: `elemental-css-${target}`,
    setup(build) {
      build.onResolve({ filter: /\.css$/ }, (args) => {
        const resolvedPath = path.resolve(args.resolveDir, args.path);

        if (path.basename(resolvedPath) === "layout.css") {
          return {
            errors: [
              {
                text: `layout.css is a global asset and must not be imported directly: ${args.path}`,
              },
            ],
          };
        }

        return {
          namespace,
          path: resolvedPath,
        };
      });

      build.onLoad({ filter: /\.css$/, namespace }, async (args) => {
        const sourceText = await readFile(args.path, "utf8");

        return {
          contents:
            target === "browser"
              ? [
                  `const sheet = new CSSStyleSheet();`,
                  `sheet.replaceSync(${JSON.stringify(sourceText)});`,
                  `export default sheet;`,
                  "",
                ].join("\n")
              : [
                  `import { cssText } from "elemental";`,
                  `const stylesheet = cssText(${JSON.stringify(sourceText)});`,
                  `export default stylesheet;`,
                  "",
                ].join("\n"),
          loader: "js",
        };
      });
    },
  };
}
