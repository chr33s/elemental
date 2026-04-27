import type { IslandStrategy } from "../shared/islands.ts";

export type ActivationStrategy = IslandStrategy;

const ACTIVATION_STRATEGIES: readonly ActivationStrategy[] = [
  "eager",
  "idle",
  "interaction",
  "visible",
];

/**
 * Reads an activation strategy from the `data-activate` attribute of an
 * element. Unknown or missing values fall back to the supplied default
 * (`"eager"` when omitted).
 *
 * Authors of auto-registered custom elements can use this together with
 * `deferActivation()` to honor the same `data-activate` convention used by
 * framework-managed island hosts:
 *
 * ```ts
 * connectedCallback() {
 *   deferActivation({
 *     element: this,
 *     strategy: readActivationStrategy(this),
 *     activate: () => {
 *       // expensive client-only setup
 *     },
 *   });
 * }
 * ```
 */
export function readActivationStrategy(
  element: Element,
  fallback: ActivationStrategy = "eager",
): ActivationStrategy {
  const raw = element.getAttribute("data-activate");

  if (raw !== null && (ACTIVATION_STRATEGIES as readonly string[]).includes(raw)) {
    return raw as ActivationStrategy;
  }

  return fallback;
}

export interface DeferActivationOptions {
  activate: () => void | Promise<void>;
  element: Element;
  events?: string[];
  intersectionRoot?: Document | Element | null;
  signal?: AbortSignal;
  strategy?: ActivationStrategy;
}

export interface DeferredActivationController {
  readonly activated: boolean;
  cancel(): void;
  trigger(): Promise<void>;
}

interface RequestIdleCallbackLike {
  (callback: () => void): number;
}

interface CancelIdleCallbackLike {
  (handle: number): void;
}

const DEFAULT_INTERACTION_EVENTS = ["pointerdown", "focusin", "keydown"];

/**
 * Schedules a one-shot `activate()` callback for a custom element host
 * according to a deferred activation strategy.
 *
 * The returned controller is idempotent: `trigger()` runs `activate()` at
 * most once per controller, `cancel()` tears down any pending observers or
 * listeners, and `signal` aborts cancel scheduled activation. When the
 * required browser API for a strategy is not available, activation falls
 * back to eager execution.
 */
export function deferActivation(options: DeferActivationOptions): DeferredActivationController {
  const {
    activate,
    element,
    events = DEFAULT_INTERACTION_EVENTS,
    intersectionRoot,
    signal,
    strategy = "eager",
  } = options;
  const cleanups = new Set<() => void>();
  let state: "activated" | "activating" | "canceled" | "pending" = "pending";

  const teardown = (): void => {
    for (const cleanup of cleanups) {
      cleanup();
    }
    cleanups.clear();
  };

  const cancel = (): void => {
    if (state === "activated" || state === "canceled") {
      return;
    }

    state = "canceled";
    teardown();
  };

  const trigger = async (): Promise<void> => {
    if (state !== "pending") {
      return;
    }

    state = "activating";
    teardown();

    try {
      await activate();
      state = "activated";
    } catch (error) {
      state = "canceled";
      throw error;
    }
  };

  const controller: DeferredActivationController = {
    cancel,
    trigger,
    get activated() {
      return state === "activated";
    },
  };

  if (signal?.aborted) {
    cancel();
    return controller;
  }

  if (signal !== undefined) {
    const onAbort = (): void => {
      cancel();
    };

    signal.addEventListener("abort", onAbort);
    cleanups.add(() => {
      signal.removeEventListener("abort", onAbort);
    });
  }

  if (strategy === "eager") {
    void trigger();
    return controller;
  }

  if (strategy === "idle") {
    const idleApi = (
      globalThis as typeof globalThis & {
        cancelIdleCallback?: CancelIdleCallbackLike;
        requestIdleCallback?: RequestIdleCallbackLike;
      }
    ).requestIdleCallback;

    if (typeof idleApi === "function") {
      const handle = idleApi(() => {
        void trigger();
      });
      const cancelIdleApi = (
        globalThis as typeof globalThis & {
          cancelIdleCallback?: CancelIdleCallbackLike;
        }
      ).cancelIdleCallback;

      cleanups.add(() => {
        if (typeof cancelIdleApi === "function") {
          cancelIdleApi(handle);
        }
      });
      return controller;
    }

    const handle = setTimeout(() => {
      void trigger();
    }, 1);

    cleanups.add(() => {
      clearTimeout(handle);
    });
    return controller;
  }

  if (strategy === "interaction") {
    const handler = (): void => {
      void trigger();
    };

    for (const eventName of events) {
      element.addEventListener(eventName, handler, { once: true, passive: true });
      cleanups.add(() => {
        element.removeEventListener(eventName, handler);
      });
    }

    return controller;
  }

  if (strategy === "visible") {
    if (typeof IntersectionObserver === "undefined") {
      void trigger();
      return controller;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void trigger();
        }
      },
      { root: intersectionRoot ?? null },
    );

    observer.observe(element);
    cleanups.add(() => {
      observer.disconnect();
    });
    return controller;
  }

  void trigger();
  return controller;
}
