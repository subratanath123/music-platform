import { useTranslations } from "next-intl";
import { Mark } from "@/components/brand/mark";
import { Link } from "@/i18n/navigation";

export function SiteFooter() {
  const t = useTranslations("Footer");
  const nav = useTranslations("Nav");

  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <div className="max-w-md">
          <Link href="/" className="inline-flex items-center gap-2">
            <Mark className="text-primary" />
            <span className="text-base font-semibold">{nav("brand")}</span>
          </Link>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("blurb")}</p>
        </div>
        <div className="flex flex-col gap-3 text-sm sm:items-end">
          <nav className="flex gap-4" aria-label={nav("brand")}>
            <Link href="/register" className="text-muted-foreground hover:text-foreground">
              {nav("register")}
            </Link>
            <Link href="/find" className="text-muted-foreground hover:text-foreground">
              {nav("find")}
            </Link>
            <Link href="/editor" className="text-muted-foreground hover:text-foreground">
              {nav("editor")}
            </Link>
          </nav>
          <p className="text-muted-foreground">{t("rights")}</p>
        </div>
      </div>
    </footer>
  );
}
