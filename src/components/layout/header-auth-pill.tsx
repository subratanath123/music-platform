"use client";

import { useLocale, useTranslations } from "next-intl";
import { pick } from "@/data/catalog";
import { Link } from "@/i18n/navigation";
import { useCurrentUser } from "@/lib/community-store";

export function HeaderAuthPill() {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const user = useCurrentUser();

  if (user) {
    const name = pick(locale, user.nameBn, user.name);
    return (
      <div className="flex items-center gap-1.5">
        <Link
          href={`/u/${user.id}`}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-primary/40 bg-gradient-to-r from-[#1f1814] to-[#271d18] px-3.5 text-xs font-semibold text-foreground hover:border-primary"
        >
          <span className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-[#ff5500] to-[#ffaa33] text-[11px] font-bold text-[#1a0900]">
            {name.slice(0, 1)}
          </span>
          <span className="max-w-28 truncate">{name}</span>
        </Link>
      </div>
    );
  }

  return (
    <Link
      href="/register"
      className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-4 text-xs font-semibold text-[#1a0900] shadow-md shadow-[#ff5500]/20 hover:brightness-110"
    >
      <span className="grid size-5 place-items-center rounded-full bg-black/20 text-[10px] font-bold">
        G
      </span>
      <span>{t("register")}</span>
    </Link>
  );
}
