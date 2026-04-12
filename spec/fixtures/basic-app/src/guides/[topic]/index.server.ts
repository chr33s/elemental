import type { RouteServerContext } from "elemental";

interface GuideRecord {
  bullets: string[];
  kicker: string;
  summary: string;
  title: string;
}

const guides: Record<string, GuideRecord> = {
  "form-actions": {
    bullets: [
      "POST handlers live in index.server.ts.",
      "The current contract is Response-only for actions.",
      "A redirect Response keeps progressive enhancement predictable.",
    ],
    kicker: "Mutation flow",
    summary:
      "Action routes should return a Response, typically a redirect after a successful POST.",
    title: "Guide: Form actions",
  },
  "router-payloads": {
    bullets: [
      "Client navigations send X-Elemental-Router: true.",
      "The server responds with outlet, head, status, and asset metadata.",
      "The browser runtime swaps only data-route-outlet and managed head nodes.",
    ],
    kicker: "Client runtime",
    summary:
      "Elemental uses structured partial payloads for client navigation instead of full HTML documents.",
    title: "Guide: Router payloads",
  },
  "runtime-ssr": {
    bullets: [
      "Routes render on the server for the initial document request.",
      "Layouts compose from root to leaf around the matched route.",
      "Named custom element exports still auto-register in the browser runtime.",
    ],
    kicker: "Single rendering model",
    summary: "Runtime SSR is the only rendering mode in Elemental v0.",
    title: "Guide: Runtime SSR",
  },
};

export async function loader(context: RouteServerContext) {
  const rawTopic = Array.isArray(context.params.topic)
    ? context.params.topic[0]
    : context.params.topic;
  const topic = typeof rawTopic === "string" && rawTopic.length > 0 ? rawTopic : "runtime-ssr";
  const fallbackTitle = topic
    .split("-")
    .filter((segment) => segment.length > 0)
    .map((segment) => `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}`)
    .join(" ");

  return {
    ...(guides[topic] ?? {
      bullets: [
        "This guide was generated from the dynamic route parameter.",
        "Add another case to guides/[topic]/index.server.ts to customize it.",
      ],
      kicker: "Dynamic route",
      summary: `No canned entry exists for ${topic}, but the route still resolved.`,
      title: `Guide: ${fallbackTitle || "Custom topic"}`,
    }),
    topic,
  };
}
