import { vi } from "vitest";

class FakeHTMLElement {}

export class FakeSubmitter extends FakeHTMLElement {
  constructor(overrides: Record<string, string> = {}) {
    super();
    Object.assign(this, overrides);
  }
}

export function installFormBrowserStubs(entries: Array<[string, string | { name: string }]>) {
  const windowStub = {
    location: {
      href: "http://example.com/current?keep=1",
      origin: "http://example.com",
    },
  };

  class FormDataMock {
    static calls: Array<[unknown, unknown?]> = [];
    readonly form: unknown;
    readonly submitter?: unknown;

    constructor(form: unknown, submitter?: unknown) {
      this.form = form;
      this.submitter = submitter;
      FormDataMock.calls.push([form, submitter]);
    }

    entries(): IterableIterator<[string, string | { name: string }]> {
      return entries.values();
    }
  }

  vi.stubGlobal("window", windowStub);
  vi.stubGlobal("HTMLElement", FakeHTMLElement);
  vi.stubGlobal("FormData", FormDataMock);

  return {
    FormDataMock,
    windowStub,
  };
}
