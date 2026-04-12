import { html } from "elemental";

if (typeof window !== "undefined") {
  throw new Error("reload-only client failure");
}

export function head() {
  return html`<title>Reload Route</title>`;
}

export default function reloadRoute() {
  return html`
    <section>
      <h1>Reload Route</h1>
      <p id="reload-copy">This route forces a full document reload when client navigation fails.</p>
    </section>
  `;
}
