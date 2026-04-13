export interface FormNavigationSubmission {
  body?: FormData;
  history: "push";
  method: string;
  url: URL;
}

export function createFormSubmission(
  form: HTMLFormElement,
  event: Event,
): FormNavigationSubmission | undefined {
  const submitUrl = new URL(form.action || window.location.href, window.location.href);

  if (submitUrl.origin !== window.location.origin) {
    return undefined;
  }

  const method = (form.method || "get").toUpperCase();
  const submitEvent = event as SubmitEvent;
  const submitter = submitEvent.submitter;
  const formData =
    submitter instanceof HTMLElement ? new FormData(form, submitter) : new FormData(form);

  if (method === "GET") {
    const query = new URLSearchParams();

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

  return {
    body: formData,
    history: "push",
    method,
    url: submitUrl,
  };
}
