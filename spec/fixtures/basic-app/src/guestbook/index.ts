import { html, type RouteProps } from "elemental";

export function head() {
  return html`<title>Guestbook</title>`;
}

export default function guestbook(props: RouteProps) {
  const name = props.url.searchParams.get("name") ?? "";
  const message = props.url.searchParams.get("message") ?? "";
  const hasSubmission = name.length > 0 || message.length > 0;

  return html`
    <section class="stack">
      <p class="eyebrow">Action route</p>
      <h1>Guestbook</h1>
      <p>
        This form posts to guestbook/index.server.ts. The action returns a redirect Response, so
        non-JavaScript browsers still work and the client router can preserve the shell.
      </p>
      <form action="/guestbook" method="post" class="stack">
        <label>
          Name
          <input name="name" value=${name} />
        </label>
        <label>
          Message
          <textarea name="message">${message}</textarea>
        </label>
        <button type="submit">Send</button>
      </form>
      ${hasSubmission
        ? html`<p class="notice" id="guestbook-status">Saved a note for ${name}: ${message}</p>`
        : html`<p class="notice" id="guestbook-status">No note submitted yet.</p>`}
    </section>
  `;
}
