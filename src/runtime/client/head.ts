import {
  ELEMENTAL_HEAD_END_NAME,
  ELEMENTAL_HEAD_START_NAME,
  ELEMENTAL_MANAGED_ATTRIBUTE,
  ELEMENTAL_MANAGED_SCRIPT,
  ELEMENTAL_MANAGED_STYLESHEET,
} from "../shared/browser-runtime.ts";

export function renderManagedHead(head: string): void {
  const { end, start } = ensureManagedHeadMarkers();

  for (let node = start.nextSibling; node !== null && node !== end; ) {
    const nextSibling = node.nextSibling;

    node.remove();
    node = nextSibling;
  }

  if (head.length === 0) {
    return;
  }

  const range = document.createRange();

  range.selectNode(document.head);
  // Security-sensitive sink: managed head markup is inserted as trusted HTML.
  end.before(range.createContextualFragment(head));
}

export async function syncManagedStylesheets(stylesheetHrefs: string[]): Promise<() => void> {
  const normalizedHrefs = [...new Set(stylesheetHrefs.map(normalizeAssetHref))];
  const desiredHrefs = new Set(normalizedHrefs);
  const existingLinks = new Map(
    [...document.head.querySelectorAll<HTMLLinkElement>(managedStylesheetSelector())].map(
      (link) => [normalizeAssetHref(link.href), link],
    ),
  );
  const orderedLinks = normalizedHrefs.map((stylesheetHref) => ({
    href: stylesheetHref,
    link: existingLinks.get(stylesheetHref),
  }));
  const pendingLoads: Promise<void>[] = [];
  const anchor = document.head.querySelector(managedScriptSelector());

  for (let index = 0; index < orderedLinks.length; index += 1) {
    const entry = orderedLinks[index];

    if (entry?.link === undefined) {
      const link = document.createElement("link");
      const referenceNode =
        orderedLinks
          .slice(index + 1)
          .map((candidate) => candidate.link)
          .find(
            (candidate): candidate is HTMLLinkElement =>
              candidate instanceof HTMLLinkElement && candidate.isConnected,
          ) ?? anchor;

      link.rel = "stylesheet";
      link.href = entry.href;
      link.setAttribute(ELEMENTAL_MANAGED_ATTRIBUTE, ELEMENTAL_MANAGED_STYLESHEET);
      document.head.insertBefore(link, referenceNode);
      pendingLoads.push(waitForStylesheet(link));
      entry.link = link;
    }
  }

  await Promise.all(pendingLoads);

  const obsoleteLinks = [...existingLinks].flatMap(([href, link]) =>
    desiredHrefs.has(href) ? [] : [link],
  );

  return () => {
    for (const link of obsoleteLinks) {
      if (link.isConnected) {
        link.remove();
      }
    }
  };
}

export function normalizeAssetHref(href: string): string {
  return new URL(href, `${window.location.origin}/`).href;
}

function ensureManagedHeadMarkers(): {
  end: Element;
  start: Element;
} {
  let start = document.head.querySelector(`meta[name="${ELEMENTAL_HEAD_START_NAME}"]`);
  let end = document.head.querySelector(`meta[name="${ELEMENTAL_HEAD_END_NAME}"]`);

  if (start === null) {
    start = document.createElement("meta");
    start.setAttribute("name", ELEMENTAL_HEAD_START_NAME);
    start.setAttribute("content", "");
    document.head.prepend(start);
  }

  if (end === null) {
    end = document.createElement("meta");
    end.setAttribute("name", ELEMENTAL_HEAD_END_NAME);
    end.setAttribute("content", "");
    document.head.append(end);
  }

  if (start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_PRECEDING) {
    document.head.insertBefore(start, end);
  }

  return {
    end,
    start,
  };
}

async function waitForStylesheet(link: HTMLLinkElement): Promise<void> {
  if (link.sheet !== null) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const handleLoad = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`Failed to load stylesheet ${link.href}`));
    };
    const cleanup = () => {
      link.removeEventListener("load", handleLoad);
      link.removeEventListener("error", handleError);
    };

    link.addEventListener("load", handleLoad, { once: true });
    link.addEventListener("error", handleError, { once: true });
  });
}

function managedScriptSelector(): string {
  return `script[${ELEMENTAL_MANAGED_ATTRIBUTE}="${ELEMENTAL_MANAGED_SCRIPT}"]`;
}

function managedStylesheetSelector(): string {
  return `link[${ELEMENTAL_MANAGED_ATTRIBUTE}="${ELEMENTAL_MANAGED_STYLESHEET}"]`;
}
