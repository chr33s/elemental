import { readFile } from "node:fs/promises";
import { parseSync } from "oxc-parser";

export async function validateModuleWithOxc(filePath: string): Promise<void> {
  const sourceText = await readFile(filePath, "utf8");
  const result = parseSync(filePath, sourceText, {
    lang: languageForPath(filePath),
    sourceType: "module",
  });

  if (result.errors.length === 0) {
    return;
  }

  const formattedErrors = result.errors
    .map((error) => error.codeframe ?? error.message)
    .join("\n\n");

  throw new Error(`oxc validation failed for ${filePath}\n\n${formattedErrors}`);
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
