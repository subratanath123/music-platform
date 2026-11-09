import fs from "node:fs/promises";
import path from "node:path";
import { CONTENT_TYPES, UPLOAD_DIR } from "@/lib/uploads";

// Files written after `next build` are not served from public/, so uploads are streamed from here.
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[\w.-]+$/.test(name) || name.startsWith(".")) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(UPLOAD_DIR, name);
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!stat.isFile()) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": CONTENT_TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });

  const range = request.headers.get("range");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (match && (match[1] || match[2])) {
    const size = stat.size;
    let start = match[1] ? Number(match[1]) : size - Number(match[2]);
    let end = match[1] && match[2] ? Number(match[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const handle = await fs.open(filePath);
    const buffer = Buffer.alloc(end - start + 1);
    await handle.read(buffer, 0, buffer.length, start);
    await handle.close();
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(buffer.length));
    return new Response(buffer, { status: 206, headers });
  }

  const data = await fs.readFile(filePath);
  headers.set("Content-Length", String(data.length));
  return new Response(data, { headers });
}
