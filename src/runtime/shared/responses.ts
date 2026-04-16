import { renderToReadableStream, type HtmlRenderable } from "./html.ts";

export function htmlResponse(body: HtmlRenderable, status = 200): Response {
  return new Response(typeof body === "string" ? body : renderToReadableStream(body), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-content-type-options": "nosniff",
    },
    status,
  });
}

export function textResponse(
  body: string,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...extraHeaders,
    },
    status,
  });
}
