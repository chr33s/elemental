import { html } from "elemental";
import { describe, expect, it } from "vitest";
import { renderDocument, renderSubtree } from "../../src/runtime/server/render-document.ts";

describe("renderDocument", () => {
  it("renders a document shell from HtmlRenderable inputs", () => {
    const document = renderDocument({
      body: html`<main>${"<unsafe>"}</main>`,
      clientAssetHref: "/assets/app.js?x=1&y=2",
      head: html`<meta name="description" content=${'fish & "chips"'} />`,
      title: 'Title & "quotes"',
    });

    expect(document).toContain("<!doctype html>");
    expect(document).toContain("<title>Title &amp; &quot;quotes&quot;</title>");
    expect(document).toContain(
      '<meta name="description" content="fish &amp; &quot;chips&quot;" />',
    );
    expect(document).toContain('<script type="module" src="/assets/app.js?x=1&amp;y=2"></script>');
    expect(document).toContain("<div data-route-outlet><main>&lt;unsafe&gt;</main></div>");
  });
});

describe("renderSubtree", () => {
  it("renders nested HtmlRenderable values without a document shell", () => {
    expect(
      renderSubtree(
        html`<section>${[html`<span>${"A"}</span>`, html`<span>${"B"}</span>`]}</section>`,
      ),
    ).toBe("<section><span>A</span><span>B</span></section>");
  });
});
