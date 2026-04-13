import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type BuildManifest = {
  assets?: {
    clientEntry?: string;
  };
};

type AssetsBinding = {
  fetch: (request: Request) => Response | Promise<Response>;
};

type WorkerModule = {
  default: {
    fetch: (request: Request, env: { ASSETS: AssetsBinding }) => Promise<Response>;
  };
};

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  await readFile(path.join(fixtureDir, "dist", "manifest.json"), "utf8"),
) as BuildManifest;
const workerModule = (await import(
  pathToFileURL(path.join(fixtureDir, "dist", "worker.js")).href
)) as WorkerModule;
const routeResponse = await workerModule.default.fetch(new Request("https://example.com/about"), {
  ASSETS: {
    fetch(request: Request) {
      return new Response(`asset:${new URL(request.url).pathname}`, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
        status: 200,
      });
    },
  },
});
const routeText = await routeResponse.text();

assert.equal(routeResponse.status, 200);
assert.match(routeText, /About Elemental/u);

const clientEntry = manifest.assets?.clientEntry;

assert.equal(typeof clientEntry, "string");

const assetResponse = await workerModule.default.fetch(
  new Request(`https://example.com/${clientEntry}`),
  {
    ASSETS: {
      fetch(request: Request) {
        return new Response(`asset:${new URL(request.url).pathname}`, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
          },
          status: 200,
        });
      },
    },
  },
);

assert.equal(assetResponse.status, 200);
assert.equal(await assetResponse.text(), `asset:/${clientEntry}`);

console.log("worker fixture smoke ok");
