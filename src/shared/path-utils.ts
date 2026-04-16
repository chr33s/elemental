export function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function splitPathSegments(pathname: string): string[] {
  if (pathname === "/") {
    return [];
  }

  return pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment));
}

export function normalizePosixPath(value: string): string {
  const isAbsolute = value.startsWith("/");
  const segments: string[] = [];

  for (const rawSegment of toPosixPath(value).split("/")) {
    if (rawSegment === "" || rawSegment === ".") {
      continue;
    }

    if (rawSegment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..") {
        segments.pop();
      } else if (!isAbsolute) {
        segments.push(rawSegment);
      }

      continue;
    }

    segments.push(rawSegment);
  }

  const normalizedPath =
    `${isAbsolute ? "/" : ""}${segments.join("/")}` || (isAbsolute ? "/" : ".");

  return normalizedPath.endsWith("/") && normalizedPath !== "/"
    ? normalizedPath.slice(0, -1)
    : normalizedPath;
}

export function dirnamePosix(value: string): string {
  const normalizedPath = normalizePosixPath(value);

  if (normalizedPath === "/") {
    return "/";
  }

  const lastSlashIndex = normalizedPath.lastIndexOf("/");

  if (lastSlashIndex < 0) {
    return ".";
  }

  if (lastSlashIndex === 0) {
    return "/";
  }

  return normalizedPath.slice(0, lastSlashIndex);
}

export function relativePosixPath(fromPath: string, toPath: string): string {
  const fromSegments = toPosixSegments(fromPath);
  const toSegments = toPosixSegments(toPath);
  let sharedIndex = 0;

  while (
    sharedIndex < fromSegments.length &&
    sharedIndex < toSegments.length &&
    fromSegments[sharedIndex] === toSegments[sharedIndex]
  ) {
    sharedIndex += 1;
  }

  return [
    ...Array.from({ length: Math.max(0, fromSegments.length - sharedIndex) }, () => ".."),
    ...toSegments.slice(sharedIndex),
  ].join("/");
}

function toPosixSegments(value: string): string[] {
  const normalizedPath = normalizePosixPath(value);

  if (normalizedPath === "/" || normalizedPath === ".") {
    return [];
  }

  return normalizedPath.replace(/^\//u, "").split("/");
}
