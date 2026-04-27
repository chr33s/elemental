import { declarativeShadowDom, html, type RouteProps } from "elemental";
import calloutSheet from "./callout.css";

interface GuideData {
  bullets?: unknown;
  kicker?: unknown;
  summary?: unknown;
  title?: unknown;
  topic?: unknown;
}

export function head(props: RouteProps) {
  const data = props.data as GuideData;
  const summary = typeof data.summary === "string" ? data.summary : "Elemental guide";
  const title = typeof data.title === "string" ? data.title : `Guide: ${readTopic(props)}`;

  return html`<title>${title}</title><meta name="description" content=${summary} />`;
}

export class GuideCallout extends HTMLElement {
  static tagName = "guide-callout";

  connectedCallback() {
    const label = this.getAttribute("label") ?? "Guide loaded";
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });

    if (calloutSheet instanceof CSSStyleSheet) {
      root.adoptedStyleSheets = [calloutSheet];
    }

    const labelNode = root.querySelector("[data-callout-label]");

    this.dataset.upgraded = "true";

    if (labelNode !== null) {
      labelNode.textContent = label;
      return;
    }

    root.textContent = "";

    const fallbackLabel = document.createElement("strong");

    fallbackLabel.dataset.calloutLabel = "";
    fallbackLabel.textContent = label;
    root.append(fallbackLabel);
  }
}

export default function guideTopic(props: RouteProps) {
  const data = props.data as GuideData;
  const topic = typeof data.topic === "string" ? data.topic : readTopic(props);
  const kicker = typeof data.kicker === "string" ? data.kicker : "Dynamic guide";
  const summary = typeof data.summary === "string" ? data.summary : "Guide unavailable";
  const title = typeof data.title === "string" ? data.title : `Guide: ${topic}`;
  const bullets = Array.isArray(data.bullets)
    ? data.bullets.filter((value): value is string => typeof value === "string")
    : [];

  return html`
    <article class="guide-article">
      <p class="eyebrow">${kicker}</p>
      <h1>${title}</h1>
      <p id="guide-topic">${topic}</p>
      <p>${summary}</p>
      <guide-callout label="Dynamic route upgrade">
        ${declarativeShadowDom({
          content: html`<strong data-callout-label>Pending upgrade</strong>`,
          styles: [calloutSheet],
        })}
      </guide-callout>
      <ul class="guide-points">
        ${bullets.map((bullet) => html`<li>${bullet}</li>`)}
      </ul>
    </article>
  `;
}

function readTopic(props: RouteProps): string {
  return Array.isArray(props.params.topic)
    ? (props.params.topic[0] ?? "runtime-ssr")
    : String(props.params.topic ?? "runtime-ssr");
}
