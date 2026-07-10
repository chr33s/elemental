import { html } from "elemental";
import { describe, expect, it } from "vitest";
import { renderDocument, renderSubtree } from "../../src/runtime/server/render-document.ts";
import { renderToString } from "../../src/runtime/shared/html.ts";

describe("renderDocument", () => {
	it("renders a document shell from HtmlRenderable inputs", () => {
		const document = compactHtml(
			renderToString(
				renderDocument({
					body: html`<main>${"<unsafe>"}</main>`,
					clientAssetHref: "/assets/app.js?x=1&y=2",
					head: html`<meta name="description" content=${'fish & "chips"'} />`,
					title: 'Title & "quotes"',
				}),
			),
		);

		expect(document).toContain("<!doctype html>");
		expect(document).toContain("<title>Title &amp; &quot;quotes&quot;</title>");
		expect(document).toContain('<meta name="elemental-head-start" content="" />');
		expect(document).toContain(
			'<meta name="description" content="fish &amp; &quot;chips&quot;" />',
		);
		expect(document).toMatch(
			/<script data-elemental-managed="script" type="module" src="\/assets\/app\.js\?x=1&amp;y=2"\s*><\/script>/u,
		);
		expect(document).toContain("<div data-route-outlet><main>&lt;unsafe&gt;</main></div>");
	});

	it("emits a well-formed shell with the managed head inside a single <head>", () => {
		const document = compactHtml(
			renderToString(
				renderDocument({
					body: html`<main>Body</main>`,
					clientAssetHref: "/assets/app.js",
					stylesheets: ["/assets/route.css"],
					title: "Structured",
				}),
			),
		);
		const headStart = document.indexOf("<head>");
		const headEnd = document.indexOf("</head>");
		const bodyStart = document.indexOf("<body>");
		const htmlEnd = document.indexOf("</html>");

		// Exactly one of each structural tag, in document order.
		for (const tag of ["<head>", "</head>", "<body>", "</body>", "</html>"]) {
			expect(document.indexOf(tag)).toBe(document.lastIndexOf(tag));
		}

		expect(headStart).toBeGreaterThan(-1);
		expect(headEnd).toBeGreaterThan(headStart);
		expect(bodyStart).toBeGreaterThan(headEnd);
		expect(htmlEnd).toBeGreaterThan(bodyStart);

		const headContent = document.slice(headStart, headEnd);

		// Title, managed markers, stylesheets, and scripts all belong in <head>.
		expect(headContent).toContain("<title>Structured</title>");
		expect(headContent).toContain('<meta name="elemental-head-start"');
		expect(headContent).toContain('<meta name="elemental-head-end"');
		expect(headContent).toContain('href="/assets/route.css"');
		expect(headContent).toContain('src="/assets/app.js"');
	});

	it("keeps the document shell chunked for streamed responses", () => {
		const document = renderDocument({
			body: html`<main>${"streamed"}</main>`,
			head: html`<title>Chunked</title>`,
		});
		const chunks = [...documentChunks(document)];

		expect(chunks.length).toBeGreaterThan(3);
		expect(chunks[0]).toContain("<!doctype html>");
		expect(chunks.some((chunk) => chunk.includes("<div data-route-outlet>"))).toBe(true);
		expect(chunks.some((chunk) => chunk.includes("<main>streamed</main>"))).toBe(true);
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

function compactHtml(value: string): string {
	return value.replaceAll(/\s+/g, " ").trim();
}

function* documentChunks(value: unknown): Generator<string> {
	if (Array.isArray(value)) {
		for (const entry of value) {
			yield* documentChunks(entry);
		}

		return;
	}

	if (value && typeof value === "object" && "value" in value && typeof value.value === "string") {
		yield value.value;
	}
}
