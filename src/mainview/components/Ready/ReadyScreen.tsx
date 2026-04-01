"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { AppStatus, AppSettings, DeviceInfo } from "../../../shared/types";
import { Kbd } from "../Common/Kbd";
import { WordmarkCodictate } from "../Brand/WordmarkCodictate";
import { RecordingOrb } from "./RecordingOrb";

const SHORTCUT_DISPLAY: Record<string, string[]> = {
  "option-space": ["⌥", "Space"],
  "right-option": ["Right ⌥"],
  "option-f1": ["⌥", "F1"],
  "option-f2": ["⌥", "F2"],
  "option-enter": ["⌥", "Enter"],
};

export function ReadyScreen({
  status,
  deviceInfo,
  settings,
  onOpenSettings,
}: {
  status: AppStatus;
  deviceInfo?: DeviceInfo;
  settings?: AppSettings;
  onOpenSettings: () => void;
}) {
  const isRecording = status === "recording";
  const isTranscribing = status === "transcribing";
  const isIdle = status === "ready";

  const micName = deviceInfo
    ? (deviceInfo.devices[String(deviceInfo.selectedDevice)] ?? "Default")
    : null;

  const displayKeys = useMemo(
    () =>
      SHORTCUT_DISPLAY[settings?.shortcutId ?? "option-space"] ?? [
        "⌥",
        "Space",
      ],
    [settings?.shortcutId],
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-codictate-page text-white select-none">
      <div className="electrobun-webkit-app-region-drag absolute top-0 left-0 right-0 h-7 hover:bg-white/3 transition-colors duration-200" />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-7"
      >
        <RecordingOrb status={status} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center mb-10"
      >
        <WordmarkCodictate
          as="h1"
          className="text-[30px] font-semibold tracking-[-0.02em] text-white/90"
        />
        <AnimatePresence mode="wait">
          <motion.p
            key={status}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className={`text-[19px] mt-0.5 font-medium font-sans ${
              isRecording
                ? "text-red-400/85"
                : isTranscribing
                  ? "text-amber-400/78"
                  : "text-white/52"
            }`}
          >
            {isRecording
              ? "Listening…"
              : isTranscribing
                ? "Transcribing…"
                : "Ready"}
          </motion.p>
        </AnimatePresence>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: isIdle ? 1 : 0.2, y: 0 }}
        transition={{ delay: 0.18, duration: 0.35 }}
        className="flex flex-col items-center gap-5"
      >
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1.5">
            {displayKeys.map((key, i) => (
              <span key={key} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span className="text-white/42 text-[18px] font-light">
                    +
                  </span>
                )}
                <Kbd>{key}</Kbd>
              </span>
            ))}
          </div>
          <span className="text-[18px] text-white/50 font-sans">
            Start / stop recording
          </span>
        </div>

        <div className="w-px h-3 bg-white/14" />

        <div className="flex flex-col items-center gap-2">
          <Kbd>Esc</Kbd>
          <span className="text-[18px] text-white/50 font-sans">Cancel</span>
        </div>
      </motion.div>

      {/* Gear icon — opens settings */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.3 }}
        onClick={onOpenSettings}
        className="absolute bottom-7 right-7 p-2 rounded-lg border border-white/12 hover:border-white/22 bg-white/4 hover:bg-white/7 transition-colors duration-200 cursor-pointer"
        aria-label="Settings"
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
          className="text-white/48"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </motion.button>

      <AnimatePresence>
        {micName && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ delay: 0.3, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-7 flex items-center gap-1.5"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              className="text-white/45 shrink-0"
              fill="currentColor"
            >
              <rect x="3" y="0" width="4" height="6" rx="2" />
              <path
                d="M1.5 5.5a3.5 3.5 0 0 0 7 0"
                stroke="currentColor"
                strokeWidth="1"
                fill="none"
                strokeLinecap="round"
              />
              <line
                x1="5"
                y1="9"
                x2="5"
                y2="8.5"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-[18px] text-white/50 font-sans max-w-[240px] truncate">
              {micName}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
