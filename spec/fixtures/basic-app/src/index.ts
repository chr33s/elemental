import { html } from "elemental";

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
    <section>
      <h1>Elemental Fixture</h1>
      <fixture-greeting message="Router ready">Pending upgrade</fixture-greeting>
      <p>Phase 7 browser runtime fixture.</p>
    </section>
  `;
}
