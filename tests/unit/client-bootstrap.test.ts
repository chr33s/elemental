import { describe, expect, it } from "vitest";
import {
  collectCustomElementDefinitions,
  isValidCustomElementTagName,
} from "../../src/runtime/client/bootstrap.ts";

describe("client bootstrap helpers", () => {
  it("collects valid custom element exports from browser modules", () => {
    class FakeElement {}

    class FixtureCard extends FakeElement {
      static tagName = "fixture-card";
    }

    class InvalidTag extends FakeElement {
      static tagName = "fixturecard";
    }

    const definitions = collectCustomElementDefinitions(
      {
        FixtureCard,
        InvalidTag,
        count: 1,
      },
      FakeElement,
    );

    expect(definitions).toEqual([
      {
        constructor: FixtureCard,
        tagName: "fixture-card",
      },
    ]);
  });

  it("validates explicit custom element tag names", () => {
    expect(isValidCustomElementTagName("fixture-card")).toBe(true);
    expect(isValidCustomElementTagName("fixture.card-item")).toBe(true);
    expect(isValidCustomElementTagName("fixturecard")).toBe(false);
    expect(isValidCustomElementTagName("Fixture-card")).toBe(false);
  });
});
