"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type StarRatingProps = {
  value: number;
  onChange?: (value: number) => void;
  label: string;
};

export function StarRating({ value, onChange, label }: StarRatingProps) {
  const t = useTranslations("Watch");
  const filled = Math.round(value);

  return (
    <div className="inline-flex" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= filled;
        const className = cn("size-4", active ? "fill-primary text-primary" : "text-white/30");
        if (!onChange) {
          return <Star key={star} className={className} aria-hidden />;
        }
        return (
          <button
            key={star}
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-sm hover:bg-white/5"
            aria-label={t("rate", { n: star })}
            aria-pressed={active}
            onClick={() => onChange(star)}
          >
            <Star className={className} />
          </button>
        );
      })}
    </div>
  );
}
