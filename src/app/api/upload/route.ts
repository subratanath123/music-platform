import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import {
  AUDIO_EXTS,
  IMAGE_EXTS,
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  UPLOAD_DIR,
  VIDEO_EXTS,
} from "@/lib/uploads";

export async function POST(request: Request) {
  if (!(await getSessionUserId())) {
    return NextResponse.json({ error: "Please sign in to upload files." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    const isImage = file.type.startsWith("image/") || IMAGE_EXTS.has(ext);
    const isAudio =
      file.type.startsWith("audio/") ||
      AUDIO_EXTS.has(ext) ||
      (ext === ".webm" && file.type.startsWith("audio/"));
    const isVideo =
      (!isAudio && file.type.startsWith("video/")) ||
      VIDEO_EXTS.has(ext);

    if (!isImage && !isAudio && !isVideo) {
      return NextResponse.json(
        { error: "Only audio, video, or image files can be uploaded." },
        { status: 415 },
      );
    }

    const maxBytes = isImage ? MAX_IMAGE_BYTES : isVideo ? MAX_VIDEO_BYTES : MAX_AUDIO_BYTES;
    const maxMb = isImage ? "8" : isVideo ? "100" : "60";
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `File is too large (max ${maxMb} MB).` },
        { status: 413 },
      );
    }

    const kind: "image" | "audio" | "video" = isImage ? "image" : isVideo ? "video" : "audio";
    const safeExt = isImage
      ? IMAGE_EXTS.has(ext)
        ? ext
        : ".jpg"
      : isVideo
        ? VIDEO_EXTS.has(ext)
          ? ext
          : ".mp4"
        : AUDIO_EXTS.has(ext) || ext === ".webm"
          ? ext
          : ".wav";
    const prefix = isImage ? "img" : isVideo ? "video" : "audio";
    const fileName = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}${safeExt}`;

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, fileName), Buffer.from(await file.arrayBuffer()));

    return NextResponse.json({
      url: `/uploads/${fileName}`,
      name: file.name.replace(/\.[^.]+$/, ""),
      kind,
    });
  } catch (error) {
    console.error("[upload] failed", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
