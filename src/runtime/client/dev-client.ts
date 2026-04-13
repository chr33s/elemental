import type { BuildManifest } from "../../build/manifest.ts";
import type { ElementalBrowserRuntimeApi } from "./bootstrap.ts";

type DevUpdateMessage = {
  type: "css" | "reload" | "route";
};

const DEV_EVENTS_PATH = "/__elemental/dev/events";

function setDevClientStatus(status: "connecting" | "error" | "open"): void {
  (
    window as Window & {
      __elementalDevClientStatus?: "connecting" | "error" | "open";
    }
  ).__elementalDevClientStatus = status;
}

function getRuntimeApi(): ElementalBrowserRuntimeApi | undefined {
  return (
    window as Window & {
      __elementalBrowserRuntime?: ElementalBrowserRuntimeApi;
    }
  ).__elementalBrowserRuntime;
}

async function loadLatestManifest(): Promise<BuildManifest> {
  const response = await fetch(`/manifest.json?ts=${Date.now()}`, {
    cache: "no-store",
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to refresh Elemental manifest: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as BuildManifest;
}

async function handleDevUpdate(message: DevUpdateMessage): Promise<void> {
  if (message.type === "reload") {
    window.location.reload();
    return;
  }

  const runtimeApi = getRuntimeApi();

  if (runtimeApi === undefined) {
    window.location.reload();
    return;
  }

  const manifest = await loadLatestManifest();

  runtimeApi.replaceManifest(manifest);

  if (message.type === "css") {
    await runtimeApi.syncCurrentRouteStylesheets();
    return;
  }

  await runtimeApi.refreshCurrentRoute();
}

function installDevClient(): void {
  const eventSource = new EventSource(DEV_EVENTS_PATH);

  setDevClientStatus("connecting");

  eventSource.addEventListener("open", () => {
    setDevClientStatus("open");
  });

  eventSource.addEventListener("message", (event) => {
    void handleDevUpdate(
      JSON.parse((event as MessageEvent<string>).data) as DevUpdateMessage,
    ).catch(() => {
      window.location.reload();
    });
  });

  eventSource.addEventListener("error", () => {
    setDevClientStatus("error");
    console.warn("Elemental dev event stream disconnected.");
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  installDevClient();
}
