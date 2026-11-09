import { cn } from "@/lib/utils";

export function waveHeights(seed: number, count: number) {
  const heights: number[] = [];
  let value = seed + 17;

  for (let index = 0; index < count; index += 1) {
    value = (value * 16807 + index * 13) % 2147483647;
    const noise = (value % 1000) / 1000;
    const shape = 0.18 + Math.abs(Math.sin(index * 0.33 + seed)) * 0.62 + noise * 0.2;
    heights.push(Math.round(Math.min(1, Math.max(0.12, shape)) * 100));
  }

  return heights;
}

type ScWaveformProps = {
  seed: number;
  progress: number;
  bars?: number;
  className?: string;
  label?: string;
  onScrub?: (progress: number) => void;
};

export function ScWaveform({
  seed,
  progress,
  bars = 84,
  className,
  label,
  onScrub,
}: ScWaveformProps) {
  const heights = waveHeights(seed, bars);
  const played = Math.min(100, Math.max(0, progress));

  function scrub(clientX: number, element: HTMLDivElement) {
    if (!onScrub) return;
    const rect = element.getBoundingClientRect();
    const ratio = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
    onScrub(Math.min(100, Math.max(0, ratio * 100)));
  }

  return (
    <div
      className={cn("flex h-16 items-center gap-px", onScrub && "cursor-pointer", className)}
      role={onScrub ? "slider" : undefined}
      aria-hidden={onScrub ? undefined : true}
      aria-label={onScrub ? label : undefined}
      aria-valuemin={onScrub ? 0 : undefined}
      aria-valuemax={onScrub ? 100 : undefined}
      aria-valuenow={onScrub ? Math.round(played) : undefined}
      tabIndex={onScrub ? 0 : undefined}
      onPointerDown={onScrub ? (event) => scrub(event.clientX, event.currentTarget) : undefined}
      onPointerMove={
        onScrub
          ? (event) => {
              if (event.buttons === 1) scrub(event.clientX, event.currentTarget);
            }
          : undefined
      }
      onKeyDown={
        onScrub
          ? (event) => {
              if (event.key === "ArrowRight") onScrub(Math.min(100, played + 5));
              if (event.key === "ArrowLeft") onScrub(Math.max(0, played - 5));
            }
          : undefined
      }
    >
      {heights.map((height, index) => {
        const active = ((index + 0.5) / heights.length) * 100 <= played;
        return (
          <span
            key={index}
            className={cn("w-[3px] shrink-0 rounded-[1px]", active ? "bg-primary" : "bg-white/20")}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
}
