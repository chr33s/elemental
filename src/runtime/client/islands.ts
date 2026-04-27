import {
  ELEMENTAL_ISLAND_ACTIVE_ATTRIBUTE,
  ELEMENTAL_ISLAND_ATTRIBUTE,
  ELEMENTAL_ISLAND_DEFAULT_STRATEGY,
  ELEMENTAL_ISLAND_PROPS_ATTRIBUTE,
  ELEMENTAL_ISLAND_STRATEGIES,
  ELEMENTAL_ISLAND_STRATEGY_ATTRIBUTE,
  type IslandManifest,
  type IslandStrategy,
} from "../shared/islands.ts";
import { deferActivation, type DeferredActivationController } from "./defer-activation.ts";

export interface IslandModule {
  mount?: (host: HTMLElement, props: unknown) => void | Promise<void>;
  default?: (host: HTMLElement, props: unknown) => void | Promise<void>;
}

export interface ActivateIslandsOptions {
  controllers?: WeakMap<HTMLElement, DeferredActivationController>;
  manifest: IslandManifest;
  resolver: (modulePath: string) => Promise<IslandModule>;
  root: Document | Element;
}

export function activateIslands(options: ActivateIslandsOptions): DeferredActivationController[] {
  const { controllers, manifest, resolver, root } = options;
  const hosts = root.querySelectorAll<HTMLElement>(`[${ELEMENTAL_ISLAND_ATTRIBUTE}]`);
  const created: DeferredActivationController[] = [];

  for (const host of hosts) {
    if (host.hasAttribute(ELEMENTAL_ISLAND_ACTIVE_ATTRIBUTE)) {
      continue;
    }

    if (controllers?.has(host)) {
      continue;
    }

    const id = host.getAttribute(ELEMENTAL_ISLAND_ATTRIBUTE) ?? "";
    const entry = manifest[id];

    if (entry === undefined) {
      console.warn(`[elemental] Unknown island id: ${id}`);
      continue;
    }

    const strategy = readIslandStrategy(host);
    const props = readIslandProps(host);
    const controller = deferActivation({
      element: host,
      strategy,
      activate: async () => {
        const module = await resolver(entry.js);
        const mount = module.mount ?? module.default;

        if (typeof mount !== "function") {
          throw new Error(`Island "${id}" module is missing a "mount" or default function export.`);
        }

        await mount(host, props);
        host.setAttribute(ELEMENTAL_ISLAND_ACTIVE_ATTRIBUTE, "");
      },
    });

    controllers?.set(host, controller);
    observeIslandRemoval(host, controller, controllers);
    created.push(controller);
  }

  return created;
}

/**
 * Cancels a pending island controller when its host is removed from the
 * document before activation runs, and re-arming happens automatically
 * because the next `activateIslands(...)` scan no longer sees the host in the
 * controllers WeakMap.
 */
function observeIslandRemoval(
  host: HTMLElement,
  controller: DeferredActivationController,
  controllers: WeakMap<HTMLElement, DeferredActivationController> | undefined,
): void {
  if (typeof MutationObserver === "undefined") {
    return;
  }

  const ownerDocument = host.ownerDocument;
  const target = ownerDocument?.documentElement;

  if (target === null || target === undefined) {
    return;
  }

  const observer = new MutationObserver(() => {
    if (host.isConnected) {
      return;
    }

    if (!controller.activated) {
      controller.cancel();
    }

    controllers?.delete(host);
    observer.disconnect();
  });

  observer.observe(target, { childList: true, subtree: true });
}

export function readIslandStrategy(host: Element): IslandStrategy {
  const raw = host.getAttribute(ELEMENTAL_ISLAND_STRATEGY_ATTRIBUTE);

  if (raw !== null && (ELEMENTAL_ISLAND_STRATEGIES as readonly string[]).includes(raw)) {
    return raw as IslandStrategy;
  }

  return ELEMENTAL_ISLAND_DEFAULT_STRATEGY;
}

export function readIslandProps(host: Element): unknown {
  const template = host.querySelector(`:scope > template[${ELEMENTAL_ISLAND_PROPS_ATTRIBUTE}]`);

  if (template === null) {
    return undefined;
  }

  const text = readTemplateTextContent(template);

  if (text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn("[elemental] Failed to parse island props payload:", error);
    return undefined;
  }
}

function readTemplateTextContent(template: Element): string {
  if ("content" in template) {
    const fragment = (template as HTMLTemplateElement).content;

    if (fragment !== undefined && fragment !== null) {
      return fragment.textContent ?? "";
    }
  }

  return template.textContent ?? "";
}
