import { html, type ErrorProps } from "elemental";

export function head(props: ErrorProps) {
  return html`<title>${String(props.status)} ${props.statusText}</title>`;
}

export default function appErrorBoundary(props: ErrorProps) {
  const detail = props.error instanceof Error ? props.error.message : props.statusText;

  return html`
    <section class="stack">
      <p class="eyebrow">Server error boundary</p>
      <h1>${String(props.status)} ${props.statusText}</h1>
      <p>${detail}</p>
    </section>
  `;
}
