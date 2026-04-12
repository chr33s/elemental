import { html, type LayoutProps } from "elemental";

const navigationLinks = [
  {
    href: "/",
    label: "Home",
  },
  {
    href: "/about",
    label: "About",
  },
  {
    href: "/guides",
    label: "Guides",
  },
  {
    href: "/guestbook",
    label: "Guestbook",
  },
  {
    href: "/search",
    label: "Search",
  },
  {
    href: "/recover/broken",
    label: "Recover",
  },
  {
    href: "/reload",
    label: "Reload",
  },
];

export default function rootLayout(props: LayoutProps) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        ${props.head}
      </head>
      <body>
        <div class="site-shell">
          <header class="site-header">
            <div class="site-header-copy">
              <p class="site-eyebrow">Elemental example app</p>
              <h1 class="site-title">Runtime SSR for native Web Components</h1>
            </div>
            <nav aria-label="Main navigation" class="site-nav">
              ${navigationLinks.map((link) => html`<a href=${link.href}>${link.label}</a>`)}
            </nav>
            <div id="shell-marker" class="shell-marker">Persistent shell</div>
          </header>
          <main class="route-frame" data-route-outlet>${props.outlet}</main>
        </div>
      </body>
    </html>`;
}
