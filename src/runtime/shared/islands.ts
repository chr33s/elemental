import { html, safeHtml, type HtmlRenderable, type HtmlResult } from "./html.ts";

export const ELEMENTAL_ISLAND_ATTRIBUTE = "data-elemental-island";
export const ELEMENTAL_ISLAND_STRATEGY_ATTRIBUTE = "data-elemental-island-strategy";
export const ELEMENTAL_ISLAND_PROPS_ATTRIBUTE = "data-elemental-island-props";
export const ELEMENTAL_ISLAND_ACTIVE_ATTRIBUTE = "data-elemental-island-active";
export const ELEMENTAL_ISLAND_ID_PATTERN = /^[a-z0-9](?:[a-z0-9/_-]*[a-z0-9])?$/u;
export const ELEMENTAL_ISLAND_DEFAULT_STRATEGY: IslandStrategy = "eager";
export const ELEMENTAL_ISLAND_STRATEGIES = ["eager", "idle", "interaction", "visible"] as const;

export type IslandStrategy = (typeof ELEMENTAL_ISLAND_STRATEGIES)[number];

export interface IslandManifestEntry {
  css?: string[];
  js: string;
}

export type IslandManifest = Record<string, IslandManifestEntry>;

export interface IslandOptions {
  content?: HtmlRenderable;
  id: string;
  props?: unknown;
  strategy?: IslandStrategy;
  tagName?: string;
}

/**
 * Renders a framework-managed island host element.
 *
 * The emitted markup carries deterministic `data-elemental-island-*` markers
 * and an inert `<template data-elemental-island-props>` payload that the
 * client island runtime resolves at activation time. Host content is
 * rendered with the same escaped-by-default semantics as `html`.
 *
 * The serialized `props` payload is JSON-encoded with `<` characters escaped
 * to `\u003c` so the inert `<template>` cannot be terminated early and never
 * injects executable HTML.
 */
export function island(options: IslandOptions): HtmlResult {
  if (typeof options.id !== "string" || !ELEMENTAL_ISLAND_ID_PATTERN.test(options.id)) {
    throw new TypeError(`Invalid island id: ${String(options.id)}`);
  }

  const strategy = options.strategy ?? ELEMENTAL_ISLAND_DEFAULT_STRATEGY;

  if (!ELEMENTAL_ISLAND_STRATEGIES.includes(strategy)) {
    throw new TypeError(`Invalid island strategy for "${options.id}": ${String(strategy)}`);
  }

  const tagName = options.tagName ?? "div";

  if (!/^[a-z][a-z0-9-]*$/u.test(tagName)) {
    throw new TypeError(`Invalid island host tagName for "${options.id}": ${String(tagName)}`);
  }

  const propsTemplate =
    options.props === undefined
      ? null
      : safeHtml(
          `<template ${ELEMENTAL_ISLAND_PROPS_ATTRIBUTE}>${escapeTemplateContent(serializeIslandProps(options.props))}</template>`,
        );

  return html`${safeHtml(
    `<${tagName} ${ELEMENTAL_ISLAND_ATTRIBUTE}="${escapeAttribute(options.id)}" ${ELEMENTAL_ISLAND_STRATEGY_ATTRIBUTE}="${strategy}">`,
  )}${propsTemplate}${options.content}${safeHtml(`</${tagName}>`)}`;
}

/**
 * Serializes island props for safe embedding inside a `<template>` block.
 *
 * `<` is escaped to its JSON unicode form so the resulting text cannot
 * terminate the surrounding `<template>` element or be reinterpreted as
 * markup. The output remains valid JSON.
 */
export function serializeIslandProps(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function escapeTemplateContent(value: string): string {
  // Defense in depth: serializeIslandProps already removes "<", so this is a
  // belt-and-braces guard for any future caller of escapeTemplateContent.
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}
