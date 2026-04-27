import { describe, expect, it } from "vitest";
import { html } from "../../src/runtime/shared/html.ts";
import {
  ELEMENTAL_ISLAND_ATTRIBUTE,
  ELEMENTAL_ISLAND_PROPS_ATTRIBUTE,
  ELEMENTAL_ISLAND_STRATEGY_ATTRIBUTE,
  island,
  serializeIslandProps,
} from "../../src/runtime/shared/islands.ts";

describe("island server helper", () => {
  it("emits a host element with deterministic island markers", () => {
    const result = island({ id: "product-card" });

    expect(result.toString()).toBe(
      `<div ${ELEMENTAL_ISLAND_ATTRIBUTE}="product-card" ${ELEMENTAL_ISLAND_STRATEGY_ATTRIBUTE}="eager"></div>`,
    );
  });

  it("embeds props as an inert <template> payload that escapes < to \\u003c", () => {
    const result = island({
      id: "product-card",
      props: { title: "</template><script>alert(1)</script>" },
      strategy: "visible",
    });

    const markup = result.toString();
    expect(markup).toContain(`${ELEMENTAL_ISLAND_STRATEGY_ATTRIBUTE}="visible"`);
    expect(markup).toContain(`<template ${ELEMENTAL_ISLAND_PROPS_ATTRIBUTE}>`);
    expect(markup).not.toContain("</template><script>");
    expect(markup).toContain("\\u003c/template");
    expect(markup).toContain("\\u003cscript");
  });

  it("renders escaped-by-default content alongside props", () => {
    const result = island({
      id: "card",
      content: html`<p>${"<x>"}</p>`,
    });

    expect(result.toString()).toContain("<p>&lt;x&gt;</p>");
  });

  it("rejects invalid ids", () => {
    expect(() => island({ id: "Not Valid" })).toThrowError(/Invalid island id/u);
    expect(() => island({ id: "" })).toThrowError(/Invalid island id/u);
  });

  it("rejects invalid strategies and tag names", () => {
    expect(() => island({ id: "x", strategy: "bogus" as unknown as "eager" })).toThrowError(
      /Invalid island strategy/u,
    );
    expect(() => island({ id: "x", tagName: "Div" })).toThrowError(/Invalid island host tagName/u);
  });

  it("serializeIslandProps escapes < to \\u003c and remains valid JSON", () => {
    const json = serializeIslandProps({ value: "<a>" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toEqual({ value: "<a>" });
  });
});
