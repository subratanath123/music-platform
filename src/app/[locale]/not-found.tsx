import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <div className="mx-auto flex max-w-lg flex-col items-start px-5 py-24">
      <h1 className="font-display text-4xl leading-tight">{t("title")}</h1>
      <p className="mt-4 text-base leading-7 text-muted-foreground">{t("body")}</p>
      <Button asChild className="mt-8">
        <Link href="/">{t("home")}</Link>
      </Button>
    </div>
  );
}
