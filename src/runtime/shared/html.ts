const SAFE_HTML_BRAND = Symbol("safeHtml");

export type HtmlRenderable =
  | HtmlResult
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | HtmlRenderable[];

export class HtmlResult {
  readonly value: string;

  readonly [SAFE_HTML_BRAND] = true;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }
}

export function html(strings: TemplateStringsArray, ...values: HtmlRenderable[]): HtmlResult {
  let output = "";

  for (let index = 0; index < strings.length; index += 1) {
    output += strings[index] ?? "";

    if (index < values.length) {
      output += renderToString(values[index]);
    }
  }

  return new HtmlResult(output);
}

export function safeHtml(value: string): HtmlResult {
  return new HtmlResult(value);
}

export function renderToString(value: HtmlRenderable): string {
  if (value instanceof HtmlResult) {
    return value.value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => renderToString(entry)).join("");
  }

  if (value === false || value === null || value === undefined) {
    return "";
  }

  return escapeHtml(String(value));
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
