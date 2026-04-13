export function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
    status,
  });
}

export function textResponse(body: string, status: number): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
    status,
  });
}
