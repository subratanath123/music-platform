import { Drum, Guitar, Mic, PenLine, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { ScWaveform } from "@/components/landing/sc-waveform";

const icons: Record<string, LucideIcon> = {
  vocalist: Mic,
  guitarist: Guitar,
  instrumentalist: Drum,
  producer: SlidersHorizontal,
  lyricist: PenLine,
};

const seeds = [6, 14, 22, 31, 44];
const progress = [58, 33, 72, 21, 47];

export function Roles() {
  const t = useTranslations("Roles");
  const items = t.raw("items") as { id: string; title: string; body: string }[];
  const instruments = t.raw("instruments") as string[];
  const genres = t.raw("genres") as string[];

  return (
    <section id="roles" aria-labelledby="roles-title" className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-5 sm:py-16">
        <h2 id="roles-title" className="text-2xl font-semibold sm:text-3xl">
          {t("title")}
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{t("sub")}</p>

        <ul className="mt-6 grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => {
            const Icon = icons[item.id] ?? Mic;
            return (
              <li key={item.id} className="bg-background p-5">
                <span className="grid size-9 place-items-center bg-card text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
                <ScWaveform
                  seed={seeds[index] ?? 10}
                  progress={progress[index] ?? 40}
                  bars={48}
                  className="mt-4 h-8"
                />
              </li>
            );
          })}
        </ul>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <ChipList label={t("instrumentsLabel")} items={instruments} />
          <ChipList label={t("genresLabel")} items={genres} />
        </div>
      </div>
    </section>
  );
}

function ChipList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{label}</h3>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item} className="bg-card px-2.5 py-1 text-xs text-foreground">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
