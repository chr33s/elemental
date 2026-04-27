import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activateIslands,
  readIslandProps,
  readIslandStrategy,
} from "../../src/runtime/client/islands.ts";

interface FakeHost {
  attributes: Map<string, string>;
  template?: FakeTemplate;
}

interface FakeTemplate {
  textContent: string;
  content: { textContent: string };
}

function makeHost(options: { id: string; strategy?: string; propsJson?: string }): FakeHost {
  const attributes = new Map<string, string>();
  attributes.set("data-elemental-island", options.id);
  if (options.strategy !== undefined) {
    attributes.set("data-elemental-island-strategy", options.strategy);
  }

  const host: FakeHost = { attributes };

  if (options.propsJson !== undefined) {
    host.template = {
      textContent: options.propsJson,
      content: { textContent: options.propsJson },
    };
  }

  return host;
}

function makeElement(host: FakeHost): Element {
  return {
    addEventListener() {},
    removeEventListener() {},
    getAttribute(name: string) {
      return host.attributes.get(name) ?? null;
    },
    hasAttribute(name: string) {
      return host.attributes.has(name);
    },
    setAttribute(name: string, value: string) {
      host.attributes.set(name, value);
    },
    querySelector(selector: string) {
      if (selector.includes("data-elemental-island-props")) {
        return (host.template as unknown as Element | undefined) ?? null;
      }
      return null;
    },
  } as unknown as Element;
}

function makeRoot(hosts: FakeHost[]): Document {
  const elements = hosts.map(makeElement);
  return {
    querySelectorAll() {
      return elements as unknown as NodeListOf<HTMLElement>;
    },
  } as unknown as Document;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("client island runtime", () => {
  it("reads strategy and props from a server-rendered island host", () => {
    const host = makeHost({ id: "card", strategy: "visible", propsJson: '{"id":7}' });
    const element = makeElement(host);

    expect(readIslandStrategy(element)).toBe("visible");
    expect(readIslandProps(element)).toEqual({ id: 7 });
  });

  it("activates each island once and marks it active", async () => {
    const hosts = [
      makeHost({ id: "card", strategy: "interaction", propsJson: '{"id":1}' }),
      makeHost({ id: "card", strategy: "interaction", propsJson: '{"id":2}' }),
    ];
    const root = makeRoot(hosts);
    const mount = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
    const resolver = vi.fn<() => Promise<{ mount: typeof mount }>>(() =>
      Promise.resolve({ mount }),
    );
    const controllers = new WeakMap();

    const created = activateIslands({
      controllers,
      manifest: { card: { js: "/assets/card.js" } },
      resolver,
      root,
    });

    expect(created).toHaveLength(2);
    await Promise.all(created.map((controller) => controller.trigger()));

    expect(resolver).toHaveBeenCalledTimes(2);
    expect(mount).toHaveBeenCalledTimes(2);
    for (const host of hosts) {
      expect(host.attributes.has("data-elemental-island-active")).toBe(true);
    }

    const second = activateIslands({
      controllers,
      manifest: { card: { js: "/assets/card.js" } },
      resolver,
      root,
    });
    expect(second).toHaveLength(0);
  });

  it("warns and skips when island id is not in the manifest", () => {
    const root = makeRoot([makeHost({ id: "missing" })]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resolver = vi.fn<() => Promise<{ mount: () => void }>>(() =>
      Promise.resolve({ mount: vi.fn<() => void>() }),
    );

    const created = activateIslands({
      manifest: {},
      resolver,
      root,
    });

    expect(created).toHaveLength(0);
    expect(resolver).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("throws when the resolved module has no mount export", async () => {
    const root = makeRoot([makeHost({ id: "card", strategy: "interaction" })]);
    const resolver = vi.fn<() => Promise<Record<string, unknown>>>(() => Promise.resolve({}));
    const created = activateIslands({
      manifest: { card: { js: "/assets/card.js" } },
      resolver,
      root,
    });

    expect(created).toHaveLength(1);
    await expect(created[0].trigger()).rejects.toThrowError(
      /missing a "mount" or default function export/u,
    );
  });

  it("does not double-mount a host shared between bootstrap and post-navigation scans", async () => {
    const host = makeHost({ id: "card", strategy: "interaction", propsJson: '{"id":1}' });
    // Wire the fake host into a root that returns a fresh copy each scan to
    // mimic a navigation that re-renders the same island id.
    const elements = [makeElement(host)];
    const root = {
      querySelectorAll() {
        return elements as unknown as NodeListOf<HTMLElement>;
      },
    } as unknown as Document;
    const mount = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
    const resolver = vi.fn<() => Promise<{ mount: typeof mount }>>(() =>
      Promise.resolve({ mount }),
    );
    const controllers = new WeakMap();

    const first = activateIslands({
      controllers,
      manifest: { card: { js: "/assets/card.js" } },
      resolver,
      root,
    });
    expect(first).toHaveLength(1);
    await first[0].trigger();
    expect(mount).toHaveBeenCalledTimes(1);

    const second = activateIslands({
      controllers,
      manifest: { card: { js: "/assets/card.js" } },
      resolver,
      root,
    });
    expect(second).toHaveLength(0);
    expect(mount).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending controller when the host is removed before activation", async () => {
    const observers: Array<{ callback: MutationCallback }> = [];

    class FakeMutationObserver {
      callback: MutationCallback;
      constructor(callback: MutationCallback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(): void {}
      disconnect(): void {}
      takeRecords(): MutationRecord[] {
        return [];
      }
    }

    const originalMutationObserver = (globalThis as { MutationObserver?: unknown })
      .MutationObserver;
    (globalThis as { MutationObserver?: unknown }).MutationObserver = FakeMutationObserver;

    try {
      // Construct a richer fake element so the runtime can read isConnected
      // and ownerDocument when wiring the MutationObserver.
      const documentLike = { documentElement: {} } as unknown as Document;
      let connected = true;
      const element = {
        addEventListener() {},
        removeEventListener() {},
        getAttribute(name: string) {
          if (name === "data-elemental-island") return "card";
          if (name === "data-elemental-island-strategy") return "interaction";
          return null;
        },
        hasAttribute() {
          return false;
        },
        setAttribute() {},
        querySelector() {
          return null;
        },
        get isConnected() {
          return connected;
        },
        get ownerDocument() {
          return documentLike;
        },
      } as unknown as HTMLElement;
      const root = {
        querySelectorAll() {
          return [element] as unknown as NodeListOf<HTMLElement>;
        },
      } as unknown as Document;
      const mount = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
      const resolver = vi.fn<() => Promise<{ mount: typeof mount }>>(() =>
        Promise.resolve({ mount }),
      );
      const controllers = new WeakMap<HTMLElement, ReturnType<typeof activateIslands>[number]>();

      const created = activateIslands({
        controllers,
        manifest: { card: { js: "/assets/card.js" } },
        resolver,
        root,
      });
      expect(created).toHaveLength(1);
      expect(observers).toHaveLength(1);

      // Simulate disconnection followed by a mutation event.
      connected = false;
      observers[0].callback([], observers[0] as unknown as MutationObserver);

      expect(controllers.has(element)).toBe(false);
      expect(created[0].activated).toBe(false);

      await created[0].trigger();
      expect(mount).not.toHaveBeenCalled();
    } finally {
      (globalThis as { MutationObserver?: unknown }).MutationObserver = originalMutationObserver;
    }
  });
});
