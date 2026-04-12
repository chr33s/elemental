import { html, type LayoutProps } from "elemental";

export default function rootLayout(props: LayoutProps) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        ${props.head}
      </head>
      <body>
        <header>
          <nav aria-label="Main navigation">
            <a href="/">Home</a>
            <a href="/about">About</a>
            <a href="/search">Search</a>
            <a href="/recover/broken">Recover</a>
            <a href="/reload">Reload</a>
          </nav>
          <div id="shell-marker">Persistent shell</div>
        </header>
        <main data-route-outlet>${props.outlet}</main>
      </body>
    </html>`;
}
