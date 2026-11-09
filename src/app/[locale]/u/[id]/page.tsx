import { Suspense } from "react";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { getTranslations } from "next-intl/server";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { readDatabase } from "@/lib/db-server";

const PLACEHOLDER_ID = "_";

export function generateStaticParams() {
  return [{ id: PLACEHOLDER_ID }];
}

async function getProfileName(id: string) {
  "use cache";
  cacheLife("minutes");
  if (id === PLACEHOLDER_ID) return null;
  try {
    const db = await readDatabase();
    return db.users.find((u) => u.id === id)?.name ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("Profile");
  return { title: (await getProfileName(id)) ?? t("title") };
}

async function ProfileLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProfileScreen musicianId={id} />;
}

export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <ProfileLoader params={params} />
    </Suspense>
  );
}
