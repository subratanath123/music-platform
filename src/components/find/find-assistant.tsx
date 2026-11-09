"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { SearchResultsList } from "@/components/search/search-results-list";
import { Button } from "@/components/ui/button";
import type { SemanticMusicianHit } from "@/lib/vector-search";

export function FindAssistant() {
  const t = useTranslations("Find");
  const searchParams = useSearchParams();
  const queryFromUrl = searchParams.get("q")?.trim() ?? "";

  const [draft, setDraft] = useState(queryFromUrl);
  const [activeQuery, setActiveQuery] = useState("");
  const [hits, setHits] = useState<SemanticMusicianHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const searchSeq = useRef(0);

  const runSearch = useCallback(async (query: string) => {
    const clean = query.trim();
    if (!clean) return;
    const seq = ++searchSeq.current;
    setActiveQuery(clean);
    setLoading(true);
    try {
      const res = await fetch(`/community-search?q=${encodeURIComponent(clean)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { hits?: SemanticMusicianHit[] };
      if (seq === searchSeq.current) setHits(Array.isArray(data.hits) ? data.hits : []);
    } catch {
      if (seq === searchSeq.current) setHits([]);
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!queryFromUrl) return;
    const timer = window.setTimeout(() => void runSearch(queryFromUrl), 0);
    return () => window.clearTimeout(timer);
  }, [queryFromUrl, runSearch]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void runSearch(draft);
  }

  function clear() {
    searchSeq.current += 1;
    setDraft("");
    setActiveQuery("");
    setHits(null);
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-6 text-primary" />
        <h1 className="font-display text-3xl">{t("title")}</h1>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("intro")}</p>

      <form
        onSubmit={submit}
        className="mt-5 flex items-center gap-2 rounded-full border border-white/10 bg-[#161616] p-2 shadow-xl"
      >
        <label className="sr-only" htmlFor="find-query">
          {t("placeholder")}
        </label>
        <input
          id="find-query"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("placeholder")}
          className="h-10 min-w-0 flex-1 rounded-full bg-transparent px-4 text-sm outline-none"
        />
        <Button type="submit" size="sm" className="rounded-full px-5" disabled={!draft.trim() || loading}>
          {loading ? "…" : t("send")}
        </Button>
      </form>

      {hits !== null || loading ? (
        <SearchResultsList hits={hits ?? []} query={activeQuery} loading={loading} onClear={clear} />
      ) : null}
    </div>
  );
}
