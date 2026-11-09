import { useTranslations } from "next-intl";
import { ScWaveform } from "@/components/landing/sc-waveform";

export function Paths() {
  const t = useTranslations("Paths");

  return (
    <section id="start" aria-labelledby="paths-title" className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-5 sm:py-16">
        <h2 id="paths-title" className="text-2xl font-semibold sm:text-3xl">
          {t("title")}
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{t("sub")}</p>
        <div className="mt-6 grid gap-px bg-white/10 lg:grid-cols-2">
          <article id="vocalist" className="border-l-4 border-primary bg-background p-5 sm:p-6">
            <h3 className="text-xl font-semibold">{t("vocalistTitle")}</h3>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{t("vocalistBody")}</p>
            <ScWaveform seed={8} progress={64} bars={64} className="mt-5 h-12" />
          </article>
          <article id="instrumentalist" className="border-l-4 border-teal bg-background p-5 sm:p-6">
            <h3 className="text-xl font-semibold">{t("instrumentTitle")}</h3>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              {t("instrumentBody")}
            </p>
            <ScWaveform seed={19} progress={38} bars={64} className="mt-5 h-12" />
          </article>
        </div>
      </div>
    </section>
  );
}
