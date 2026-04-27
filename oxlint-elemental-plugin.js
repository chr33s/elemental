// Elemental oxlint plugin.
//
// These rules encode framework conventions that complement build-time enforcement:
// - `no-unsafe-safe-html`         flags direct `safeHtml()` use in route-facing modules.
// - `no-server-import-in-browser` flags imports of `*.server.*` modules from browser-reachable files.
// - `no-customelements-define`    flags manual `customElements.define()` in auto-registered modules.
// - `require-tag-name`            flags HTMLElement subclasses that omit `static tagName`.
// - `valid-tag-name`              flags `static tagName` values that are not a hyphenated string literal.
// - `no-htmlelement-in-server-module` flags HTMLElement subclasses inside `*.server.ts` files.
// - `no-default-with-loader-action`   flags `index.server.ts` files exporting both a default handler
//                                     and `loader`/`action`.
// - `no-browser-globals-at-top-level` flags top-level references to browser globals in isomorphic
//                                     route/layout/error modules.
//
// Filename heuristics rely on Elemental's filesystem conventions. Files with the well-known
// route module names (`index.ts`, `index.server.ts`, `layout.ts`, `error.ts`, `error.server.ts`)
// are treated as the corresponding role regardless of where they live in the source tree.

const ROUTE_MODULE_FILE_NAMES = new Set([
  "error.server.ts",
  "error.ts",
  "index.server.ts",
  "index.ts",
  "layout.ts",
]);

const BROWSER_REACHABLE_FILE_NAMES = new Set(["error.ts", "index.ts", "layout.ts"]);

const AUTO_REGISTER_FILE_NAMES = new Set(["index.ts", "layout.ts"]);

const SERVER_FILE_NAMES = new Set(["error.server.ts", "index.server.ts"]);

const BROWSER_GLOBALS = new Set([
  "customElements",
  "document",
  "history",
  "localStorage",
  "location",
  "navigator",
  "sessionStorage",
  "window",
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
    if (!isRouteModuleFile(getFilename(context))) {
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

const noServerImportInBrowserRule = {
  meta: {
    docs: {
      description:
        "Disallow imports of *.server.* modules from browser-reachable files (index.ts, layout.ts, error.ts).",
    },
    messages: {
      serverImport:
        "Browser-reachable modules must not import server-only files. '{{source}}' is a *.server.* module and would leak into the browser bundle.",
    },
    schema: [],
    type: "problem",
  },
  create(context) {
    const filename = getFilename(context);

    if (!isBrowserReachableRouteFile(filename) && !isLikelyBrowserModule(filename)) {
      return {};
    }

    function check(node, source) {
      if (typeof source !== "string") {
        return;
      }

      if (isServerSpecifier(source)) {
        context.report({
          data: { source },
          messageId: "serverImport",
          node,
        });
      }
    }

    return {
      ExportAllDeclaration(node) {
        check(node.source, node.source?.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          check(node.source, node.source.value);
        }
      },
      ImportDeclaration(node) {
        check(node.source, node.source?.value);
      },
    };
  },
};

const noCustomElementsDefineRule = {
  meta: {
    docs: {
      description:
        "Disallow manual customElements.define() in modules where Elemental auto-registers exported elements.",
    },
    messages: {
      manualDefine:
        "customElements.define() is unnecessary in {{file}}. Export the class with `static tagName` and Elemental will register it automatically.",
    },
    schema: [],
    type: "problem",
  },
  create(context) {
    const filename = getFilename(context);

    if (!isAutoRegisterFile(filename)) {
      return {};
    }

    const baseName = basename(filename);

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee?.type === "MemberExpression" &&
          callee.object?.type === "Identifier" &&
          callee.object.name === "customElements" &&
          callee.property?.type === "Identifier" &&
          callee.property.name === "define"
        ) {
          context.report({
            data: { file: baseName },
            messageId: "manualDefine",
            node: callee,
          });
        }
      },
    };
  },
};

const requireTagNameRule = {
  meta: {
    docs: {
      description:
        "Require exported HTMLElement subclasses to declare a `static tagName` for auto-registration.",
    },
    messages: {
      missingTagName:
        "Exported custom element class '{{name}}' must declare `static tagName = \"el-...\"`. Without it, Elemental cannot auto-register the element.",
    },
    schema: [],
    type: "problem",
  },
  create(context) {
    if (!isAutoRegisterFile(getFilename(context))) {
      return {};
    }

    function check(node, name) {
      if (!extendsHtmlElement(node)) {
        return;
      }

      if (hasStaticTagName(node)) {
        return;
      }

      context.report({
        data: { name: name ?? "<anonymous>" },
        messageId: "missingTagName",
        node,
      });
    }

    return {
      ExportNamedDeclaration(node) {
        const declaration = node.declaration;
        if (declaration?.type === "ClassDeclaration") {
          check(declaration, declaration.id?.name);
        } else if (declaration?.type === "VariableDeclaration") {
          for (const declarator of declaration.declarations ?? []) {
            if (declarator.init?.type === "ClassExpression") {
              check(
                declarator.init,
                declarator.id?.type === "Identifier" ? declarator.id.name : undefined,
              );
            }
          }
        }
      },
    };
  },
};

const validTagNameRule = {
  meta: {
    docs: {
      description:
        "Require `static tagName` declarations to be string literals containing at least one hyphen.",
    },
    messages: {
      notLiteral:
        "`static tagName` must be a string literal so the framework can read it without executing the class body.",
      missingHyphen:
        "Custom element tag names must contain a hyphen. '{{value}}' is not a valid custom element tag name.",
    },
    schema: [],
    type: "problem",
  },
  create(context) {
    if (!isRouteModuleFile(getFilename(context))) {
      return {};
    }

    function inspectClass(classNode) {
      if (!extendsHtmlElement(classNode)) {
        return;
      }

      for (const member of classNode.body?.body ?? []) {
        if (
          member.type === "PropertyDefinition" &&
          member.static === true &&
          member.key?.type === "Identifier" &&
          member.key.name === "tagName"
        ) {
          const value = member.value;
          if (!value || value.type !== "Literal" || typeof value.value !== "string") {
            context.report({ messageId: "notLiteral", node: value ?? member });
            return;
          }

          if (!value.value.includes("-")) {
            context.report({
              data: { value: value.value },
              messageId: "missingHyphen",
              node: value,
            });
          }
        }
      }
    }

    return {
      ClassDeclaration(node) {
        inspectClass(node);
      },
      ClassExpression(node) {
        inspectClass(node);
      },
    };
  },
};

const noHtmlelementInServerModuleRule = {
  meta: {
    docs: {
      description:
        "Disallow defining HTMLElement subclasses in *.server.ts files. HTMLElement is a browser-only global.",
    },
    messages: {
      htmlElementInServer:
        "HTMLElement is not available on the server. Move custom element classes out of *.server.ts files.",
    },
    schema: [],
    type: "problem",
  },
  create(context) {
    if (!isServerOnlyFile(getFilename(context))) {
      return {};
    }

    function check(node) {
      if (extendsHtmlElement(node)) {
        context.report({ messageId: "htmlElementInServer", node });
      }
    }

    return {
      ClassDeclaration: check,
      ClassExpression: check,
    };
  },
};

const noDefaultWithLoaderActionRule = {
  meta: {
    docs: {
      description:
        "Disallow combining a default export with `loader`/`action` named exports in index.server.ts.",
    },
    messages: {
      conflict:
        "index.server.ts defines a default handler and a `{{name}}` export. The default handler fully owns the route response — remove `loader`/`action` or remove the default export.",
    },
    schema: [],
    type: "problem",
  },
  create(context) {
    if (basename(getFilename(context)) !== "index.server.ts") {
      return {};
    }

    let defaultExportNode = null;
    const reservedExportNodes = new Map();

    return {
      ExportDefaultDeclaration(node) {
        defaultExportNode = node;
      },
      ExportNamedDeclaration(node) {
        const declaration = node.declaration;
        if (declaration?.type === "FunctionDeclaration" && declaration.id) {
          if (declaration.id.name === "loader" || declaration.id.name === "action") {
            reservedExportNodes.set(declaration.id.name, declaration.id);
          }
        } else if (declaration?.type === "VariableDeclaration") {
          for (const declarator of declaration.declarations ?? []) {
            if (
              declarator.id?.type === "Identifier" &&
              (declarator.id.name === "loader" || declarator.id.name === "action")
            ) {
              reservedExportNodes.set(declarator.id.name, declarator.id);
            }
          }
        }

        for (const specifier of node.specifiers ?? []) {
          if (
            specifier.type === "ExportSpecifier" &&
            specifier.exported?.type === "Identifier" &&
            (specifier.exported.name === "loader" || specifier.exported.name === "action")
          ) {
            reservedExportNodes.set(specifier.exported.name, specifier.exported);
          }
        }
      },
      "Program:exit"() {
        if (!defaultExportNode || reservedExportNodes.size === 0) {
          return;
        }

        for (const [name, node] of reservedExportNodes) {
          context.report({
            data: { name },
            messageId: "conflict",
            node,
          });
        }
      },
    };
  },
};

const noBrowserGlobalsAtTopLevelRule = {
  meta: {
    docs: {
      description:
        "Disallow top-level references to browser globals in isomorphic route, layout, and error modules.",
    },
    messages: {
      topLevelGlobal:
        "Top-level reference to browser global '{{name}}' will execute on the server. Move it inside a method, function, or guard with `typeof {{name}} !== 'undefined'`.",
    },
    schema: [],
    type: "problem",
  },
  create(context) {
    if (!isBrowserReachableRouteFile(getFilename(context))) {
      return {};
    }

    let functionDepth = 0;

    function enter() {
      functionDepth += 1;
    }

    function exit() {
      functionDepth -= 1;
    }

    return {
      ArrowFunctionExpression: enter,
      "ArrowFunctionExpression:exit": exit,
      ClassDeclaration: enter,
      "ClassDeclaration:exit": exit,
      ClassExpression: enter,
      "ClassExpression:exit": exit,
      FunctionDeclaration: enter,
      "FunctionDeclaration:exit": exit,
      FunctionExpression: enter,
      "FunctionExpression:exit": exit,
      Identifier(node) {
        if (functionDepth > 0) {
          return;
        }

        if (!BROWSER_GLOBALS.has(node.name)) {
          return;
        }

        const parent = node.parent;
        if (!parent) {
          return;
        }

        // Allow `typeof window` style guards.
        if (parent.type === "UnaryExpression" && parent.operator === "typeof") {
          return;
        }

        // Skip identifiers used as keys, property names, or binding names.
        if (
          (parent.type === "MemberExpression" && parent.property === node && !parent.computed) ||
          (parent.type === "Property" && parent.key === node && !parent.computed) ||
          (parent.type === "PropertyDefinition" && parent.key === node && !parent.computed) ||
          (parent.type === "MethodDefinition" && parent.key === node && !parent.computed) ||
          (parent.type === "VariableDeclarator" && parent.id === node) ||
          (parent.type === "ImportSpecifier" &&
            (parent.local === node || parent.imported === node)) ||
          (parent.type === "ImportDefaultSpecifier" && parent.local === node) ||
          (parent.type === "ImportNamespaceSpecifier" && parent.local === node) ||
          parent.type === "ExportSpecifier"
        ) {
          return;
        }

        context.report({
          data: { name: node.name },
          messageId: "topLevelGlobal",
          node,
        });
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

function basename(filename) {
  const normalized = filename.replaceAll("\\", "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function isRouteModuleFile(filename) {
  return ROUTE_MODULE_FILE_NAMES.has(basename(filename));
}

function isBrowserReachableRouteFile(filename) {
  return BROWSER_REACHABLE_FILE_NAMES.has(basename(filename));
}

function isAutoRegisterFile(filename) {
  return AUTO_REGISTER_FILE_NAMES.has(basename(filename));
}

function isServerOnlyFile(filename) {
  const name = basename(filename);
  if (SERVER_FILE_NAMES.has(name)) {
    return true;
  }

  return /\.server\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(name);
}

function isLikelyBrowserModule(filename) {
  // Files explicitly named `*.client.ts` are also browser-reachable.
  return /\.client\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(basename(filename));
}

function isServerSpecifier(source) {
  return /(^|\/)[^/]+\.server(?:\.[a-z]+)?$/.test(source);
}

function extendsHtmlElement(classNode) {
  const superClass = classNode.superClass;
  if (!superClass) {
    return false;
  }

  if (superClass.type === "Identifier" && superClass.name === "HTMLElement") {
    return true;
  }

  // Support `extends globalThis.HTMLElement` and `window.HTMLElement`.
  if (
    superClass.type === "MemberExpression" &&
    superClass.property?.type === "Identifier" &&
    superClass.property.name === "HTMLElement" &&
    superClass.object?.type === "Identifier" &&
    (superClass.object.name === "globalThis" || superClass.object.name === "window")
  ) {
    return true;
  }

  return false;
}

function hasStaticTagName(classNode) {
  for (const member of classNode.body?.body ?? []) {
    if (
      member.type === "PropertyDefinition" &&
      member.static === true &&
      member.key?.type === "Identifier" &&
      member.key.name === "tagName"
    ) {
      return true;
    }
  }
  return false;
}

export default {
  meta: {
    name: "elemental",
  },
  rules: {
    "no-browser-globals-at-top-level": noBrowserGlobalsAtTopLevelRule,
    "no-customelements-define": noCustomElementsDefineRule,
    "no-default-with-loader-action": noDefaultWithLoaderActionRule,
    "no-htmlelement-in-server-module": noHtmlelementInServerModuleRule,
    "no-server-import-in-browser": noServerImportInBrowserRule,
    "no-unsafe-safe-html": noUnsafeSafeHtmlRule,
    "require-tag-name": requireTagNameRule,
    "valid-tag-name": validTagNameRule,
  },
};
