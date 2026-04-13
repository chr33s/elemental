import type { RouterPayload } from "./core.ts";

const ROUTER_HEADER_NAME = "x-elemental-router";

export function isRouterRequest(request: Request): boolean {
  return request.headers.get(ROUTER_HEADER_NAME)?.toLowerCase() === "true";
}

export function createRouterPayloadResponse(payload: RouterPayload, init?: ResponseInit): Response {
  return Response.json(payload, init);
}
