"use client";

import { Pause, Play, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ScWaveform } from "@/components/landing/sc-waveform";
import { cn } from "@/lib/utils";

const TRACK_META = {
  neela: { seed: 4, seconds: 48, snapshot: 62 },
  farhan: { seed: 12, seconds: 72, snapshot: 28 },
  rupa: { seed: 21, seconds: 36, snapshot: 71 },
  imran: { seed: 33, seconds: 125, snapshot: 18 },
  anika: { seed: 47, seconds: 54, snapshot: 46 },
} as const;

type TrackId = keyof typeof TRACK_META;

type TrackCopy = {
  id: TrackId;
  artist: string;
  city: string;
  title: string;
  role: string;
  genre: string;
};

const AVATAR = ["#ff5500", "#ff7733", "#7ecfc2", "#f0b429", "#f5f5f5"] as const;

function clock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function Studio() {
  const t = useTranslations("Stream");
  const hero = useTranslations("Hero");
  const copies = t.raw("tracks") as TrackCopy[];
  const tracks = copies.filter((track) => track.id in TRACK_META);
  const [activeId, setActiveId] = useState<TrackId>(tracks[0]?.id ?? "neela");
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState<number>(TRACK_META.neela.snapshot);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("all");
  const [reduceMotion, setReduceMotion] = useState(false);

  const active = tracks.find((track) => track.id === activeId) ?? tracks[0];
  const meta = TRACK_META[active?.id ?? "neela"];

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!playing || reduceMotion) return;
    const timer = window.setInterval(() => {
      setProgress((value) => (value >= 100 ? 0 : value + 100 / (meta.seconds * 20)));
    }, 50);
    return () => window.clearInterval(timer);
  }, [playing, reduceMotion, meta.seconds]);

  const genres = ["all", ...new Set(tracks.map((track) => track.genre))];
  const needle = query.trim().toLowerCase();
  const visible = tracks.filter((track) => {
    const matchesGenre = genre === "all" || track.genre === genre;
    const haystack = `${track.artist} ${track.city} ${track.title} ${track.role} ${track.genre}`.toLowerCase();
    return matchesGenre && (needle.length === 0 || haystack.includes(needle));
  });

  function choose(id: TrackId) {
    if (id === activeId) {
      setPlaying((value) => !value);
      return;
    }
    setActiveId(id);
    setProgress(TRACK_META[id].snapshot);
    setPlaying(true);
  }

  if (!active) return null;

  const elapsed = (progress / 100) * meta.seconds;
  const playLabel = playing ? t("pause") : t("play");

  return (
    <>
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-8 sm:px-5 sm:pt-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            {hero("eyebrow")}
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.12] sm:text-6xl">
            <span className="block">{hero("line1")}</span>
            <span className="block text-primary">{hero("line2")}</span>
            <span className="block">{hero("line3")}</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
            {hero("sub")}
          </p>

          <div className="relative mt-8">
            <button
              type="button"
              className="absolute top-1/2 left-1 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-foreground sm:size-14"
              aria-label={playLabel}
              aria-pressed={playing}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? (
                <Pause className="size-5" fill="currentColor" aria-hidden="true" />
              ) : (
                <Play className="size-5 translate-x-px" fill="currentColor" aria-hidden="true" />
              )}
            </button>
            <ScWaveform
              seed={meta.seed}
              progress={progress}
              bars={96}
              className="h-24 sm:h-32"
              label={t("scrub")}
              onScrub={setProgress}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <p className="min-w-0 truncate">
              <span className="text-foreground">{active.artist}</span>
              <span> · {active.title}</span>
            </p>
            <p className="shrink-0 tabular-nums">
              {clock(elapsed)} / {clock(meta.seconds)}
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <a
              href="#vocalist"
              className="inline-flex min-h-11 items-center justify-center bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              {hero("vocalist")}
            </a>
            <a
              href="#instrumentalist"
              className="inline-flex min-h-11 items-center justify-center border border-white/15 px-4 text-sm font-semibold text-foreground hover:border-primary"
            >
              {hero("instrumentalist")}
            </a>
          </div>
        </div>
      </section>

      <section id="stream" aria-labelledby="stream-title" className="mx-auto max-w-6xl px-4 py-8 sm:px-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            {t("kicker")}
          </p>
          <h2 id="stream-title" className="mt-2 text-2xl font-semibold sm:text-3xl">
            {t("title")}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{t("note")}</p>
        </div>

        <label className="mt-5 flex h-11 items-center gap-2 border border-border bg-card px-3">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">{t("search")}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search")}
            className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {genres.map((item) => {
            const selected = genre === item;
            return (
              <button
                key={item}
                type="button"
                aria-pressed={selected}
                onClick={() => setGenre(item)}
                className={cn(
                  "h-8 shrink-0 px-3 text-xs font-semibold",
                  selected ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
                )}
              >
                {item === "all" ? t("all") : item}
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/8">
            {visible.map((track) => {
              const info = TRACK_META[track.id];
              const selected = track.id === activeId;
              const initial = track.artist.trim().charAt(0);
              const tone = AVATAR[info.seed % AVATAR.length];
              return (
                <li key={track.id} className={cn("py-4", selected && "bg-white/[0.03]")}>
                  <div className="flex items-center gap-3 sm:gap-4">
                    <button
                      type="button"
                      onClick={() => choose(track.id)}
                      aria-label={`${playLabel}: ${track.title}`}
                      aria-pressed={selected && playing}
                      className="grid size-12 shrink-0 place-items-center rounded-full text-sm font-semibold text-primary-foreground"
                      style={{ background: tone }}
                    >
                      {selected && playing ? (
                        <Pause className="size-4" fill="currentColor" aria-hidden="true" />
                      ) : (
                        <span aria-hidden="true">{initial}</span>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0">
                          <span className="block truncate text-xs text-muted-foreground">
                            {track.artist} · {track.city}
                          </span>
                          <span className="block truncate text-sm font-semibold sm:text-base">
                            {track.title}
                          </span>
                        </p>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {clock(info.seconds)}
                        </span>
                      </div>
                      <ScWaveform
                        seed={info.seed}
                        progress={selected ? progress : info.snapshot}
                        bars={72}
                        className="mt-2 h-12"
                        label={t("scrub")}
                        onScrub={(value) => {
                          setActiveId(track.id);
                          setProgress(value);
                        }}
                      />
                      <p className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span className="bg-card px-2 py-0.5 text-foreground">{track.role}</span>
                        <span className="px-1 py-0.5">{track.genre}</span>
                        <span className="px-1 py-0.5 text-primary">{t("preview")}</span>
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#111]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <button
            type="button"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
            aria-label={playLabel}
            aria-pressed={playing}
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? (
              <Pause className="size-4" fill="currentColor" aria-hidden="true" />
            ) : (
              <Play className="size-4 translate-x-px" fill="currentColor" aria-hidden="true" />
            )}
          </button>
          <div className="w-28 shrink-0 sm:w-44">
            <p className="truncate text-sm font-semibold">{active.title}</p>
            <p className="truncate text-xs text-muted-foreground">{active.artist}</p>
          </div>
          <ScWaveform
            seed={meta.seed}
            progress={progress}
            bars={64}
            className="h-8 min-w-0 flex-1"
            label={t("scrub")}
            onScrub={setProgress}
          />
          <p className="hidden w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
            {clock(elapsed)}
          </p>
        </div>
      </div>
    </>
  );
}
