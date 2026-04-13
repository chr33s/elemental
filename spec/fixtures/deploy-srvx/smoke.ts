import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type BuildManifest = {
  assets?: {
    clientEntry?: string;
  };
};

type SrvxHandlerModule = {
  default: {
    fetch: (request: Request) => Promise<Response>;
  };
};

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  await readFile(path.join(fixtureDir, "dist", "manifest.json"), "utf8"),
) as BuildManifest;
const srvxModule = (await import(
  pathToFileURL(path.join(fixtureDir, "dist", "srvx.js")).href
)) as SrvxHandlerModule;
const routeResponse = await srvxModule.default.fetch(new Request("https://example.com/about"));
const routeText = await routeResponse.text();

assert.equal(routeResponse.status, 200);
assert.match(routeText, /About Elemental/u);

const clientEntry = manifest.assets?.clientEntry;

assert.equal(typeof clientEntry, "string");

const assetResponse = await srvxModule.default.fetch(
  new Request(`https://example.com/${clientEntry}`),
);

assert.equal(assetResponse.status, 200);
assert.match(assetResponse.headers.get("content-type") ?? "", /javascript/u);

console.log("srvx fixture smoke ok");
