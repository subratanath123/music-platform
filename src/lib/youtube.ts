const idPattern = /^[\w-]{11}$/;

export function youtubeIdFromUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (idPattern.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
      return idPattern.test(id) ? id : "";
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const fromQuery = url.searchParams.get("v") ?? "";
      if (idPattern.test(fromQuery)) return fromQuery;
      const parts = url.pathname.split("/").filter(Boolean);
      const marker = parts.findIndex((part) => part === "embed" || part === "shorts" || part === "live");
      const id = marker >= 0 ? (parts[marker + 1] ?? "") : "";
      return idPattern.test(id) ? id : "";
    }
  } catch {
    return "";
  }

  return "";
}
