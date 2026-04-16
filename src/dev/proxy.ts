import { type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { injectDevClientScript } from "./classify.ts";
import type { DevSseMessage } from "./types.ts";

const DEV_EVENTS_PATH = "/__elemental/dev/events";

export async function handleProxyRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: {
    childPort: number;
    devClientHref: string;
    sseClients: Set<ServerResponse>;
  },
): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

  if (requestUrl.pathname === DEV_EVENTS_PATH) {
    response.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream",
    });
    response.write("retry: 500\n\n");
    options.sseClients.add(response);
    request.once("close", () => {
      options.sseClients.delete(response);
      response.end();
    });
    return;
  }

  const proxiedResponse = await proxyToChild(request, options.childPort);

  response.statusCode = proxiedResponse.status;

  for (const [headerName, headerValue] of proxiedResponse.headers) {
    if (headerName.toLowerCase() === "content-length") {
      continue;
    }

    response.setHeader(headerName, headerValue);
  }

  if ((request.method ?? "GET") === "HEAD" || proxiedResponse.body === null) {
    response.end();
    return;
  }

  if (proxiedResponse.headers.get("content-type")?.includes("text/html") === true) {
    const documentMarkup = await proxiedResponse.text();

    response.end(injectDevClientScript(documentMarkup, options.devClientHref));
    return;
  }

  response.end(Buffer.from(await proxiedResponse.arrayBuffer()));
}

export function broadcastDevMessage(clients: Set<ServerResponse>, message: DevSseMessage): void {
  const payload = `data: ${JSON.stringify(message)}\n\n`;

  for (const client of clients) {
    client.write(payload);
  }
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

async function proxyToChild(request: IncomingMessage, childPort: number): Promise<Response> {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${childPort}`);
  const headers = new Headers();

  for (const [headerName, headerValue] of Object.entries(request.headers)) {
    if (headerValue === undefined || HOP_BY_HOP_HEADERS.has(headerName.toLowerCase())) {
      continue;
    }

    headers.set(headerName, Array.isArray(headerValue) ? headerValue.join(", ") : headerValue);
  }

  const method = request.method ?? "GET";

  return fetch(url, {
    body:
      method === "GET" || method === "HEAD"
        ? undefined
        : (Readable.toWeb(request) as ReadableStream),
    duplex: method === "GET" || method === "HEAD" ? undefined : "half",
    headers,
    method,
  } as RequestInit & {
    duplex?: "half";
  });
}
