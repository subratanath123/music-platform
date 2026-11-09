"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const options = [
  { locale: "bn", label: "বাংলা", name: "বাংলা", hrefLang: "bn" },
  { locale: "en", label: "EN", name: "English", hrefLang: "en" },
] as const;

export function LanguageToggle() {
  const t = useTranslations("Nav");
  const current = useLocale();
  const pathname = usePathname();

  return (
    <div
      role="group"
      aria-label={t("language")}
      className="inline-flex shrink-0 rounded-full border border-white/10 bg-[#1a1a1a] p-1"
    >
      {options.map((option) => {
        const active = current === option.locale;
        return (
          <Link
            key={option.locale}
            href={pathname}
            locale={option.locale}
            hrefLang={option.hrefLang}
            lang={option.hrefLang}
            aria-label={option.name}
            aria-current={active ? "true" : undefined}
            className={cn(
              "inline-flex min-h-8 min-w-9 items-center justify-center rounded-full px-3 text-xs font-semibold transition-all",
              active
                ? "bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] text-[#1a0900] shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
