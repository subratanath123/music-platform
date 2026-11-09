import { NextResponse } from "next/server";
import { readDatabase } from "@/lib/db-server";
import { getSessionUserId, SESSION_COOKIE } from "@/lib/session";

export async function GET() {
  const sessionUserId = await getSessionUserId();
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const ssoConfigured = Boolean(
    googleClientId && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );

  if (!sessionUserId) {
    return NextResponse.json({ user: null, ssoConfigured, googleClientId });
  }

  const db = await readDatabase();
  const user = db.users.find((u) => u.id === sessionUserId) ?? null;
  return NextResponse.json({ user, ssoConfigured, googleClientId });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
