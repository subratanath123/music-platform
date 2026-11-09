import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-6", className)} aria-hidden="true">
      <rect x="3" y="13" width="2.4" height="6" rx="0.4" fill="currentColor" opacity="0.45" />
      <rect x="7.2" y="9" width="2.4" height="14" rx="0.4" fill="currentColor" />
      <rect x="11.4" y="6" width="2.4" height="20" rx="0.4" fill="currentColor" />
      <rect x="15.6" y="10" width="2.4" height="12" rx="0.4" fill="currentColor" />
      <rect x="19.8" y="7" width="2.4" height="18" rx="0.4" fill="currentColor" />
      <rect x="24" y="12" width="2.4" height="8" rx="0.4" fill="currentColor" opacity="0.7" />
      <rect x="28.2" y="14" width="2.4" height="4" rx="0.4" fill="currentColor" opacity="0.4" />
    </svg>
  );
}
