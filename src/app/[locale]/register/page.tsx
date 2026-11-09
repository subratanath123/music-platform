import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RegisterForm } from "@/components/register/register-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Register");
  return { title: t("title") };
}

export default function RegisterPage() {
  return <RegisterForm />;
}
