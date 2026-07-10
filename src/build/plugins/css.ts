import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "esbuild";

export function createCssModulePlugin(target: "browser" | "server"): Plugin {
	const namespace = `elemental-css-${target}`;
	// Marker namespace for re-entrant build.resolve calls so bare package
	// specifiers fall through to esbuild's node_modules resolution.
	const resolutionNamespace = `${namespace}-resolution`;

	return {
		name: `elemental-css-${target}`,
		setup(build) {
			build.onResolve({ filter: /\.css$/ }, async (args) => {
				if (args.namespace === resolutionNamespace) {
					return undefined;
				}

				let resolvedPath: string;

				if (args.path.startsWith(".") || path.isAbsolute(args.path)) {
					resolvedPath = path.resolve(args.resolveDir, args.path);
				} else {
					const resolution = await build.resolve(args.path, {
						importer: args.importer,
						kind: args.kind,
						namespace: resolutionNamespace,
						resolveDir: args.resolveDir,
					});

					if (resolution.errors.length > 0) {
						return { errors: resolution.errors };
					}

					if (resolution.external) {
						return resolution;
					}

					resolvedPath = resolution.path;
				}

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
