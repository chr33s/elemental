import { afterEach, describe, expect, it, vi } from "vitest";
import { createFormSubmission } from "../../src/runtime/client/forms.ts";

describe("createFormSubmission", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serializes same-origin GET submissions into the destination URL", () => {
    const { FormDataMock } = installBrowserStubs([
      ["query", "alpha beta"],
      ["attachment", { name: "avatar.png" }],
    ]);

    const form = {
      action: "/search?existing=1",
      method: "get",
    } as HTMLFormElement;
    const submitter = new FakeSubmitter();

    const submission = createFormSubmission(form, {
      submitter,
    } as SubmitEvent);

    expect(FormDataMock.calls).toEqual([[form, submitter]]);
    expect(submission).toEqual({
      history: "push",
      method: "GET",
      url: new URL("http://example.com/search?query=alpha+beta&attachment=avatar.png"),
    });
  });

  it("preserves form data bodies for same-origin non-GET submissions", () => {
    const { FormDataMock, windowStub } = installBrowserStubs([["title", "Hello"]]);
    const form = {
      action: "",
      method: "post",
    } as HTMLFormElement;

    const submission = createFormSubmission(form, {} as SubmitEvent);

    expect(FormDataMock.calls).toEqual([[form, undefined]]);
    expect(submission).toEqual({
      body: expect.any(FormDataMock),
      history: "push",
      method: "POST",
      url: new URL(windowStub.location.href),
    });
  });

  it("skips cross-origin submissions without constructing form data", () => {
    const { FormDataMock } = installBrowserStubs([["title", "Hello"]]);
    const form = {
      action: "https://other.example.com/submit",
      method: "post",
    } as HTMLFormElement;

    const submission = createFormSubmission(form, {} as SubmitEvent);

    expect(submission).toBeUndefined();
    expect(FormDataMock.calls).toEqual([]);
  });
});

class FakeHTMLElement {}

class FakeSubmitter extends FakeHTMLElement {}

function installBrowserStubs(entries: Array<[string, string | { name: string }]>) {
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
