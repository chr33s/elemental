import {
  HtmlResult,
  cssText,
  declarativeShadowDom,
  html,
  renderToString,
  safeHtml,
} from "elemental";
import { describe, expect, it } from "vitest";

describe("html", () => {
  it("escapes interpolated values while preserving trusted html", () => {
    const result = html`<div>${"<strong>unsafe</strong>"}${safeHtml("<span>safe</span>")}</div>`;

    expect(renderToString(result)).toBe(
      "<div>&lt;strong&gt;unsafe&lt;/strong&gt;<span>safe</span></div>",
    );
  });

  it("renders safeHtml values verbatim even when the markup is dangerous", () => {
    const dangerousMarkup = '<img src="/x" onerror="alert(1)"><script>alert(1)</script>';

    expect(renderToString(html`<div>${safeHtml(dangerousMarkup)}</div>`)).toBe(
      `<div>${dangerousMarkup}</div>`,
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

  it("renders branded CSS text raw inside style tags", () => {
    const result = html`<style>
      ${cssText(`:host { color: tomato; & > span { display: block; } }`)}
    </style>`;

    expect(compactWhitespace(renderToString(result))).toBe(
      "<style>:host { color: tomato; & > span { display: block; } }</style>",
    );
  });

  it("renders declarative shadow DOM with escaped content and raw branded styles", () => {
    const result = declarativeShadowDom({
      content: html`<span>${"<unsafe>"}</span>`,
      styles: cssText(`:host { color: tomato; & > span { display: block; } }`),
    });

    expect(compactWhitespace(renderToString(result))).toBe(
      '<template shadowrootmode="open"><style>:host { color: tomato; & > span { display: block; } }</style><span>&lt;unsafe&gt;</span></template>',
    );
  });

  it("supports declarative shadow DOM mode and boolean attributes", () => {
    const result = declarativeShadowDom({
      clonable: true,
      content: html`<p>Closed root</p>`,
      delegatesFocus: true,
      mode: "closed",
      serializable: true,
    });

    expect(compactWhitespace(renderToString(result))).toBe(
      '<template shadowrootmode="closed" shadowrootdelegatesfocus shadowrootclonable shadowrootserializable><p>Closed root</p></template>',
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

function compactWhitespace(value: string): string {
  return value
    .replaceAll(/\s+/g, " ")
    .replaceAll(/<style> /g, "<style>")
    .replaceAll(/ <\/style>/g, "</style>")
    .trim();
}
