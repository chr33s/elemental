import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BuildManifest } from "../build/manifest.ts";

const DEV_CLIENT_SENTINEL = "data-elemental-dev-client";

export type DevUpdateStrategy = "css" | "reload" | "route";

export function injectDevClientScript(documentMarkup: string, devClientHref: string): string {
  if (documentMarkup.includes(DEV_CLIENT_SENTINEL)) {
    return documentMarkup;
  }

  const escapedHref = devClientHref.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const scriptTag = `<script ${DEV_CLIENT_SENTINEL}="true" type="module" src="${escapedHref}"></script>`;

  if (documentMarkup.includes("</head>")) {
    return documentMarkup.replace("</head>", `${scriptTag}</head>`);
  }

  if (documentMarkup.includes("<body")) {
    return documentMarkup.replace(/<body([^>]*)>/u, `<body$1>${scriptTag}`);
  }

  return `${scriptTag}${documentMarkup}`;
}

export function hasRouteGraphChanged(
  previousManifest: BuildManifest,
  nextManifest: BuildManifest,
): boolean {
  return (
    JSON.stringify(summarizeManifest(previousManifest)) !==
    JSON.stringify(summarizeManifest(nextManifest))
  );
}

export async function classifyDevUpdate(options: {
  appDir: string;
  changedFiles: string[];
  nextManifest: BuildManifest;
  previousManifest: BuildManifest;
  readTextFile?: (filePath: string) => Promise<string>;
}): Promise<DevUpdateStrategy> {
  if (
    options.changedFiles.length === 0 ||
    hasRouteGraphChanged(options.previousManifest, options.nextManifest)
  ) {
    return "reload";
  }

  let sawLayoutCss = false;
  const readTextFile = options.readTextFile ?? ((filePath: string) => readFile(filePath, "utf8"));

  for (const changedFile of options.changedFiles) {
    if (changedFile === "__unknown__") {
      return "reload";
    }

    const absolutePath = path.resolve(changedFile);
    const relativePath = path.relative(options.appDir, absolutePath);
    const fileName = path.basename(absolutePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return "reload";
    }

    if (fileName === "layout.css") {
      sawLayoutCss = true;
      continue;
    }

    if (absolutePath.endsWith(".server.ts") || absolutePath.endsWith(".server.tsx")) {
      return "reload";
    }

    if (absolutePath.endsWith(".css")) {
      return "reload";
    }

    if (!/\.[cm]?[jt]sx?$/u.test(absolutePath)) {
      return "reload";
    }

    const sourceText = await readTextFile(absolutePath).catch(() => "");

    if (looksLikeCustomElementModule(sourceText)) {
      return "reload";
    }
  }

  return sawLayoutCss ? "css" : "route";
}

function summarizeManifest(manifest: BuildManifest) {
  return manifest.routes.map((route) => ({
    errorBoundaries: route.errorBoundaries,
    layoutStylesheets: route.layoutStylesheets,
    layouts: route.layouts,
    pattern: route.pattern,
    serverErrorBoundaries: route.serverErrorBoundaries,
    serverSource: route.serverSource,
    source: route.source,
  }));
}

function looksLikeCustomElementModule(sourceText: string): boolean {
  return /extends\s+HTMLElement\b|static\s+tagName\s*=|customElements\.define\s*\(/u.test(
    sourceText,
  );
}
