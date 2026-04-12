import { html, type LayoutProps } from "elemental";

const guideLinks = [
  {
    href: "/guides/runtime-ssr",
    label: "Runtime SSR",
  },
  {
    href: "/guides/router-payloads",
    label: "Router payloads",
  },
  {
    href: "/guides/form-actions",
    label: "Form actions",
  },
];

export default function guidesLayout(props: LayoutProps) {
  return html`
    <section class="guides-shell">
      <aside class="guides-sidebar">
        <p class="eyebrow">Nested layout</p>
        <h2>Guides</h2>
        <p id="guides-layout-marker">This sidebar comes from guides/layout.ts.</p>
        <ul class="guide-nav">
          ${guideLinks.map((link) => html`<li><a href=${link.href}>${link.label}</a></li>`)}
        </ul>
      </aside>
      <div class="guides-content">${props.outlet}</div>
    </section>
  `;
}
