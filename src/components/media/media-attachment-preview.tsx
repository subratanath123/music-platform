"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  FileAudio,
  Film,
  Pause,
  Play,
  Scissors,
  Volume2,
  X,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { ChatMessage, MediaAttachmentKind } from "@/lib/db-types";

const INLINE_MEDIA_REGEX =
  /(?:https?:\/\/[^\s]+)?(\/(?:uploads|media)\/[\w.-]+\.(?:wav|mp3|ogg|m4a|aac|flac|webm|mp4|mov|m4v|mkv))/i;

export function extractMediaFromMessage(msg: ChatMessage): {
  url?: string;
  kind?: MediaAttachmentKind;
  name?: string;
  cleanText: string;
} {
  if (msg.attachmentUrl) {
    return {
      url: msg.attachmentUrl,
      kind: msg.attachmentKind,
      name: msg.attachmentName,
      cleanText: msg.text,
    };
  }

  const match = INLINE_MEDIA_REGEX.exec(msg.text);
  if (!match) {
    return { cleanText: msg.text };
  }

  const url = match[1];
  const isVideo = /\.(mp4|webm|mov|m4v|mkv)$/i.test(url) && !url.includes("/audio-");
  const stripped = msg.text
    .replace(match[0], "")
    .replace(/🎧\s*Mix:\s*$/i, "🎧 Sent a multitrack mix")
    .trim();

  return {
    url,
    kind: isVideo ? "video" : "audio",
    name: msg.text.includes("Mix") ? "SurShongi Mix" : url.split("/").pop(),
    cleanText: stripped || "🎧 Sent a multitrack mix",
  };
}

function formatSeconds(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function MediaAttachmentPreview({
  url,
  kind,
  name,
  dark = true,
  onOpenInChatPlayer,
}: {
  url: string;
  kind?: MediaAttachmentKind;
  name?: string;
  dark?: boolean;
  onOpenInChatPlayer?: (item: {
    url: string;
    kind: MediaAttachmentKind;
    name: string;
  }) => void;
}) {
  const isVideo =
    kind === "video" ||
    (/\.(mp4|mov|m4v|mkv)$/i.test(url) && !url.includes("/audio-")) ||
    url.includes("/video-");
  const resolvedKind: MediaAttachmentKind = isVideo ? "video" : "audio";
  const displayName = name || url.split("/").pop() || (isVideo ? "Video" : "Audio Mix");

  const [playerOpen, setPlayerOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function handleTogglePlay() {
    if (onOpenInChatPlayer) {
      onOpenInChatPlayer({ url, kind: resolvedKind, name: displayName });
    }
    if (!playerOpen) {
      setPlayerOpen(true);
      if (!onOpenInChatPlayer) {
        setTimeout(() => {
          void audioRef.current?.play().catch(() => {});
        }, 40);
      }
      return;
    }
    if (onOpenInChatPlayer) return;
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }

  return (
    <div
      className={
        dark
          ? "mt-2 overflow-hidden rounded-2xl border border-white/15 bg-[#141414] p-3 text-xs text-foreground shadow-md"
          : "mt-2 overflow-hidden rounded-2xl border border-black/25 bg-[#141414] p-3 text-xs text-white shadow-md"
      }
    >
      {/* Clickable Header / Trigger to Open Player Inside Chat */}
      <div className="flex items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={handleTogglePlay}
          className="group flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] text-[#1a0900] shadow-sm transition-transform group-hover:scale-105">
            {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-semibold text-white">
              {isVideo ? (
                <Film className="size-3.5 shrink-0 text-primary" />
              ) : (
                <FileAudio className="size-3.5 shrink-0 text-primary" />
              )}
              <span className="truncate">{displayName}</span>
            </span>
            <span className="mt-0.5 block text-[11px] text-neutral-400">
              {onOpenInChatPlayer
                ? "Click to open player inside chatbox"
                : playerOpen
                  ? playing
                    ? `Playing · ${formatSeconds(currentTime)} / ${formatSeconds(duration)}`
                    : `Paused · ${formatSeconds(currentTime)} / ${formatSeconds(duration)}`
                  : "Click to open player & listen"}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          {!isVideo && (url.startsWith("/uploads/") || url.startsWith("/media/")) ? (
            <Link
              href={`/editor?src=${encodeURIComponent(url)}`}
              className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white hover:border-primary hover:bg-white/10"
              title="Open in Multitrack Studio"
            >
              <Scissors className="size-3 text-primary" />
              <span>Cut</span>
            </Link>
          ) : null}
          <a
            href={url}
            download={displayName}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/20"
            title="Download file"
          >
            <Download className="size-3" />
          </a>
        </div>
      </div>

      {/* Expanded Inline Player when used outside ChatBox (e.g. ProfileScreen) */}
      {playerOpen && !onOpenInChatPlayer ? (
        <div className="mt-2.5 border-t border-white/10 pt-2.5">
          {isVideo ? (
            <video
              controls
              autoPlay
              preload="metadata"
              src={url}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
              className="max-h-56 w-full rounded-xl bg-black"
            />
          ) : (
            <div className="space-y-2">
              <audio
                ref={audioRef}
                src={url}
                preload="metadata"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
              />
              <div className="flex items-center gap-2.5">
                <input
                  type="range"
                  min={0}
                  max={duration > 0 ? duration : 1}
                  step={0.05}
                  value={Math.min(currentTime, duration || 1)}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setCurrentTime(next);
                    if (audioRef.current) audioRef.current.currentTime = next;
                  }}
                  aria-label="Seek audio"
                  className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#ff5500]"
                />
                <span className="shrink-0 font-mono text-[11px] text-neutral-300">
                  {formatSeconds(currentTime)} / {formatSeconds(duration)}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Docked Inside-Chatbox Audio/Video Player Bar shown inside the chat window when opened */
export function ChatboxDockedPlayer({
  item,
  onClose,
}: {
  item: { url: string; kind: MediaAttachmentKind; name: string };
  onClose: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    void el.play().catch(() => {});
  }, [item.url]);

  return (
    <div className="border-b border-primary/40 bg-gradient-to-r from-[#22150e] via-[#191919] to-[#13221f] px-4 py-3 text-xs shadow-inner">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Volume2 className="size-4 shrink-0 text-primary" />
          <span className="truncate font-semibold text-foreground">{item.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {item.kind === "audio" &&
          (item.url.startsWith("/uploads/") || item.url.startsWith("/media/")) ? (
            <Link
              href={`/editor?src=${encodeURIComponent(item.url)}`}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-black"
            >
              <Scissors className="size-3" />
              <span>Open in Studio</span>
            </Link>
          ) : null}
          <a
            href={item.url}
            download={item.name}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-foreground hover:bg-white/20"
          >
            <Download className="size-3" />
            <span>Download</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
            aria-label="Close player"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {item.kind === "video" ? (
        <video
          controls
          autoPlay
          src={item.url}
          className="mt-2 max-h-48 w-full rounded-xl bg-black"
        />
      ) : (
        <div className="mt-2.5 flex items-center gap-2.5">
          <audio
            ref={audioRef}
            src={item.url}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          />
          <button
            type="button"
            onClick={() => {
              const el = audioRef.current;
              if (!el) return;
              if (el.paused) void el.play().catch(() => {});
              else el.pause();
            }}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] text-[#1a0900] shadow-sm"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
          </button>
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 1}
            step={0.05}
            value={Math.min(currentTime, duration || 1)}
            onChange={(e) => {
              const next = Number(e.target.value);
              setCurrentTime(next);
              if (audioRef.current) audioRef.current.currentTime = next;
            }}
            aria-label="Seek audio"
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#ff5500]"
          />
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {formatSeconds(currentTime)} / {formatSeconds(duration)}
          </span>
        </div>
      )}
    </div>
  );
}
