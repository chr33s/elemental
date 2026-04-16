import type { ErrorBoundaryKind } from "./error-boundaries.ts";
import type { HtmlRenderable } from "./html.ts";

interface LoadedBoundaryModule<TProps> {
  default?: (props: TProps) => HtmlRenderable | Promise<HtmlRenderable>;
  head?: (props: TProps) => HtmlRenderable | Promise<HtmlRenderable>;
}

export interface ResolvedErrorBoundaryModule<TProps> {
  head?: (props: TProps) => HtmlRenderable | Promise<HtmlRenderable>;
  render: (props: TProps) => HtmlRenderable | Promise<HtmlRenderable>;
}

export async function loadErrorBoundaryModule<TProps>(options: {
  kind: ErrorBoundaryKind;
  modulePath: string;
  resolver: (modulePath: string) => Promise<unknown>;
  sourcePath: string;
}): Promise<ResolvedErrorBoundaryModule<TProps>> {
  const boundaryModule = (await options.resolver(
    options.modulePath,
  )) as LoadedBoundaryModule<TProps>;

  if (typeof boundaryModule.default !== "function") {
    throw new TypeError(
      `${capitalize(options.kind)} error boundary ${options.sourcePath} must export a default render function.`,
    );
  }

  return {
    head: typeof boundaryModule.head === "function" ? boundaryModule.head : undefined,
    render: boundaryModule.default,
  };
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
