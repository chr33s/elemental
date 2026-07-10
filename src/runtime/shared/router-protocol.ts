import type { RouterPayload } from "./types.ts";

export const ROUTER_HEADER_NAME = "x-elemental-router";

export function createRouterPayloadResponse(payload: RouterPayload, init?: ResponseInit): Response {
	const response = Response.json(payload, init);

	// The same URL serves HTML (no router header) and JSON (router header), so
	// shared caches must never mix the two representations, and the client must
	// be able to distinguish a router payload from an ordinary JSON response.
	response.headers.set(ROUTER_HEADER_NAME, "true");
	response.headers.set("cache-control", "no-store");
	response.headers.set("vary", ROUTER_HEADER_NAME);
	response.headers.set("x-content-type-options", "nosniff");

	return response;
}

export function createRouterRequestHeaders(headers?: HeadersInit): Headers {
	const routerHeaders = new Headers(headers);

	routerHeaders.set(ROUTER_HEADER_NAME, "true");

	return routerHeaders;
}

export function isRouterPayloadResponse(response: Response): boolean {
	return (
		response.headers.get(ROUTER_HEADER_NAME)?.toLowerCase() === "true" &&
		response.headers.get("content-type")?.includes("application/json") === true
	);
}

export function isRouterRequest(request: Request): boolean {
	return request.headers.get(ROUTER_HEADER_NAME)?.toLowerCase() === "true";
}
