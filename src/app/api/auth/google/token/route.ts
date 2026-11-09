import { NextResponse } from "next/server";
import { readDatabase } from "@/lib/db-server";
import { findOrCreateGoogleUser, isGmailAddress } from "@/lib/google-user";
import { scopeDatabaseFor } from "@/lib/db-scope";
import { setSessionCookie } from "@/lib/session";

type GoogleTokenInfo = {
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  aud?: string;
  azp?: string;
};

export async function POST(request: Request) {
  try {
    const { credential, accessToken } = (await request.json()) as {
      credential?: string;
      accessToken?: string;
    };

    if (!credential && !accessToken) {
      return NextResponse.json({ error: "Missing Google token" }, { status: 400 });
    }

    const expectedClientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!expectedClientId) {
      return NextResponse.json({ error: "Google sign-in is not configured" }, { status: 500 });
    }

    let info: GoogleTokenInfo = {};

    if (credential) {
      const verifyRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      );
      if (!verifyRes.ok) {
        return NextResponse.json({ error: "Invalid Google ID token" }, { status: 401 });
      }
      info = (await verifyRes.json()) as GoogleTokenInfo;
      if (info.aud !== expectedClientId) {
        return NextResponse.json({ error: "Client ID mismatch" }, { status: 401 });
      }
    } else if (accessToken) {
      // Access tokens must be checked against our client ID too, or a token minted for any app would be accepted.
      const tokenInfoRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      );
      const tokenInfo = (await tokenInfoRes.json()) as GoogleTokenInfo;
      if (!tokenInfoRes.ok || (tokenInfo.aud !== expectedClientId && tokenInfo.azp !== expectedClientId)) {
        return NextResponse.json({ error: "Invalid Google access token" }, { status: 401 });
      }
      const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!userRes.ok) {
        return NextResponse.json({ error: "Invalid Google access token" }, { status: 401 });
      }
      info = (await userRes.json()) as GoogleTokenInfo;
    }

    const email = info.email?.trim().toLowerCase();
    const verified = info.email_verified === true || info.email_verified === "true";
    if (!email || !verified) {
      return NextResponse.json({ error: "Unverified Google email" }, { status: 400 });
    }
    if (!isGmailAddress(email)) {
      return NextResponse.json({ error: "Only @gmail.com accounts are allowed." }, { status: 400 });
    }

    const user = await findOrCreateGoogleUser({
      sub: info.sub,
      email,
      name: info.name,
      picture: info.picture,
    });

    const response = NextResponse.json({
      db: scopeDatabaseFor(await readDatabase(), user.id),
      user,
    });
    setSessionCookie(response, user.id);
    return response;
  } catch (error) {
    console.error("[Google SSO] token sign-in failed", error);
    return NextResponse.json({ error: "Google token verification failed" }, { status: 500 });
  }
}
