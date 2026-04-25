export function escapeYaml(value) {
  return JSON.stringify(String(value ?? ""));
}

export function normalizePath(path) {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

export function sanitizeTitleForFilename(title, fallback = "conversation") {
  const safeTitle = String(title ?? "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  return safeTitle || fallback;
}

export function stripMdExtension(path) {
  return path.replace(/\.md$/i, "");
}
