"use client";

import { Fragment } from "react";
import { MapPin, MessageCircle, PlayCircle, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { getDefaultCoverUrl } from "@/components/profile/default-cover-art";
import { UserAvatar } from "@/components/profile/user-avatar";
import { pick, type Role } from "@/data/catalog";
import { Link, useRouter } from "@/i18n/navigation";
import { openChatWindow, useCurrentUser } from "@/lib/community-store";
import { formatNumber, formatRating } from "@/lib/format";
import type { MatchSource, SemanticMusicianHit } from "@/lib/vector-search";

const sourceLabels: Record<MatchSource, { en: string; bn: string }> = {
  showcase: { en: "From showcase", bn: "শোকেস থেকে" },
  post: { en: "From post", bn: "পোস্ট থেকে" },
  bio: { en: "From bio", bn: "পরিচিতি থেকে" },
  skills: { en: "Skills", bn: "দক্ষতা" },
  genres: { en: "Genres", bn: "ঘরানা" },
  location: { en: "Location", bn: "ঠিকানা" },
  name: { en: "Name", bn: "নাম" },
  profile: { en: "Profile", bn: "প্রোফাইল" },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const usable = terms.filter((t) => t.length >= 2);
  if (usable.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${usable.map(escapeRegExp).join("|")})`, "giu");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded bg-primary/25 px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function SearchResultsList({
  hits,
  query,
  loading,
  onClear,
}: {
  hits: SemanticMusicianHit[];
  query: string;
  loading?: boolean;
  onClear?: () => void;
}) {
  const home = useTranslations("Home");
  const locale = useLocale();
  const router = useRouter();
  const currentUser = useCurrentUser();
  const activeUserId = currentUser?.id ?? null;
  const bn = locale === "bn";

  return (
    <section
      className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-[#141414] shadow-xl"
      aria-label={bn ? "সার্চ ফলাফল" : "Search results"}
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
        <p className="min-w-0 truncate text-sm text-muted-foreground">
          {loading
            ? bn
              ? "খোঁজা হচ্ছে…"
              : "Searching…"
            : bn
              ? `"${query}" — ${formatNumber(hits.length, locale)} জন মিউজিশিয়ান`
              : `${formatNumber(hits.length, locale)} musician${hits.length === 1 ? "" : "s"} for "${query}"`}
        </p>
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
          >
            {bn ? "মুছুন" : "Clear"}
          </button>
        ) : null}
      </header>

      {loading ? null : hits.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          {bn
            ? "কোনো মিল পাওয়া যায়নি। অন্য শব্দে চেষ্টা করুন (যেমন: গিটার ঢাকা)।"
            : 'No matching musicians. Try other words (e.g. "guitar dhaka").'}
        </p>
      ) : (
        <ul className="divide-y divide-white/10">
          {hits.map((hit) => {
            const user = hit.user;
            const name = pick(locale, user.nameBn, user.name);
            const role = user.roles[0] ? home(`roles.${user.roles[0] as Role}`) : "";
            const city = pick(locale, user.cityBn, user.city);
            const thumb = hit.thumbnailYoutubeId
              ? `https://i.ytimg.com/vi/${hit.thumbnailYoutubeId}/mqdefault.jpg`
              : user.coverUrl || getDefaultCoverUrl(user.id, user.roles[0]);
            const source = sourceLabels[hit.matchedSource];

            return (
              <li key={user.id} className="group flex gap-4 px-4 py-4 transition-colors hover:bg-white/[0.03] sm:px-5">
                <Link
                  href={`/u/${user.id}`}
                  className="relative block h-24 w-36 shrink-0 overflow-hidden rounded-2xl bg-black sm:h-28 sm:w-48"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumb}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    style={
                      !hit.thumbnailYoutubeId && user.coverUrl
                        ? { objectPosition: `center ${user.coverPositionY ?? 50}%` }
                        : undefined
                    }
                  />
                  {hit.thumbnailYoutubeId ? (
                    <PlayCircle className="absolute right-2 bottom-2 size-6 text-white drop-shadow" aria-hidden />
                  ) : null}
                  <UserAvatar
                    src={user.avatarUrl}
                    name={name}
                    className="absolute bottom-2 left-2 size-10 ring-2 ring-black"
                    textClassName="text-sm"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/u/${user.id}`} className="min-w-0">
                      <span className="block truncate text-base font-semibold group-hover:text-primary">
                        {name}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {role ? <span>{role}</span> : null}
                        {city ? (
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="size-3" aria-hidden />
                            {city}
                          </span>
                        ) : null}
                        {user.ratingCount > 0 ? (
                          <span className="inline-flex items-center gap-0.5">
                            <Star className="size-3 fill-primary text-primary" aria-hidden />
                            {formatRating(user.rating, locale)}
                          </span>
                        ) : null}
                        {user.priceFromBdt ? (
                          <span>৳{formatNumber(user.priceFromBdt, locale)}+</span>
                        ) : null}
                      </span>
                    </Link>
                    <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      {hit.similarity}%
                    </span>
                  </div>

                  {hit.matchedText ? (
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-foreground/85">
                      <span className="mr-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        {bn ? source.bn : source.en}:
                      </span>
                      “<Highlighted text={hit.matchedText} terms={hit.matchedTerms} />”
                    </p>
                  ) : null}

                  <div className="mt-auto flex items-center gap-2 pt-2.5 text-xs">
                    {user.id !== activeUserId ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeUserId) {
                            router.push("/register");
                            return;
                          }
                          openChatWindow(user.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 hover:border-primary"
                      >
                        <MessageCircle className="size-3.5 text-primary" />
                        {home("messageBtn")}
                      </button>
                    ) : null}
                    <Link
                      href={`/u/${user.id}`}
                      className="rounded-full border border-white/15 px-3 py-1 hover:border-primary"
                    >
                      {home("openProfile")}
                    </Link>
                    {hit.showcaseCount > 0 ? (
                      <span className="ml-auto text-muted-foreground">
                        {bn
                          ? `${formatNumber(hit.showcaseCount, locale)}টি শোকেস`
                          : `${formatNumber(hit.showcaseCount, locale)} showcase${hit.showcaseCount === 1 ? "" : "s"}`}
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
