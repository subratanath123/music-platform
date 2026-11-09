const banglaDigits = "০১২৩৪৫৬৭৮৯";

export function localizeDigits(value: string, locale: string) {
  if (locale !== "bn") return value;
  return value.replace(/\d/g, (digit) => banglaDigits[Number(digit)] ?? digit);
}

export function formatNumber(value: number, locale: string) {
  return localizeDigits(String(value), locale);
}

export function formatCount(value: number, locale: string) {
  let text: string;
  if (value >= 1_000_000) text = `${(value / 1_000_000).toFixed(1)}M`;
  else if (value >= 1000) text = `${(value / 1000).toFixed(1)}k`;
  else text = String(value);
  return localizeDigits(text, locale);
}

export function formatRating(value: number, locale: string) {
  return localizeDigits(value.toFixed(1), locale);
}

export function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remain = Math.floor(seconds % 60);
  return `${minutes}:${remain.toString().padStart(2, "0")}`;
}
