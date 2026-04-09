"use client";

import { TRANSCRIPTION_LANGUAGE_OPTIONS } from "../../../shared/transcription-languages";

const selectClass =
  "w-full appearance-none rounded-lg border font-medium text-white/78 outline-none " +
  "border-white/12 bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] " +
  "hover:border-white/18 hover:bg-white/7 " +
  "focus-visible:border-white/26 focus-visible:ring-2 focus-visible:ring-white/12 focus-visible:ring-offset-0 " +
  "cursor-pointer transition-[border-color,background-color,box-shadow] duration-200 " +
  "[color-scheme:dark]";

const sizeDefault = "pl-4 pr-11 py-3.5 text-[21px] leading-snug";

/** Ready bar: match compact LanguagePicker padding + type size on translate / icon buttons. */
export const READY_BAR_PY_CLASS = "py-1";
export const READY_BAR_TEXT_CLASS = "text-[21px] font-medium leading-snug";
/** Native select: extra right space for custom chevron. */
const sizeCompact = `${READY_BAR_PY_CLASS} pl-3.5 pr-10 ${READY_BAR_TEXT_CLASS}`;

export function LanguagePicker({
  value,
  onChange,
  className,
  compact = false,
  allowEmpty = false,
  excludeAuto = false,
  /** Disabled first row (e.g. “pick a language”) — value must match when nothing chosen yet. */
  leadingDisabledOption,
  ariaLabel = "Transcription language",
}: {
  value: string;
  onChange: (transcriptionLanguageId: string) => void;
  /** Merged after defaults; extra classes (e.g. pointer-events-none). */
  className?: string;
  /** Shorter control for tight toolbars (Ready screen). */
  compact?: boolean;
  /** Show a leading empty option (value ""). */
  allowEmpty?: boolean;
  /** Omit the auto-detect option from the list. */
  excludeAuto?: boolean;
  leadingDisabledOption?: { value: string; label: string };
  ariaLabel?: string;
}) {
  const options = TRANSCRIPTION_LANGUAGE_OPTIONS.filter(
    (o) => !(excludeAuto && o.id === "auto"),
  );

  const sizeClass = compact ? sizeCompact : sizeDefault;

  return (
    <div className="relative group">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${selectClass} w-full ${sizeClass} ${className ?? ""}`}
        aria-label={ariaLabel}
      >
        {leadingDisabledOption && (
          <option
            value={leadingDisabledOption.value}
            disabled
            className="bg-zinc-900 text-white/45"
          >
            {leadingDisabledOption.label}
          </option>
        )}
        {allowEmpty && (
          <option value="" className="bg-zinc-900 text-white/50">
            — Auto-detect —
          </option>
        )}
        {options.map((o) => (
          <option key={o.id} value={o.id} className="bg-zinc-900 text-white">
            {o.label}
          </option>
        ))}
      </select>
      <span
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-white/38 transition-colors duration-200 group-hover:text-white/50 ${compact ? "right-3" : "right-3.5"}`}
        aria-hidden
      >
        <svg
          className="size-[18px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </div>
  );
}
