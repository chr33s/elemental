export type BrowserModuleNamespace = Record<string, unknown>;

interface CustomElementDefinition {
  constructor: CustomElementConstructor;
  tagName: string;
}

export function collectCustomElementDefinitions(
  moduleNamespace: BrowserModuleNamespace,
  elementBaseClass: abstract new (...args: never[]) => object,
): CustomElementDefinition[] {
  const definitions: CustomElementDefinition[] = [];

  for (const exportedValue of Object.values(moduleNamespace)) {
    if (typeof exportedValue !== "function") {
      continue;
    }

    if (!(exportedValue.prototype instanceof elementBaseClass)) {
      continue;
    }

    const tagName = Reflect.get(exportedValue, "tagName");

    if (typeof tagName !== "string" || !isValidCustomElementTagName(tagName)) {
      continue;
    }

    definitions.push({
      constructor: exportedValue as CustomElementConstructor,
      tagName,
    });
  }

  return definitions;
}

export function registerCustomElementDefinitions(
  moduleNamespace: BrowserModuleNamespace,
  customElementRegistry: Pick<CustomElementRegistry, "define" | "get">,
  elementBaseClass: abstract new (...args: never[]) => object,
): void {
  for (const definition of collectCustomElementDefinitions(moduleNamespace, elementBaseClass)) {
    if (customElementRegistry.get(definition.tagName) !== undefined) {
      continue;
    }

    customElementRegistry.define(definition.tagName, definition.constructor);
  }
}

export function isValidCustomElementTagName(tagName: string): boolean {
  return /^[a-z](?:[.0-9_a-z-]*-[.0-9_a-z-]*)$/u.test(tagName);
}
