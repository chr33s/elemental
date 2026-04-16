import { safeHtml } from "elemental";
import { describe, expect, it } from "vitest";
import type { RouterPayload } from "../../src/runtime/server/app.ts";
import { htmlResponse, textResponse } from "../../src/runtime/shared/responses.ts";
import {
  createRouterPayloadResponse,
  isRouterRequest,
} from "../../src/runtime/shared/router-protocol.ts";

describe("response helpers", () => {
  it("creates HTML responses with the expected content type and default status", async () => {
    const response = htmlResponse("<main>Hello</main>");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe("<main>Hello</main>");
  });

  it("streams HTML responses without collapsing the rendered chunks first", async () => {
    const response = htmlResponse([safeHtml("<main>"), "Hello", safeHtml("</main>")]);
    const chunks = await readResponseChunks(response);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe("<main>Hello</main>");
  });

  it("creates plain text responses with the expected content type", async () => {
    const response = textResponse("Not Found", 404);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe("Not Found");
  });

  it("detects router requests case-insensitively", () => {
    expect(
      isRouterRequest(
        new Request("http://example.com/", {
          headers: {
            "X-Elemental-Router": "TRUE",
          },
        }),
      ),
    ).toBe(true);
    expect(
      isRouterRequest(
        new Request("http://example.com/", {
          headers: {
            "X-Elemental-Router": "false",
          },
        }),
      ),
    ).toBe(false);
    expect(isRouterRequest(new Request("http://example.com/"))).toBe(false);
  });

  it("serializes router payload responses with the supplied init", async () => {
    const payload: RouterPayload = {
      assets: {
        scripts: ["/assets/client.js"],
        stylesheets: ["/assets/app.css"],
      },
      head: "<title>About</title>",
      outlet: "<main>About</main>",
      status: 202,
    };
    const response = createRouterPayloadResponse(payload, {
      headers: {
        "x-test": "router",
      },
      status: 202,
    });

    expect(response.status).toBe(202);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-test")).toBe("router");
    expect(await response.json()).toEqual(payload);
  });
});

async function readResponseChunks(response: Response): Promise<string[]> {
  const reader = response.body?.getReader();

  if (reader === undefined) {
    return [];
  }

  const decoder = new TextDecoder();
  const chunks: string[] = [];

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(decoder.decode(value, { stream: true }));
  }

  const trailingText = decoder.decode();

  if (trailingText.length > 0) {
    chunks.push(trailingText);
  }

  return chunks;
}
