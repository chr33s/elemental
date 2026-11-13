import {
	ELEMENTAL_HEAD_END_NAME,
	ELEMENTAL_HEAD_START_NAME,
	ELEMENTAL_MANAGED_ATTRIBUTE,
	ELEMENTAL_MANAGED_SCRIPT,
	ELEMENTAL_MANAGED_STYLESHEET,
} from "../shared/browser-runtime.ts";

export function renderManagedHead(head: string): void {
	const { end, start } = ensureManagedHeadMarkers();

	for (let node = start.nextSibling; node !== null && node !== end;) {
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

export async function ensureManagedStylesheets(stylesheetHrefs: string[]): Promise<void> {
	await insertMissingStylesheets(stylesheetHrefs);
}

export async function syncManagedStylesheets(stylesheetHrefs: string[]): Promise<() => void> {
	const normalizedHrefs = [...new Set(stylesheetHrefs.map(normalizeAssetHref))];
	const desiredHrefs = new Set(normalizedHrefs);
	const existingLinks = collectManagedStylesheets();
	const obsoleteLinks = [...existingLinks].flatMap(([href, link]) =>
		desiredHrefs.has(href) ? [] : [link],
	);

	await insertMissingStylesheets(normalizedHrefs);

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

async function insertMissingStylesheets(stylesheetHrefs: string[]): Promise<void> {
	const normalizedHrefs = [...new Set(stylesheetHrefs.map(normalizeAssetHref))];
	const existingLinks = collectManagedStylesheets();
	const orderedLinks = normalizedHrefs.map((stylesheetHref) => ({
		href: stylesheetHref,
		link: existingLinks.get(stylesheetHref),
	}));
	const pendingLoads: Promise<void>[] = [];
	const anchor = document.head.querySelector(managedScriptSelector());

	for (let index = 0; index < orderedLinks.length; index += 1) {
		const entry = orderedLinks[index];

		if (entry === undefined || entry.link !== undefined) {
			continue;
		}

		const link = document.createElement("link");
		const referenceNode =
			orderedLinks
				.slice(index + 1)
				.map((candidate) => candidate.link)
				.find(
					(candidate): candidate is HTMLLinkElement =>
						candidate instanceof HTMLLinkElement && candidate.isConnected,
				) ?? anchor;

		pendingLoads.push(loadStylesheet(link, entry.href, referenceNode));
		entry.link = link;
	}

	await Promise.all(pendingLoads);
}

function collectManagedStylesheets(): Map<string, HTMLLinkElement> {
	return new Map(
		[...document.head.querySelectorAll<HTMLLinkElement>(managedStylesheetSelector())].map(
			(link) => [normalizeAssetHref(link.href), link],
		),
	);
}

function loadStylesheet(
	link: HTMLLinkElement,
	href: string,
	referenceNode: Node | null,
): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (settle: () => void) => {
			if (settled) {
				return;
			}

			settled = true;
			link.removeEventListener("load", handleLoad);
			link.removeEventListener("error", handleError);
			settle();
		};
		const handleLoad = () => {
			finish(resolve);
		};
		const handleError = () => {
			finish(() => {
				reject(new Error(`Failed to load stylesheet ${link.href}`));
			});
		};

		link.addEventListener("load", handleLoad);
		link.addEventListener("error", handleError);
		link.rel = "stylesheet";
		link.href = href;
		link.setAttribute(ELEMENTAL_MANAGED_ATTRIBUTE, ELEMENTAL_MANAGED_STYLESHEET);
		document.head.insertBefore(link, referenceNode);

		if (link.sheet !== null) {
			finish(resolve);
		}
	});
}

function managedScriptSelector(): string {
	return `script[${ELEMENTAL_MANAGED_ATTRIBUTE}="${ELEMENTAL_MANAGED_SCRIPT}"]`;
}

function managedStylesheetSelector(): string {
	return `link[${ELEMENTAL_MANAGED_ATTRIBUTE}="${ELEMENTAL_MANAGED_STYLESHEET}"]`;
}
