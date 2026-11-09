import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { findOrCreateGoogleUser, isGmailAddress } from "@/lib/google-user";
import { setSessionCookie } from "@/lib/session";

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const errorParam = url.searchParams.get("error");

  const locale = state.endsWith(":en") ? "en" : "bn";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const registerPath = locale === "en" ? "/en/register" : "/register";

  const fail = (reason: string, detail?: unknown) => {
    console.error(`[Google SSO] ${reason}`, detail ?? "");
    const response = NextResponse.redirect(new URL(`${registerPath}?sso_error=${reason}`, siteUrl));
    response.cookies.delete("sur_oauth_state");
    return response;
  };

  const cookieStore = await cookies();
  const savedState = cookieStore.get("sur_oauth_state")?.value;

  if (errorParam) return fail(errorParam === "access_denied" ? "access_denied" : "google_error", errorParam);
  if (!code) return fail("missing_code");
  if (!savedState || savedState !== state) {
    return fail("state_mismatch", { host: request.headers.get("host"), hasCookie: Boolean(savedState) });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return fail("missing_credentials");

  const redirectUri = `${siteUrl}/api/google-oauth/callback-chatbot`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenRes.json()) as GoogleTokenResponse;
    if (!tokenRes.ok || !tokenData.access_token) {
      return fail("token_exchange_failed", tokenData);
    }

    const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = (await userRes.json()) as GoogleUserInfo;

    const email = profile.email?.trim().toLowerCase();
    if (!email || !profile.email_verified) return fail("unverified_email");
    if (!isGmailAddress(email)) return fail("gmail_only", email);

    const user = await findOrCreateGoogleUser({
      sub: profile.sub,
      email,
      name: profile.name,
      picture: profile.picture,
    });

    const destination = user.profileCompleted
      ? locale === "en"
        ? `/en/u/${user.id}`
        : `/u/${user.id}`
      : `${registerPath}?sso_success=1`;

    const response = NextResponse.redirect(new URL(destination, siteUrl));
    response.cookies.delete("sur_oauth_state");
    setSessionCookie(response, user.id);
    return response;
  } catch (error) {
    return fail("server_error", error);
  }
}
