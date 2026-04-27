import { html, island } from "elemental";

const featureCards = [
  {
    copy: "Swap route content in place while the outer shell and registered elements stay alive.",
    href: "/about",
    title: "Client navigation",
  },
  {
    copy: "Compose a nested guides layout around a loader-backed dynamic route.",
    href: "/guides/runtime-ssr",
    title: "Nested dynamic route",
  },
  {
    copy: "POST through index.server.ts and follow a redirect without dropping the shell.",
    href: "/guestbook",
    title: "Form action redirect",
  },
];

export function head() {
  return html`<title>Home</title>`;
}

export class FixtureGreeting extends HTMLElement {
  static tagName = "fixture-greeting";

  connectedCallback() {
    this.dataset.upgraded = "true";
    this.textContent = this.getAttribute("message") ?? "ready";
  }
}

export default function index() {
  return html`
    <section class="hero">
      <p class="eyebrow">Phase 10 example app</p>
      <h2>Elemental Example App</h2>
      <p>
        The default build target now demonstrates nested layouts, dynamic params, route data,
        Response-driven form actions, client-side navigation, and browser error recovery.
      </p>
      <fixture-greeting message="Router ready">Pending upgrade</fixture-greeting>
      ${island({
        id: "feature-card",
        props: { message: "Island activated on visibility" },
        strategy: "visible",
        content: html`<span>Pending island activation</span>`,
      })}
      <div class="feature-grid">
        ${featureCards.map(
          (card) => html`
            <article class="feature-card">
              <h3>${card.title}</h3>
              <p>${card.copy}</p>
              <a href=${card.href}>Open route</a>
            </article>
          `,
        )}
      </div>
    </section>
  `;
}
