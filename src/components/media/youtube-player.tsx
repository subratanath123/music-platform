"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";

type YoutubePlayerProps = {
  videoId: string;
  title: string;
};

export function YoutubePlayer({ videoId, title }: YoutubePlayerProps) {
  const [started, setStarted] = useState(false);

  if (started) {
    return (
      <iframe
        className="aspect-video w-full rounded-2xl bg-black"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setStarted(true)}
      className="relative block aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black"
    >
      <Image
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt=""
        fill
        sizes="(max-width: 1024px) 100vw, 960px"
        className="object-cover"
      />
      <span className="absolute inset-0 grid place-items-center bg-black/20">
        <span className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-[#ff5500] via-[#ff7722] to-[#ffaa33] text-[#1a0900] shadow-xl shadow-[#ff5500]/30 transition-transform hover:scale-105">
          <Play className="size-7 fill-current" aria-hidden />
        </span>
      </span>
      <span className="sr-only">{title}</span>
    </button>
  );
}
