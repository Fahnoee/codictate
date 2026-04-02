"use client";

import { TRANSCRIPTION_LANGUAGE_OPTIONS } from "../../../shared/transcription-languages";

const baseClass =
  "w-full rounded-xl border border-white/11 bg-white/4 font-medium text-white/72 outline-none " +
  "focus:border-white/22 cursor-pointer transition-colors duration-200 " +
  "[color-scheme:dark]";

export function LanguagePicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (transcriptionLanguageId: string) => void;
  /** Merged after defaults; use for e.g. compact padding on Ready. */
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${baseClass} w-full px-4 py-3 text-[21px] ${className ?? ""}`}
      aria-label="Transcription language"
    >
      {TRANSCRIPTION_LANGUAGE_OPTIONS.map((o) => (
        <option key={o.id} value={o.id} className="bg-zinc-900 text-white">
          {o.label}
        </option>
      ))}
    </select>
  );
}
