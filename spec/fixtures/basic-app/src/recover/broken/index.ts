import { html } from "elemental";

if (typeof window !== "undefined") {
  throw new Error("recoverable client failure");
}

export function head() {
  return html`<title>Broken Recover Route</title>`;
}

export default function brokenRecoverRoute() {
  return html`
    <section>
      <h1>Broken Recover Route</h1>
      <p>This route should recover through recover/error.ts during client navigation.</p>
    </section>
  `;
}
