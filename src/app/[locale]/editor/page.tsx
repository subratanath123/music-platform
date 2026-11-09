import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MixEditor } from "@/components/editor/mix-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Editor");
  return { title: t("title") };
}

export default function EditorPage() {
  return (
    <Suspense fallback={null}>
      <MixEditor />
    </Suspense>
  );
}
