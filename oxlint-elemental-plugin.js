// TODO: Filename-based scoping is fragile — a non-route file like utils/error.ts would be
// flagged if it imports safeHtml. Consider matching on directory conventions if this produces
// false positives.
const ROUTE_MODULE_FILE_NAMES = new Set([
  "error.server.ts",
  "error.ts",
  "index.server.ts",
  "index.ts",
  "layout.ts",
]);

const noUnsafeSafeHtmlRule = {
  meta: {
    docs: {
      description: "Disallow direct safeHtml() usage in route-facing modules.",
    },
    messages: {
      unsafeSafeHtml:
        "Avoid direct safeHtml() in route-facing modules. Escape by default or sanitize the content first. If the usage is reviewed and intentional, disable elemental/no-unsafe-safe-html locally with an oxlint-disable comment and explain why.",
    },
    schema: [],
    type: "problem",
  },
  create(context) {
    const filename = getFilename(context);

    if (!isRouteModuleFile(filename)) {
      return {};
    }

    const importedSafeHtmlNames = new Set();

    return {
      CallExpression(node) {
        if (node.callee?.type !== "Identifier") {
          return;
        }

        if (!importedSafeHtmlNames.has(node.callee.name)) {
          return;
        }

        context.report({
          messageId: "unsafeSafeHtml",
          node: node.callee,
        });
      },
      ImportDeclaration(node) {
        if (node.source?.type !== "Literal" || node.source.value !== "elemental") {
          return;
        }

        for (const specifier of node.specifiers ?? []) {
          if (
            specifier.type === "ImportSpecifier" &&
            specifier.imported?.type === "Identifier" &&
            specifier.imported.name === "safeHtml" &&
            specifier.local?.type === "Identifier"
          ) {
            importedSafeHtmlNames.add(specifier.local.name);
          }
        }
      },
    };
  },
};

function getFilename(context) {
  if (typeof context.filename === "string") {
    return context.filename;
  }

  if (typeof context.getFilename === "function") {
    return context.getFilename();
  }

  return "<unknown>";
}

function isRouteModuleFile(filename) {
  const normalizedFilename = filename.replaceAll("\\", "/");
  const fileName = normalizedFilename.slice(normalizedFilename.lastIndexOf("/") + 1);

  return ROUTE_MODULE_FILE_NAMES.has(fileName);
}

export default {
  meta: {
    name: "elemental",
  },
  rules: {
    "no-unsafe-safe-html": noUnsafeSafeHtmlRule,
  },
};
