import { html, type RouteProps } from "elemental";

export function head(props: RouteProps) {
  const query = props.url.searchParams.get("q") ?? "empty";

  return html`<title>Search ${query}</title>`;
}

export default function search(props: RouteProps) {
  const query = props.url.searchParams.get("q") ?? "";

  return html`
    <section>
      <h1>Search</h1>
      <form action="/search" method="get">
        <label>
          Query
          <input name="q" value=${query} />
        </label>
        <button type="submit">Search</button>
      </form>
      <p id="search-query">${query || "empty"}</p>
    </section>
  `;
}
