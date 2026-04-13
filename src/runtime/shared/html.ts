const HTML_RESULT_TOKEN = Symbol("htmlResultToken");
const HTML_RESULT_BRAND = Symbol.for("elemental.htmlResult");
const SAFE_HTML_BRAND = Symbol.for("elemental.safeHtml");
const CSS_TEXT_BRAND = Symbol.for("elemental.cssText");
const ATTRIBUTE_ASSIGNMENT_PATTERN = /[^\s"'<>/=]+(?:\s*=\s*)$/;
const DIRECT_HTML_RESULT_CONSTRUCTION_ERROR =
  "HtmlResult cannot be constructed directly. Use html`...` or safeHtml().";

type RawTextElement = "style";

/**
 * A trusted HTML value that will bypass escaping when interpolated.
 * Created via the `safeHtml()` function.
 */
export type SafeHtmlValue = {
  readonly value: string;
  readonly [SAFE_HTML_BRAND]: true;
};

/**
 * A CSS text value used for server-side CSS module imports.
 * The browser bundle transforms CSS imports to CSSStyleSheet instances.
 */
export type CssTextValue = {
  readonly raw: string;
  readonly [CSS_TEXT_BRAND]: true;
  toString(): string;
  valueOf(): string;
};

/**
 * Values that can be safely interpolated into HTML templates.
 * Arrays are flattened, primitives are coerced to strings,
 * and null/undefined/false are ignored.
 */
export type HtmlRenderable =
  | CssTextValue
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
  rawTextElement: RawTextElement | null;
  tagBuffer: string;
}

/**
 * The result of an `html` tagged template.
 * Cannot be constructed directly - use `html\`...\`` or `safeHtml()`.
 */
export class HtmlResult {
  readonly [HTML_RESULT_BRAND] = true;
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

/**
 * Tagged template for rendering HTML with automatic escaping.
 *
 * Interpolated values are escaped by default unless wrapped in `safeHtml()`.
 * Attribute values are automatically quoted. Arrays are flattened.
 * Null, undefined, and false are ignored.
 *
 * @example
 * ```ts
 * const name = "<script>";
 * html`<p>Hello ${name}</p>` // <p>Hello &lt;script&gt;</p>
 *
 * html`<div class=${className}>...</div>` // <div class="value">...</div>
 * ```
 */
export function html(strings: TemplateStringsArray, ...values: HtmlRenderable[]): HtmlResult {
  let output = "";
  const parserState: TemplateParserState = {
    inTag: false,
    quote: null,
    rawTextElement: null,
    tagBuffer: "",
  };

  for (let index = 0; index < strings.length; index += 1) {
    const currentString = strings[index] ?? "";

    output += currentString;
    updateTemplateParserState(parserState, currentString);

    if (index < values.length) {
      output += renderTemplateValue(values[index], {
        rawTextElement: parserState.rawTextElement,
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

/**
 * Wraps raw CSS text for server-side use.
 * This is used internally by the CSS module plugin on the server.
 */
export function cssText(value: string): CssTextValue {
  return {
    [CSS_TEXT_BRAND]: true,
    raw: value,
    toString() {
      return value;
    },
    valueOf() {
      return value;
    },
  };
}

/**
 * Marks a string as trusted HTML that should bypass escaping.
 *
 * **Warning**: Only use with content you trust. Improper use can lead to XSS vulnerabilities.
 *
 * @example
 * ```ts
 * const trustedMarkup = "<strong>Safe</strong>";
 * html`<div>${safeHtml(trustedMarkup)}</div>` // <div><strong>Safe</strong></div>
 * ```
 */
export function safeHtml(value: string): SafeHtmlValue {
  return {
    [SAFE_HTML_BRAND]: true,
    value,
  };
}

/**
 * Converts an HtmlRenderable value to a string.
 * This is used internally by the rendering pipeline.
 */
export function renderToString(value: HtmlRenderable): string {
  return renderRenderable(value);
}

/**
 * Escapes HTML special characters to prevent XSS attacks.
 *
 * Escapes: &, <, >, ", '
 *
 * This is used internally by the `html` tagged template.
 */
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

function isHtmlResult(value: HtmlRenderable): value is HtmlResult {
  return typeof value === "object" && value !== null && HTML_RESULT_BRAND in value;
}

function isSafeHtmlValue(value: HtmlRenderable): value is SafeHtmlValue {
  return typeof value === "object" && value !== null && SAFE_HTML_BRAND in value;
}

function isCssTextValue(value: HtmlRenderable): value is CssTextValue {
  return typeof value === "object" && value !== null && CSS_TEXT_BRAND in value;
}

function renderTemplateValue(
  value: HtmlRenderable,
  options: {
    rawTextElement: RawTextElement | null;
    quoteAttributeValue: boolean;
  },
): string {
  const renderedValue = renderRenderable(value, {
    rawTextElement: options.rawTextElement,
  });

  if (!options.quoteAttributeValue) {
    return renderedValue;
  }

  return `"${renderedValue}"`;
}

function renderRenderable(
  value: HtmlRenderable,
  context: {
    rawTextElement?: RawTextElement | null;
  } = {},
): string {
  if (isHtmlResult(value)) {
    return value.value;
  }

  if (isSafeHtmlValue(value)) {
    return value.value;
  }

  if (isCssTextValue(value)) {
    return context.rawTextElement === "style" ? value.raw : escapeHtml(value.raw);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => renderRenderable(entry, context)).join("");
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
  let index = 0;

  while (index < segment.length) {
    if (parserState.rawTextElement !== null && !parserState.inTag) {
      const closingTagIndex = segment
        .toLowerCase()
        .indexOf(`</${parserState.rawTextElement}`, index);

      if (closingTagIndex === -1) {
        return;
      }

      index = closingTagIndex;
    }

    const character = segment[index];

    if (parserState.quote !== null) {
      parserState.tagBuffer += character;

      if (character === parserState.quote) {
        parserState.quote = null;
      }

      index += 1;
      continue;
    }

    if (character === "<") {
      parserState.inTag = true;
      parserState.tagBuffer = "<";
      index += 1;
      continue;
    }

    if (character === ">") {
      if (parserState.inTag) {
        parserState.tagBuffer += character;
        finalizeParsedTag(parserState);
      }

      parserState.inTag = false;
      index += 1;
      continue;
    }

    if (!parserState.inTag) {
      index += 1;
      continue;
    }

    if (character === '"' || character === "'") {
      parserState.quote = character;
    }

    parserState.tagBuffer += character;
    index += 1;
  }
}

function finalizeParsedTag(parserState: TemplateParserState): void {
  const tagMatch = parserState.tagBuffer.match(/^<\s*(\/)?\s*([a-zA-Z][^\s/>]*)/u);

  if (tagMatch === null) {
    parserState.tagBuffer = "";
    return;
  }

  const isClosingTag = tagMatch[1] === "/";
  const tagName = tagMatch[2].toLowerCase();
  const isSelfClosingTag = /\/\s*>$/u.test(parserState.tagBuffer);

  if (tagName === "style") {
    if (isClosingTag) {
      parserState.rawTextElement = null;
    } else if (!isSelfClosingTag) {
      parserState.rawTextElement = "style";
    }
  }

  parserState.tagBuffer = "";
}
