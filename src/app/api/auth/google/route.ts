import crypto from "node:crypto";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale") === "en" ? "en" : "bn";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const registerPath = locale === "en" ? "/en/register" : "/register";

  // The state cookie must live on the same host Google redirects back to.
  const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  if (requestHost !== new URL(siteUrl).host) {
    return NextResponse.redirect(new URL(`${url.pathname}${url.search}`, siteUrl));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`${registerPath}?sso_error=missing_credentials`, siteUrl),
    );
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const state = `${nonce}:${locale}`;
  const redirectUri = `${siteUrl}/api/google-oauth/callback-chatbot`;

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", clientId);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("prompt", "select_account");
  googleAuthUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(googleAuthUrl.toString());
  response.cookies.set("sur_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
