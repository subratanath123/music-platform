import { Scissors, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Mark } from "@/components/brand/mark";
import { HeaderAuthPill } from "@/components/layout/header-auth-pill";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { Link } from "@/i18n/navigation";

export function SiteHeader() {
  const t = useTranslations("Nav");

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#111]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-5">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label={t("home")}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#ff5500] via-[#ff7722] to-[#ffaa33] text-[#1a0900] shadow-md shadow-[#ff5500]/20">
            <Mark className="size-5" />
          </span>
          <span className="hidden truncate text-base font-semibold tracking-tight text-foreground sm:inline">
            {t("brand")}
          </span>
        </Link>

        <nav className="flex items-center gap-1.5 sm:gap-2.5" aria-label={t("brand")}>
          <Link
            href="/find"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground"
            aria-label={t("find")}
          >
            <Search className="size-4" aria-hidden />
            <span className="hidden md:inline">{t("find")}</span>
          </Link>
          <Link
            href="/editor"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground"
            aria-label={t("editor")}
          >
            <Scissors className="size-4" aria-hidden />
            <span className="hidden md:inline">{t("editor")}</span>
          </Link>
          <LanguageToggle />
          <HeaderAuthPill />
        </nav>
      </div>
    </header>
  );
}
