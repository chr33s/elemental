import { html } from "elemental";

export function head() {
  return html`<title>About</title
    ><meta name="description" content="About the Elemental fixture" />`;
}

export class FixtureBadge extends HTMLElement {
  static tagName = "fixture-badge";

  connectedCallback() {
    this.dataset.upgraded = "true";
    this.textContent = this.getAttribute("label") ?? "upgraded";
  }
}

export default function about() {
  return html`
    <section>
      <h1>About Elemental</h1>
      <fixture-badge label="Client navigation">Pending upgrade</fixture-badge>
      <p id="about-copy">This route is swapped in through the browser runtime.</p>
    </section>
  `;
}
