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
    <InstantTooltip text={TRANSCRIPTION_LANGUAGE_HINT} side={tooltipSide}>
      <button
        type="button"
        className={`inline-flex items-center justify-center rounded-md border border-white/14 bg-white/[0.03] p-1.5 text-white/42 hover:text-white/58 hover:border-white/22 hover:bg-white/[0.05] transition-colors duration-200 cursor-pointer shrink-0 ${className}`}
        aria-label={TRANSCRIPTION_LANGUAGE_HINT}
      >
        <svg
          width="14"
          height="14"
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
