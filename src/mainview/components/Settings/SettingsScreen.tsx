"use client";

import { useCallback } from "react";
import { motion } from "motion/react";
import type { AppSettings, ShortcutId } from "../../../shared/types";
import { setShortcut } from "../../rpc";
import { ShortcutPicker } from "./ShortcutPicker";

export function SettingsScreen({
  settings,
  onBack,
}: {
  settings: AppSettings;
  onBack: () => void;
}) {
  const handleShortcutChange = useCallback(
    async (id: ShortcutId) => {
      await setShortcut(id);
    },
    []
  );

  const durationLabel =
    settings.maxRecordingDuration >= 60
      ? `${Math.floor(settings.maxRecordingDuration / 60)} minute${settings.maxRecordingDuration >= 120 ? "s" : ""}`
      : `${settings.maxRecordingDuration} seconds`;

  return (
    <div className="flex flex-col items-center min-h-screen bg-[#070810] text-white select-none px-6 py-10">
      <div className="w-full max-w-[380px]">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-3 mb-8"
        >
          <button
            onClick={onBack}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/8 hover:border-white/15 bg-white/3 hover:bg-white/5 transition-colors duration-200 cursor-pointer"
            aria-label="Back"
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
              className="text-white/35"
            >
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-[15px] font-semibold tracking-tight text-white/70">
            Settings
          </h1>
        </motion.div>

        {/* Activation Shortcut */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8"
        >
          <h2 className="text-[10px] text-white/25 font-medium uppercase tracking-wider mb-3">
            Activation Shortcut
          </h2>
          <ShortcutPicker
            value={settings.shortcutId}
            onChange={handleShortcutChange}
          />
          <p className="mt-2.5 text-[10px] text-white/15 leading-relaxed">
            The keyboard shortcut used to start and stop dictation.
            Changing it takes effect immediately.
          </p>
        </motion.div>

        {/* Recording Limit */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="text-[10px] text-white/25 font-medium uppercase tracking-wider mb-3">
            Recording Limit
          </h2>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/6 bg-white/2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white/20 shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-[13px] text-white/50 font-medium">
              {durationLabel}
            </span>
            <span className="text-[10px] text-white/15 ml-auto">
              auto-stop
            </span>
          </div>
          <p className="mt-2.5 text-[10px] text-white/15 leading-relaxed">
            Recording will automatically stop after {durationLabel} to
            keep transcription fast and accurate.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
