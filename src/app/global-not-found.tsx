import type { Metadata } from "next";
import Link from "next/link";
import { inter, notoBengali, plusJakarta } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "পাতাটা পাওয়া যায়নি · SurShongi",
  description: "This page could not be found.",
};

export default function GlobalNotFound() {
  return (
    <html
      lang="bn"
      data-scroll-behavior="smooth"
      className={`dark ${inter.variable} ${plusJakarta.variable} ${notoBengali.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-24">
          <p className="text-sm font-semibold text-amber">404</p>
          <h1 className="mt-3 font-display text-4xl leading-tight">এই পাতাটা নেই</h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground" lang="en">
            This page isn&apos;t here.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex h-11 items-center justify-center self-start rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            সুরসঙ্গী
          </Link>
        </main>
      </body>
    </html>
  );
}
