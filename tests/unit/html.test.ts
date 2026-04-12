import { html, renderToString, safeHtml } from "elemental";
import { describe, expect, it } from "vitest";

describe("html", () => {
  it("escapes interpolated values while preserving trusted html", () => {
    const result = html`<div>${"<strong>unsafe</strong>"}${safeHtml("<span>safe</span>")}</div>`;

    expect(renderToString(result)).toBe(
      "<div>&lt;strong&gt;unsafe&lt;/strong&gt;<span>safe</span></div>",
    );
  });
});
