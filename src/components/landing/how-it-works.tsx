import { useTranslations } from "next-intl";

export function HowItWorks() {
  const t = useTranslations("How");
  const steps = t.raw("steps") as { title: string; body: string }[];

  return (
    <section id="how" aria-labelledby="how-title" className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-5 sm:py-16">
        <h2 id="how-title" className="text-2xl font-semibold sm:text-3xl">
          {t("title")}
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{t("sub")}</p>
        <ol className="mt-6 grid gap-px bg-white/10 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="bg-background p-5">
              <span className="text-sm font-semibold text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
