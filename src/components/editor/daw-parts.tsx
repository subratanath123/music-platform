"use client";

import { memo, type PointerEvent as ReactPointerEvent, useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { type Clip, clipLength, PEAKS_PER_SECOND, type Track } from "./daw-engine";

export const HEADER_W = 236;
export const LANE_H = 108;
export const RULER_H = 34;
const CLIP_PAD = 6;
const MAX_CANVAS = 8000;

export type ClipDragKind = "move" | "trimL" | "trimR" | "fadeIn" | "fadeOut";

export function formatTime(seconds: number) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${String(m).padStart(2, "0")}:${rest.toFixed(3).padStart(6, "0")}`;
}

export function formatBars(seconds: number, bpm: number) {
  const beat = 60 / bpm;
  const beats = Math.floor(Math.max(0, seconds) / beat + 1e-6);
  return `${Math.floor(beats / 4) + 1}.${(beats % 4) + 1}`;
}

export const ClipView = memo(function ClipView({
  clip,
  color,
  pps,
  peaks,
  selected,
  onPointerDown,
}: {
  clip: Clip;
  color: string;
  pps: number;
  peaks: Float32Array | undefined;
  selected: boolean;
  onPointerDown: (e: ReactPointerEvent, kind: ClipDragKind) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const length = clipLength(clip);
  const width = Math.max(4, length * pps);
  const height = LANE_H - CLIP_PAD * 2;
  const waveH = height - 18;
  const fadeInPx = Math.min(width, clip.fadeIn * pps);
  const fadeOutPx = Math.min(width, clip.fadeOut * pps);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = Math.max(1, Math.floor(Math.min(width, MAX_CANVAS)));
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(waveH * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, waveH);
    ctx.fillStyle = color;
    const mid = waveH / 2;
    for (let x = 0; x < w; x += 1) {
      const t0 = clip.start + (x / w) * length;
      const t1 = clip.start + ((x + 1) / w) * length;
      const b0 = Math.floor(t0 * PEAKS_PER_SECOND);
      const b1 = Math.max(b0 + 1, Math.ceil(t1 * PEAKS_PER_SECOND));
      let m = 0;
      for (let b = b0; b < b1 && b < peaks.length; b += 1) if (peaks[b] > m) m = peaks[b];
      const bar = Math.max(1, Math.min(1, m * clip.gain) * waveH * 0.95);
      ctx.fillRect(x, mid - bar / 2, 1, bar);
    }
  }, [peaks, clip.start, clip.gain, length, width, waveH, color]);

  return (
    <div
      className={`absolute overflow-hidden rounded-xl border select-none ${selected ? "border-white shadow-[0_0_0_1px_white]" : "border-white/15"}`}
      style={{
        left: clip.offset * pps,
        top: CLIP_PAD,
        width,
        height,
        background: `color-mix(in srgb, ${color} 18%, #0b0b0b)`,
      }}
    >
      <div
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => onPointerDown(e, "move")}
      >
        <div
          className="truncate px-2.5 py-0.5 text-[11px] font-medium text-white/90"
          style={{ background: `color-mix(in srgb, ${color} 45%, transparent)` }}
        >
          {clip.name}
        </div>
        <canvas ref={canvasRef} className="block w-full" style={{ height: waveH }} />
        <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
          {fadeInPx > 0 ? (
            <>
              <polygon points={`0,0 ${fadeInPx},0 0,${height}`} fill="rgba(0,0,0,0.5)" />
              <line x1={0} y1={height} x2={fadeInPx} y2={0} stroke="white" strokeOpacity={0.6} />
            </>
          ) : null}
          {fadeOutPx > 0 ? (
            <>
              <polygon points={`${width - fadeOutPx},0 ${width},0 ${width},${height}`} fill="rgba(0,0,0,0.5)" />
              <line x1={width - fadeOutPx} y1={0} x2={width} y2={height} stroke="white" strokeOpacity={0.6} />
            </>
          ) : null}
        </svg>
      </div>
      <div
        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-white/30"
        onPointerDown={(e) => onPointerDown(e, "trimL")}
        title="Trim start"
      />
      <div
        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-white/30"
        onPointerDown={(e) => onPointerDown(e, "trimR")}
        title="Trim end"
      />
      <div
        className="absolute top-0 size-3 -translate-x-1/2 cursor-ew-resize rounded-b-sm bg-white/80"
        style={{ left: Math.max(6, fadeInPx) }}
        onPointerDown={(e) => onPointerDown(e, "fadeIn")}
        title="Fade in"
      />
      <div
        className="absolute top-0 size-3 translate-x-1/2 cursor-ew-resize rounded-b-sm bg-white/80"
        style={{ right: Math.max(6, fadeOutPx) }}
        onPointerDown={(e) => onPointerDown(e, "fadeOut")}
        title="Fade out"
      />
    </div>
  );
});

export function TrackHeader({
  track,
  index,
  labels,
  onChange,
  onDelete,
  onImport,
}: {
  track: Track;
  index: number;
  labels: { mute: string; solo: string; volume: string; pan: string; importToTrack: string; deleteTrack: string };
  onChange: (patch: Partial<Track>) => void;
  onDelete: () => void;
  onImport: (files: FileList) => void;
}) {
  const db = track.volume > 0 ? 20 * Math.log10(track.volume) : -Infinity;
  const panLabel =
    Math.abs(track.pan) < 0.02 ? "C" : track.pan < 0 ? `L${Math.round(-track.pan * 100)}` : `R${Math.round(track.pan * 100)}`;

  return (
    <div
      className="sticky left-0 z-20 flex shrink-0 flex-col justify-between border-r border-b border-white/10 bg-[#151515] px-3 py-2"
      style={{ width: HEADER_W, height: LANE_H }}
    >
      <div className="flex items-center gap-2">
        <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: track.color }} />
        <input
          value={track.name}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-label={`Track ${index + 1} name`}
          className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1 text-sm font-semibold outline-none focus:bg-black/60"
        />
        <button
          type="button"
          aria-pressed={track.muted}
          title={labels.mute}
          onClick={() => onChange({ muted: !track.muted })}
          className={`grid size-7 place-items-center rounded-md text-xs font-bold ${track.muted ? "bg-amber-400 text-black" : "bg-white/10 text-muted-foreground hover:text-foreground"}`}
        >
          M
        </button>
        <button
          type="button"
          aria-pressed={track.solo}
          title={labels.solo}
          onClick={() => onChange({ solo: !track.solo })}
          className={`grid size-7 place-items-center rounded-md text-xs font-bold ${track.solo ? "bg-emerald-400 text-black" : "bg-white/10 text-muted-foreground hover:text-foreground"}`}
        >
          S
        </button>
      </div>
      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="w-7">{labels.volume.slice(0, 3)}</span>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.01}
          value={track.volume}
          onChange={(e) => onChange({ volume: Number(e.target.value) })}
          onDoubleClick={() => onChange({ volume: 1 })}
          aria-label={labels.volume}
          className="min-w-0 flex-1 accent-primary"
        />
        <span className="w-12 text-right tabular-nums">{Number.isFinite(db) ? `${db.toFixed(1)}dB` : "-∞"}</span>
      </label>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="w-7">{labels.pan}</span>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={track.pan}
          onChange={(e) => onChange({ pan: Number(e.target.value) })}
          onDoubleClick={() => onChange({ pan: 0 })}
          aria-label={labels.pan}
          className="min-w-0 flex-1 accent-primary"
        />
        <span className="w-8 text-right tabular-nums">{panLabel}</span>
        <label
          title={labels.importToTrack}
          className="grid size-6 cursor-pointer place-items-center rounded-md bg-white/10 hover:bg-white/20"
        >
          <Plus className="size-3.5" />
          <input
            type="file"
            multiple
            accept="audio/*,.mp3,.wav,.m4a,.ogg"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) onImport(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          title={labels.deleteTrack}
          onClick={onDelete}
          className="grid size-6 place-items-center rounded-md bg-white/10 hover:bg-destructive/60"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function Ruler({
  width,
  pps,
  loop,
  onPointerDown,
}: {
  width: number;
  pps: number;
  loop: { start: number; end: number; on: boolean };
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * pps >= 70) ?? 120;
  const ticks: number[] = [];
  for (let s = 0; s * pps <= width; s += step) ticks.push(s);

  return (
    <div
      className="relative cursor-text border-b border-white/10 bg-[#121212]"
      style={{ width, height: RULER_H }}
      onPointerDown={onPointerDown}
    >
      {loop.end > loop.start ? (
        <div
          className={`absolute inset-y-0 ${loop.on ? "bg-primary/30" : "bg-white/10"}`}
          style={{ left: loop.start * pps, width: (loop.end - loop.start) * pps }}
        />
      ) : null}
      {ticks.map((s) => (
        <div key={s} className="absolute top-0 h-full border-l border-white/20" style={{ left: s * pps }}>
          <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">
            {s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : `${s}s`}
          </span>
        </div>
      ))}
    </div>
  );
}
