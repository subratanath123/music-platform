import path from "node:path";

export const UPLOAD_DIR = process.env.UPLOAD_DIR?.trim() || path.join(process.cwd(), "public", "uploads");

export const AUDIO_EXTS = new Set([".wav", ".mp3", ".ogg", ".m4a", ".aac", ".flac"]);
export const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov", ".m4v", ".mkv"]);
export const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

export const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const CONTENT_TYPES: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".mkv": "video/x-matroska",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};
