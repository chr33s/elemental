export interface FormNavigationSubmission {
  body?: FormData | URLSearchParams | string;
  headers?: HeadersInit;
  history: "push";
  method: string;
  url: URL;
}

export function createFormSubmission(
  form: HTMLFormElement,
  event: Event,
): FormNavigationSubmission | undefined {
  const submitter = getSubmitter(event);
  const submitUrl = resolveSubmitUrl(form, submitter);

  if (submitUrl.origin !== window.location.origin) {
    return undefined;
  }

  if (!targetsCurrentContext(form, submitter)) {
    return undefined;
  }

  const method = resolveSubmitMethod(form, submitter);

  if (method === "DIALOG") {
    return undefined;
  }

  const formData =
    submitter instanceof HTMLElement ? new FormData(form, submitter) : new FormData(form);

  if (method === "GET") {
    const query = new URLSearchParams(submitUrl.search);

    for (const [name, value] of formData.entries()) {
      query.append(name, typeof value === "string" ? value : value.name);
    }

    submitUrl.search = query.toString();

    return {
      history: "push",
      method,
      url: submitUrl,
    };
  }

  const encodedBody = encodeRequestBody(formData, resolveSubmitEnctype(form, submitter));

  return {
    body: encodedBody.body,
    headers: encodedBody.headers,
    history: "push",
    method,
    url: submitUrl,
  };
}

function getSubmitter(event: Event): HTMLElement | undefined {
  const submitter = (event as SubmitEvent).submitter;

  return submitter instanceof HTMLElement ? submitter : undefined;
}

function resolveSubmitUrl(form: HTMLFormElement, submitter?: HTMLElement): URL {
  const action =
    readStringProperty(submitter, "formAction") ||
    readStringProperty(form, "action") ||
    window.location.href;

  return new URL(action, window.location.href);
}

function resolveSubmitMethod(form: HTMLFormElement, submitter?: HTMLElement): string {
  return (
    readStringProperty(submitter, "formMethod") ||
    readStringProperty(form, "method") ||
    "get"
  ).toUpperCase();
}

function resolveSubmitEnctype(form: HTMLFormElement, submitter?: HTMLElement): string {
  return (
    readStringProperty(submitter, "formEnctype") ||
    readStringProperty(form, "enctype") ||
    readStringProperty(form, "encoding") ||
    "application/x-www-form-urlencoded"
  ).toLowerCase();
}

function targetsCurrentContext(form: HTMLFormElement, submitter?: HTMLElement): boolean {
  const target =
    readStringProperty(submitter, "formTarget") || readStringProperty(form, "target") || "_self";

  return target.length === 0 || target.toLowerCase() === "_self";
}

function encodeRequestBody(
  formData: FormData,
  enctype: string,
): {
  body: FormData | URLSearchParams | string;
  headers?: HeadersInit;
} {
  switch (enctype) {
    case "application/x-www-form-urlencoded": {
      const body = new URLSearchParams();

      for (const [name, value] of formData.entries()) {
        body.append(name, typeof value === "string" ? value : value.name);
      }

      return { body };
    }

    case "multipart/form-data":
      return { body: formData };

    case "text/plain":
      return {
        body: [...formData.entries()]
          .map(([name, value]) => `${name}=${typeof value === "string" ? value : value.name}`)
          .join("\r\n"),
        headers: {
          "content-type": "text/plain; charset=UTF-8",
        },
      };

    default:
      return { body: formData };
  }
}

function readStringProperty(target: object | undefined, propertyName: string): string | undefined {
  const value = target === undefined ? undefined : Reflect.get(target, propertyName);

  return typeof value === "string" ? value : undefined;
}
