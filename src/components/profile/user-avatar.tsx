"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function UserAvatar({
  src,
  name,
  className,
  textClassName = "text-lg",
}: {
  src?: string;
  name: string;
  className?: string;
  textClassName?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src && failedSrc !== src);

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src ?? null)}
        className={cn(
          "shrink-0 rounded-full border-2 border-primary/50 bg-[#161616] object-cover shadow-md",
          className,
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-2 border-primary/50 bg-gradient-to-br from-[#ff5500] via-[#ff7722] to-[#ffaa33] font-bold text-[#1a0900] shadow-md",
        textClassName,
        className,
      )}
    >
      {name.slice(0, 1)}
    </span>
  );
}
