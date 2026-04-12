import { describe, expect, it, vi } from "vitest";
import {
  collectCustomElementDefinitions,
  isValidCustomElementTagName,
  registerCustomElementDefinitions,
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

  it("skips custom element registration when the tag is already defined", () => {
    class FakeElement {}

    class ExistingCard extends FakeElement {
      static tagName = "existing-card";
    }

    class NewCard extends FakeElement {
      static tagName = "new-card";
    }

    const definitions = new Map<string, CustomElementConstructor>([
      ["existing-card", ExistingCard as unknown as CustomElementConstructor],
    ]);
    const registry = {
      define: vi.fn<(tagName: string, constructor: CustomElementConstructor) => void>(
        (tagName, constructor) => {
          definitions.set(tagName, constructor);
        },
      ),
      get: vi.fn<(tagName: string) => CustomElementConstructor | undefined>((tagName) =>
        definitions.get(tagName),
      ),
    };

    registerCustomElementDefinitions(
      {
        ExistingCard,
        NewCard,
      },
      registry,
      FakeElement,
    );

    expect(registry.define).toHaveBeenCalledTimes(1);
    expect(registry.define).toHaveBeenCalledWith("new-card", NewCard);
    expect(registry.get).toHaveBeenCalledWith("existing-card");
    expect(registry.get).toHaveBeenCalledWith("new-card");
  });
});
