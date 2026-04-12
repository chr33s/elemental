import type { RouteServerContext } from "elemental";

export async function action(context: RouteServerContext) {
  const form = await context.request.formData();
  const name = readField(form, "name", "Anonymous");
  const message = readField(form, "message", "No message");
  const redirectUrl = new URL("/guestbook", context.url);

  redirectUrl.searchParams.set("name", name);
  redirectUrl.searchParams.set("message", message);

  return Response.redirect(redirectUrl, 303);
}

function readField(form: FormData, fieldName: string, fallback: string): string {
  const entry = form.get(fieldName);
  const value = typeof entry === "string" ? entry.trim() : "";

  return value.length > 0 ? value : fallback;
}
