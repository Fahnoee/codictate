"use client";

import type { ReactNode } from "react";

/**
 * Hover/focus tooltip without the ~1–2s delay of native `title` (especially on macOS).
 */
export function InstantTooltip({
  text,
  children,
  className,
  side = "top",
}: {
  text: string;
  children: ReactNode;
  className?: string;
  /** `top`: bubble above anchor. `bottom`: bubble below. */
  side?: "top" | "bottom";
}) {
  const positionClass =
    side === "top"
      ? "bottom-full left-1/2 mb-1.5 -translate-x-1/2"
      : "top-full left-1/2 mt-1.5 -translate-x-1/2";

  return (
    <span
      className={`group relative inline-flex max-w-full ${className ?? ""}`}
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${positionClass} z-60 w-[min(100vw-2rem,15rem)] whitespace-normal rounded-lg border border-white/14 bg-[#1c1c1f]/98 px-3 py-2 text-left text-[18px] leading-snug text-white/90 shadow-lg opacity-0 transition-none group-hover:opacity-100 group-focus-within:opacity-100`}
      >
        {text}
      </span>
    </span>
  );
}
