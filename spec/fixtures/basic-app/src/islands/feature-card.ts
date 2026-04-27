export function mount(host: HTMLElement, props: unknown) {
  const data = props as { message?: string } | undefined;
  const message = data?.message ?? "Island ready";

  host.dataset.mounted = "true";
  host.textContent = message;
}
