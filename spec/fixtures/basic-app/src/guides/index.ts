import { html } from "elemental";

const guideSummaries = [
  {
    copy: "See the default runtime model and loader-backed route data.",
    href: "/guides/runtime-ssr",
    title: "Runtime SSR",
  },
  {
    copy: "Inspect the partial payload shape used by client navigation.",
    href: "/guides/router-payloads",
    title: "Router payloads",
  },
  {
    copy: "Pair progressive enhancement with Response-based POST handlers.",
    href: "/guides/form-actions",
    title: "Form actions",
  },
];

export function head() {
  return html`<title>Guides</title>`;
}

export default function guidesIndex() {
  return html`
    <section class="guides-home">
      <p class="eyebrow">Guides index</p>
      <h1>Explore the example routes</h1>
      <p>
        Each guide is a nested route under guides/layout.ts. The dynamic leaf route loads its own
        data from index.server.ts.
      </p>
      <div class="feature-grid">
        ${guideSummaries.map(
          (guide) => html`
            <article class="feature-card">
              <h3>${guide.title}</h3>
              <p>${guide.copy}</p>
              <a href=${guide.href}>Open guide</a>
            </article>
          `,
        )}
      </div>
    </section>
  `;
}
