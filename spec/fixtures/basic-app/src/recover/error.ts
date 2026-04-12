import { html, type ClientErrorProps } from "elemental";

export function head(props: ClientErrorProps) {
  return html`<title>Recovered</title
    ><meta name="recovery-status" content=${String(props.status ?? 500)} />`;
}

export default function recoverBoundary(props: ClientErrorProps) {
  const message = props.error instanceof Error ? props.error.message : String(props.error);

  return html`
    <section>
      <h1>Recovered Route</h1>
      <p id="recovery-message">${message}</p>
    </section>
  `;
}
