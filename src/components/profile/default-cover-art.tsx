const DEFAULT_COVERS = [
  "/covers/cover-studio.jpg",
  "/covers/cover-guitar.jpg",
  "/covers/cover-mic.jpg",
] as const;

export function getDefaultCoverUrl(seed = "surshongi", role?: string): string {
  if (role === "guitarist") return "/covers/cover-guitar.jpg";
  if (role === "vocalist" || role === "lyricist") return "/covers/cover-mic.jpg";
  if (role === "producer") return "/covers/cover-studio.jpg";
  const index =
    seed.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) %
    DEFAULT_COVERS.length;
  return DEFAULT_COVERS[index];
}

export function DefaultCoverArt({
  seed = "surshongi",
  role,
  positionY = 50,
}: {
  seed?: string;
  role?: string;
  compact?: boolean;
  positionY?: number;
}) {
  const src = getDefaultCoverUrl(seed, role);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#120d0a]" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover select-none"
        style={{ objectPosition: `center ${positionY}%` }}
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/25 to-transparent" />
    </div>
  );
}
