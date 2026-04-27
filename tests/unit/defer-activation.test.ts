import { describe, expect, it, vi } from "vitest";
import {
  deferActivation,
  readActivationStrategy,
} from "../../src/runtime/client/defer-activation.ts";

class FakeElement {
  listeners = new Map<string, Array<(event: unknown) => void>>();

  addEventListener(name: string, handler: (event: unknown) => void): void {
    const list = this.listeners.get(name) ?? [];
    list.push(handler);
    this.listeners.set(name, list);
  }

  removeEventListener(name: string, handler: (event: unknown) => void): void {
    const list = this.listeners.get(name);
    if (list === undefined) return;
    const index = list.indexOf(handler);
    if (index >= 0) list.splice(index, 1);
  }

  dispatch(name: string): void {
    for (const handler of this.listeners.get(name) ?? []) {
      handler({});
    }
  }

  listenerCount(name: string): number {
    return this.listeners.get(name)?.length ?? 0;
  }
}

describe("deferActivation", () => {
  it("activates eagerly by default", async () => {
    const activate = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const controller = deferActivation({
      activate,
      element: new FakeElement() as unknown as Element,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(activate).toHaveBeenCalledTimes(1);
    expect(controller.activated).toBe(true);
  });

  it("activates only once even when trigger() is called repeatedly", async () => {
    const activate = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const controller = deferActivation({
      activate,
      element: new FakeElement() as unknown as Element,
      strategy: "interaction",
    });

    await controller.trigger();
    await controller.trigger();
    await controller.trigger();

    expect(activate).toHaveBeenCalledTimes(1);
    expect(controller.activated).toBe(true);
  });

  it("activates on the first interaction event and tears down listeners", async () => {
    const element = new FakeElement();
    const activate = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const controller = deferActivation({
      activate,
      element: element as unknown as Element,
      strategy: "interaction",
      events: ["pointerdown", "focusin"],
    });

    expect(element.listenerCount("pointerdown")).toBe(1);
    expect(element.listenerCount("focusin")).toBe(1);

    element.dispatch("pointerdown");
    await Promise.resolve();

    expect(activate).toHaveBeenCalledTimes(1);

    element.dispatch("pointerdown");
    element.dispatch("focusin");
    await Promise.resolve();

    expect(activate).toHaveBeenCalledTimes(1);
    expect(controller.activated).toBe(true);
    expect(element.listenerCount("pointerdown")).toBe(0);
    expect(element.listenerCount("focusin")).toBe(0);
  });

  it("cancel() removes listeners and prevents activation", () => {
    const element = new FakeElement();
    const activate = vi.fn<() => void>();
    const controller = deferActivation({
      activate,
      element: element as unknown as Element,
      strategy: "interaction",
      events: ["pointerdown"],
    });

    controller.cancel();

    expect(element.listenerCount("pointerdown")).toBe(0);

    element.dispatch("pointerdown");

    expect(activate).not.toHaveBeenCalled();
    expect(controller.activated).toBe(false);
  });

  it("cancel via AbortSignal tears down without activating", () => {
    const element = new FakeElement();
    const activate = vi.fn<() => void>();
    const ac = new AbortController();
    deferActivation({
      activate,
      element: element as unknown as Element,
      events: ["pointerdown"],
      signal: ac.signal,
      strategy: "interaction",
    });

    expect(element.listenerCount("pointerdown")).toBe(1);

    ac.abort();

    expect(element.listenerCount("pointerdown")).toBe(0);
    expect(activate).not.toHaveBeenCalled();
  });

  it("falls back to eager activation when IntersectionObserver is missing for visible strategy", async () => {
    const original = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
    try {
      const activate = vi.fn<() => Promise<void>>(() => Promise.resolve());
      const controller = deferActivation({
        activate,
        element: new FakeElement() as unknown as Element,
        strategy: "visible",
      });

      await Promise.resolve();
      await Promise.resolve();

      expect(activate).toHaveBeenCalledTimes(1);
      expect(controller.activated).toBe(true);
    } finally {
      (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = original;
    }
  });
});

describe("readActivationStrategy", () => {
  function makeElement(value: string | null): Element {
    return {
      getAttribute(name: string) {
        return name === "data-activate" ? value : null;
      },
    } as unknown as Element;
  }

  it("returns the matching strategy when the attribute is set", () => {
    expect(readActivationStrategy(makeElement("visible"))).toBe("visible");
    expect(readActivationStrategy(makeElement("idle"))).toBe("idle");
    expect(readActivationStrategy(makeElement("interaction"))).toBe("interaction");
    expect(readActivationStrategy(makeElement("eager"))).toBe("eager");
  });

  it("falls back to the default when the attribute is missing or unknown", () => {
    expect(readActivationStrategy(makeElement(null))).toBe("eager");
    expect(readActivationStrategy(makeElement("nonsense"))).toBe("eager");
    expect(readActivationStrategy(makeElement(null), "visible")).toBe("visible");
  });
});
