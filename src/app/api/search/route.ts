import { NextResponse } from "next/server";
import { semanticSearchMusiciansInPg } from "@/lib/db-server";
import { toPublicUser } from "@/lib/db-scope";

async function search(raw: string | undefined | null) {
  const q = raw?.trim().slice(0, 200) ?? "";
  if (!q) return NextResponse.json({ query: "", hits: [] });
  const hits = (await semanticSearchMusiciansInPg(q)).map((hit) => ({
    ...hit,
    user: toPublicUser(hit.user),
  }));
  return NextResponse.json({ query: q, hits });
}

export async function GET(request: Request) {
  return search(new URL(request.url).searchParams.get("q"));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { query?: string };
  return search(body.query);
}
