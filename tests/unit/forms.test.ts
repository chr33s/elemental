import { afterEach, describe, expect, it, vi } from "vitest";
import { createFormSubmission } from "../../src/runtime/client/forms.ts";
import { FakeSubmitter, installFormBrowserStubs } from "./test-helpers/form-browser.ts";

describe("createFormSubmission", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serializes same-origin GET submissions into the destination URL", () => {
    const { FormDataMock } = installFormBrowserStubs([
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
      url: new URL("http://example.com/search?existing=1&query=alpha+beta&attachment=avatar.png"),
    });
  });

  it("encodes same-origin non-GET submissions with the default form encoding", () => {
    const { FormDataMock, windowStub } = installFormBrowserStubs([["title", "Hello"]]);
    const form = {
      action: "",
      method: "post",
    } as HTMLFormElement;

    const submission = createFormSubmission(form, {} as SubmitEvent);

    expect(FormDataMock.calls).toEqual([[form, undefined]]);
    expect(submission).toEqual({
      body: new URLSearchParams({
        title: "Hello",
      }),
      history: "push",
      headers: undefined,
      method: "POST",
      url: new URL(windowStub.location.href),
    });
  });

  it("skips cross-origin submissions without constructing form data", () => {
    const { FormDataMock } = installFormBrowserStubs([["title", "Hello"]]);
    const form = {
      action: "https://other.example.com/submit",
      method: "post",
    } as HTMLFormElement;

    const submission = createFormSubmission(form, {} as SubmitEvent);

    expect(submission).toBeUndefined();
    expect(FormDataMock.calls).toEqual([]);
  });

  it("honors submitter overrides for action and method", () => {
    installFormBrowserStubs([["query", "router"]]);
    const form = {
      action: "/search?existing=1",
      method: "post",
    } as HTMLFormElement;
    const submitter = new FakeSubmitter({
      formAction: "/lookup?scope=guides",
      formMethod: "get",
    });

    const submission = createFormSubmission(form, {
      submitter,
    } as SubmitEvent);

    expect(submission).toEqual({
      history: "push",
      method: "GET",
      url: new URL("http://example.com/lookup?scope=guides&query=router"),
    });
  });

  it("preserves multipart form submissions without forcing a text encoding", () => {
    const { FormDataMock } = installFormBrowserStubs([["title", "Hello"]]);
    const form = {
      action: "/submit",
      enctype: "multipart/form-data",
      method: "post",
    } as HTMLFormElement;

    const submission = createFormSubmission(form, {} as SubmitEvent);

    expect(submission).toEqual({
      body: expect.any(FormDataMock),
      history: "push",
      headers: undefined,
      method: "POST",
      url: new URL("http://example.com/submit"),
    });
  });

  it("serializes text/plain submissions with an explicit content type", () => {
    installFormBrowserStubs([
      ["title", "Hello"],
      ["attachment", { name: "notes.txt" }],
    ]);
    const form = {
      action: "/submit",
      enctype: "text/plain",
      method: "post",
    } as HTMLFormElement;

    const submission = createFormSubmission(form, {} as SubmitEvent);

    expect(submission).toEqual({
      body: "title=Hello\r\nattachment=notes.txt",
      history: "push",
      headers: {
        "content-type": "text/plain; charset=UTF-8",
      },
      method: "POST",
      url: new URL("http://example.com/submit"),
    });
  });

  it("leaves non-self form targets to native browser handling", () => {
    const { FormDataMock } = installFormBrowserStubs([["title", "Hello"]]);
    const form = {
      action: "/submit",
      method: "post",
      target: "_blank",
    } as HTMLFormElement;

    const submission = createFormSubmission(form, {} as SubmitEvent);

    expect(submission).toBeUndefined();
    expect(FormDataMock.calls).toEqual([]);
  });
});
