import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FindAssistant } from "@/components/find/find-assistant";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Find");
  return { title: t("title") };
}

export default function FindPage() {
  return (
    <Suspense fallback={null}>
      <FindAssistant />
    </Suspense>
  );
}
