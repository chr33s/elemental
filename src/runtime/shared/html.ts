const HTML_RESULT_TOKEN = Symbol("htmlResultToken");
const SAFE_HTML_BRAND = Symbol("safeHtml");
const ATTRIBUTE_ASSIGNMENT_PATTERN = /[^\s"'<>/=]+(?:\s*=\s*)$/;
const DIRECT_HTML_RESULT_CONSTRUCTION_ERROR =
  "HtmlResult cannot be constructed directly. Use html`...` or safeHtml().";

export type SafeHtmlValue = {
  readonly value: string;
  readonly [SAFE_HTML_BRAND]: true;
};

export type HtmlRenderable =
  | HtmlResult
  | SafeHtmlValue
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | HtmlRenderable[];

type QuoteCharacter = '"' | "'";

interface TemplateParserState {
  inTag: boolean;
  quote: QuoteCharacter | null;
}

export class HtmlResult {
  readonly value: string;

  constructor(value: string, token?: symbol) {
    if (token !== HTML_RESULT_TOKEN) {
      throw new TypeError(DIRECT_HTML_RESULT_CONSTRUCTION_ERROR);
    }

    this.value = value;
  }

  toString(): string {
    return this.value;
  }
}

export function html(strings: TemplateStringsArray, ...values: HtmlRenderable[]): HtmlResult {
  let output = "";
  const parserState: TemplateParserState = {
    inTag: false,
    quote: null,
  };

  for (let index = 0; index < strings.length; index += 1) {
    const currentString = strings[index] ?? "";

    output += currentString;
    updateTemplateParserState(parserState, currentString);

    if (index < values.length) {
      output += renderTemplateValue(values[index], {
        quoteAttributeValue: shouldQuoteAttributeValue(
          currentString,
          strings[index + 1] ?? "",
          parserState,
        ),
      });
    }
  }

  return createHtmlResult(output);
}

export function safeHtml(value: string): SafeHtmlValue {
  return {
    [SAFE_HTML_BRAND]: true,
    value,
  };
}

export function renderToString(value: HtmlRenderable): string {
  return renderRenderable(value);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createHtmlResult(value: string): HtmlResult {
  return new HtmlResult(value, HTML_RESULT_TOKEN);
}

function isSafeHtmlValue(value: HtmlRenderable): value is SafeHtmlValue {
  return typeof value === "object" && value !== null && SAFE_HTML_BRAND in value;
}

function renderTemplateValue(
  value: HtmlRenderable,
  options: {
    quoteAttributeValue: boolean;
  },
): string {
  const renderedValue = renderRenderable(value);

  if (!options.quoteAttributeValue) {
    return renderedValue;
  }

  return `"${renderedValue}"`;
}

function renderRenderable(value: HtmlRenderable): string {
  if (value instanceof HtmlResult) {
    return value.value;
  }

  if (isSafeHtmlValue(value)) {
    return value.value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => renderRenderable(entry)).join("");
  }

  if (value === false || value === null || value === undefined) {
    return "";
  }

  return escapeHtml(String(value));
}

function shouldQuoteAttributeValue(
  previousString: string,
  nextString: string,
  parserState: TemplateParserState,
): boolean {
  if (!parserState.inTag || parserState.quote !== null) {
    return false;
  }

  if (!ATTRIBUTE_ASSIGNMENT_PATTERN.test(previousString)) {
    return false;
  }

  if (nextString.length === 0) {
    return true;
  }

  return /^[\s/>]/.test(nextString);
}

function updateTemplateParserState(parserState: TemplateParserState, segment: string): void {
  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index];

    if (parserState.quote !== null) {
      if (character === parserState.quote) {
        parserState.quote = null;
      }

      continue;
    }

    if (character === "<") {
      parserState.inTag = true;
      continue;
    }

    if (character === ">") {
      parserState.inTag = false;
      continue;
    }

    if (!parserState.inTag) {
      continue;
    }

    if (character === '"' || character === "'") {
      parserState.quote = character;
    }
  }
}
