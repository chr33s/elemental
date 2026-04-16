import { createServer } from "node:http";

export async function findAvailablePort(): Promise<number> {
  const probe = createServer();

  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => resolve());
  });

  const address = probe.address();

  if (address === null || typeof address === "string") {
    probe.close();
    throw new Error("Could not allocate a child dev server port.");
  }

  const { port } = address;

  await new Promise<void>((resolve, reject) => {
    probe.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return port;
}
