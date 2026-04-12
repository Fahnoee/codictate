"use client";

import { InstantTooltip } from "../Common/InstantTooltip";
import { TRANSCRIPTION_LANGUAGE_HINT } from "../../../shared/transcription-languages";

export function TranscriptionLanguageHintButton({
  className = "",
  tooltipSide = "top",
}: {
  className?: string;
  tooltipSide?: "top" | "bottom";
}) {
  return (
    <InstantTooltip
      text={TRANSCRIPTION_LANGUAGE_HINT}
      side={tooltipSide}
      floatInViewport
    >
      <button
        type="button"
        className={`inline-flex aspect-square w-10 shrink-0 self-stretch items-center justify-center rounded-lg border border-white/12 bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] text-white/42 hover:text-white/58 hover:border-white/18 hover:bg-white/7 focus-visible:border-white/26 focus-visible:ring-2 focus-visible:ring-white/12 focus-visible:ring-offset-0 transition-[border-color,background-color,box-shadow] duration-200 cursor-pointer ${className}`}
        aria-label={TRANSCRIPTION_LANGUAGE_HINT}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>
    </InstantTooltip>
  );
}
