import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseSync } from "oxc-parser";

type LooseNode = {
  [key: string]: unknown;
  type?: string;
};

interface ModuleRecord {
  staticExports: Array<{
    entries: Array<{
      exportName: { kind: string; name: string | null };
      isType: boolean;
      localName: { kind: string; name: string | null };
    }>;
  }>;
}

export async function validateModuleWithOxc(filePath: string): Promise<void> {
  const sourceText = await readFile(filePath, "utf8");
  const result = parseSync(filePath, sourceText, {
    lang: languageForPath(filePath),
    range: true,
    sourceType: "module",
  });
  const syntaxErrors = result.errors.map((error) => error.codeframe ?? error.message);
  const conventionErrors = collectConventionErrors(
    filePath,
    result.program,
    result.module as ModuleRecord,
  );

  if (syntaxErrors.length === 0 && conventionErrors.length === 0) {
    return;
  }

  throw new Error(
    `oxc validation failed for ${filePath}\n\n${[...syntaxErrors, ...conventionErrors].join("\n\n")}`,
  );
}

function collectConventionErrors(
  filePath: string,
  program: unknown,
  moduleRecord: ModuleRecord,
): string[] {
  const fileName = path.basename(filePath);
  const errors: string[] = [];

  if (fileName === "index.server.ts") {
    const hasDefaultExport = exportsDefault(moduleRecord);
    const exportsLoader = exportsNamed(moduleRecord, "loader");
    const exportsAction = exportsNamed(moduleRecord, "action");

    if (hasDefaultExport && (exportsLoader || exportsAction)) {
      const invalidExports = [
        exportsLoader ? "loader()" : undefined,
        exportsAction ? "action()" : undefined,
      ]
        .filter((value) => value !== undefined)
        .join(" and ");

      errors.push(
        `Route server modules must not combine a default export with ${invalidExports}. Split full-response handling from loader/action logic in ${filePath}.`,
      );
    }
  }

  if (fileName === "index.server.ts" || fileName === "error.server.ts") {
    errors.push(...collectServerOnlyCustomElementErrors(filePath, program, moduleRecord));
  }

  if (fileName === "index.ts" || fileName === "layout.ts") {
    errors.push(...collectBrowserCustomElementErrors(filePath, program, moduleRecord));
  }

  return errors;
}

function exportsDefault(moduleRecord: ModuleRecord): boolean {
  return moduleRecord.staticExports.some((exportStatement) =>
    exportStatement.entries.some(
      (entry) =>
        !entry.isType &&
        (entry.exportName.kind === "Default" || entry.exportName.name === "default"),
    ),
  );
}

function exportsNamed(moduleRecord: ModuleRecord, exportName: string): boolean {
  return moduleRecord.staticExports.some((exportStatement) =>
    exportStatement.entries.some(
      (entry) =>
        !entry.isType && entry.exportName.kind === "Name" && entry.exportName.name === exportName,
    ),
  );
}

function collectBrowserCustomElementErrors(
  filePath: string,
  program: unknown,
  moduleRecord: ModuleRecord,
): string[] {
  const errors: string[] = [];

  for (const exportedClass of collectExportedHTMLElementClasses(program, moduleRecord)) {
    const tagName = getStaticTagNameLiteral(exportedClass.node);

    if (tagName === undefined) {
      errors.push(
        `Exported HTMLElement subclass ${exportedClass.name} in ${filePath} must define a static tagName string.`,
      );
      continue;
    }

    if (!tagName.includes("-")) {
      errors.push(
        `Exported HTMLElement subclass ${exportedClass.name} in ${filePath} must use a tagName containing a hyphen.`,
      );
    }
  }

  return errors;
}

function collectServerOnlyCustomElementErrors(
  filePath: string,
  program: unknown,
  moduleRecord: ModuleRecord,
): string[] {
  return collectExportedHTMLElementClasses(program, moduleRecord).map(
    (exportedClass) =>
      `Custom element class ${exportedClass.name} must not be exported from server-only module ${filePath}. Move it to a browser module such as index.ts or layout.ts.`,
  );
}

function collectExportedHTMLElementClasses(
  program: unknown,
  moduleRecord: ModuleRecord,
): Array<{ name: string; node: LooseNode }> {
  const programNode = asNode(program);

  if (programNode === null) {
    return [];
  }

  const body = Array.isArray(programNode.body) ? programNode.body : [];
  const classDeclarations = new Map<string, LooseNode>();

  for (const statement of body) {
    const node = asNode(statement);

    if (node === null) {
      continue;
    }

    if (node.type === "ClassDeclaration") {
      const className = getIdentifierName(node.id);

      if (className !== undefined) {
        classDeclarations.set(className, node);
      }

      continue;
    }

    if (node.type !== "ExportNamedDeclaration") {
      continue;
    }

    const declaration = asNode(node.declaration);

    if (declaration?.type !== "ClassDeclaration") {
      continue;
    }

    const className = getIdentifierName(declaration.id);

    if (className !== undefined) {
      classDeclarations.set(className, declaration);
    }
  }

  const exportedClasses: Array<{ name: string; node: LooseNode }> = [];

  for (const localName of getNamedExportLocalNames(moduleRecord)) {
    const classDeclaration = classDeclarations.get(localName);

    if (classDeclaration === undefined || !extendsHTMLElement(classDeclaration)) {
      continue;
    }

    exportedClasses.push({
      name: localName,
      node: classDeclaration,
    });
  }

  return exportedClasses;
}

function getNamedExportLocalNames(moduleRecord: ModuleRecord): Set<string> {
  const localNames = new Set<string>();

  for (const exportStatement of moduleRecord.staticExports) {
    for (const entry of exportStatement.entries) {
      if (entry.isType || entry.exportName.kind !== "Name" || entry.localName.kind !== "Name") {
        continue;
      }

      if (entry.localName.name !== null) {
        localNames.add(entry.localName.name);
      }
    }
  }

  return localNames;
}

function asNode(value: unknown): LooseNode | null {
  if (value === null || typeof value !== "object") {
    return null;
  }

  return value as LooseNode;
}

function getIdentifierName(value: unknown): string | undefined {
  const node = asNode(value);

  if (node?.type !== "Identifier" || typeof node.name !== "string") {
    return undefined;
  }

  return node.name;
}

function extendsHTMLElement(classDeclaration: LooseNode): boolean {
  return getIdentifierName(classDeclaration.superClass) === "HTMLElement";
}

function getStaticTagNameLiteral(classDeclaration: LooseNode): string | undefined {
  const classBody = asNode(classDeclaration.body);
  const body = Array.isArray(classBody?.body) ? classBody.body : [];

  for (const element of body) {
    const property = asNode(element);

    if (property?.type !== "PropertyDefinition" || property.static !== true) {
      continue;
    }

    if (getIdentifierName(property.key) !== "tagName") {
      continue;
    }

    const value = asNode(property.value);

    if (value?.type !== "Literal" || typeof value.value !== "string") {
      return undefined;
    }

    return value.value;
  }

  return undefined;
}

function languageForPath(filePath: string): "dts" | "js" | "jsx" | "ts" | "tsx" {
  if (filePath.endsWith(".d.ts")) {
    return "dts";
  }

  if (filePath.endsWith(".tsx")) {
    return "tsx";
  }

  if (filePath.endsWith(".ts")) {
    return "ts";
  }

  if (filePath.endsWith(".jsx")) {
    return "jsx";
  }

  return "js";
}
