import { HtmlResult, html, renderToString, safeHtml } from "elemental";
import { describe, expect, it } from "vitest";

describe("html", () => {
  it("escapes interpolated values while preserving trusted html", () => {
    const result = html`<div>${"<strong>unsafe</strong>"}${safeHtml("<span>safe</span>")}</div>`;

    expect(renderToString(result)).toBe(
      "<div>&lt;strong&gt;unsafe&lt;/strong&gt;<span>safe</span></div>",
    );
  });

  it("flattens arrays, ignores empty values, and stringifies primitives", () => {
    const items = [
      html`<li>${0}</li>`,
      null,
      undefined,
      false,
      html`<li>${true}</li>`,
      html`<li>${42n}</li>`,
    ];
    const result = html`<ul>
      ${items}
    </ul>`;

    expect(compactHtml(renderToString(result))).toBe("<ul><li>0</li><li>true</li><li>42</li></ul>");
  });

  it("preserves nested html results", () => {
    const items = ["alpha", "beta"].map((value) => html`<li>${value}</li>`);
    const list = html`<ol>
      ${items}
    </ol>`;

    expect(compactHtml(renderToString(html`<section>${list}</section>`))).toBe(
      "<section><ol><li>alpha</li><li>beta</li></ol></section>",
    );
  });

  it("auto-quotes attribute interpolations", () => {
    const result = html`<button data-label=${'fish & "chips"'} aria-hidden=${true}></button>`;

    expect(renderToString(result)).toBe(
      '<button data-label="fish &amp; &quot;chips&quot;" aria-hidden="true"></button>',
    );
  });

  it("rejects direct HtmlResult construction", () => {
    expect(() => new HtmlResult("<strong>unsafe</strong>")).toThrow(
      "HtmlResult cannot be constructed directly. Use html`...` or safeHtml().",
    );
  });
});

function compactHtml(value: string): string {
  return value.replaceAll(/>\s+</g, "><").trim();
}
