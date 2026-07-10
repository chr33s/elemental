import { renderToReadableStream, type HtmlRenderable } from "./html.ts";
import { ROUTER_HEADER_NAME } from "./router-protocol.ts";

export function htmlResponse(body: HtmlRenderable, status = 200): Response {
	// Plain strings go through the same escaped-by-default pipeline as every
	// other renderable; raw markup must be wrapped in safeHtml()/html``.
	return new Response(renderToReadableStream(body), {
		headers: {
			"content-type": "text/html; charset=utf-8",
			"referrer-policy": "strict-origin-when-cross-origin",
			vary: ROUTER_HEADER_NAME,
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
