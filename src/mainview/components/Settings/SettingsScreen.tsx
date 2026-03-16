"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import type {
  AppSettings,
  ShortcutId,
  UpdateCheckState,
} from "../../../shared/types";
import {
  setShortcut,
  setAudioDevice,
  fetchDevices,
  triggerUpdateCheck,
  triggerApplyUpdate,
} from "../../rpc";
import { appEvents } from "../../app-events";
import { ShortcutPicker } from "./ShortcutPicker";
import { DevicePicker } from "./DevicePicker";

function updateStateLabel(state: UpdateCheckState, message?: string): string {
  switch (state) {
    case "idle":
      return "Check for updates";
    case "checking":
      return "Checking for updates…";
    case "downloading":
      return "Downloading update…";
    case "up-to-date":
      return message ?? "You're up to date";
    case "ready":
      return "Update ready — restart to apply";
    case "error":
      return "Update check failed";
  }
}

function updateStateTextClass(state: UpdateCheckState): string {
  switch (state) {
    case "up-to-date":
      return "text-emerald-400/70";
    case "ready":
      return "text-blue-400/80";
    case "error":
      return "text-orange-400/70";
    default:
      return "text-white/40";
  }
}

function UpdateIcon({ state }: { state: UpdateCheckState }) {
  if (state === "checking" || state === "downloading") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-white/30 animate-spin"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    );
  }
  if (state === "up-to-date") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-emerald-400/70"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (state === "ready") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-blue-400/80"
      >
        <path d="M12 2v10m0 0 3-3m-3 3-3-3" />
        <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
      </svg>
    );
  }
  if (state === "error") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-orange-400/70"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    );
  }
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white/15"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function UpdateAction({
  state,
  onCheck,
  onRestart,
}: {
  state: UpdateCheckState;
  onCheck: () => void;
  onRestart: () => void;
}) {
  if (state === "checking" || state === "downloading") {
    return null;
  }
  if (state === "ready") {
    return (
      <button
        onClick={onRestart}
        className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/20 hover:border-blue-400/35 text-blue-300/90 transition-colors duration-200 cursor-pointer"
      >
        Restart
      </button>
    );
  }
  if (state === "error") {
    return (
      <button
        onClick={onCheck}
        className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-white/8 hover:border-white/15 bg-white/3 hover:bg-white/5 text-white/35 hover:text-white/55 transition-colors duration-200 cursor-pointer"
      >
        Retry
      </button>
    );
  }
  if (state === "up-to-date") {
    return null;
  }
  return (
    <button
      onClick={onCheck}
      className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-white/8 hover:border-white/15 bg-white/3 hover:bg-white/5 text-white/35 hover:text-white/55 transition-colors duration-200 cursor-pointer"
    >
      Check
    </button>
  );
}

export function SettingsScreen({
  settings,
  onBack,
}: {
  settings: AppSettings;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: deviceInfo } = useQuery({
    queryKey: ["devices"],
    queryFn: fetchDevices,
  });

  const [updateState, setUpdateState] = useState<UpdateCheckState>("idle");
  const [updateMessage, setUpdateMessage] = useState<string | undefined>();

  useEffect(() => {
    return appEvents.on("updateCheckStatus", ({ state, message }) => {
      setUpdateState(state);
      setUpdateMessage(message);
      if (state === "up-to-date") {
        setTimeout(() => setUpdateState("idle"), 4000);
      }
    });
  }, []);

  const handleCheckForUpdates = useCallback(() => {
    setUpdateState("checking");
    triggerUpdateCheck();
  }, []);

  const handleApplyUpdate = useCallback(() => {
    triggerApplyUpdate();
  }, []);

  const handleShortcutChange = useCallback(async (id: ShortcutId) => {
    await setShortcut(id);
  }, []);

  const handleDeviceChange = useCallback(
    async (index: number) => {
      if (!deviceInfo) return;
      queryClient.setQueryData(["devices"], {
        ...deviceInfo,
        selectedDevice: index,
      });
      await setAudioDevice(index);
    },
    [deviceInfo, queryClient],
  );

  const durationLabel =
    settings.maxRecordingDuration >= 60
      ? `${Math.floor(settings.maxRecordingDuration / 60)} minute${settings.maxRecordingDuration >= 120 ? "s" : ""}`
      : `${settings.maxRecordingDuration} seconds`;

  return (
    <div className="flex flex-col items-center min-h-screen bg-[#070810] text-white select-none px-6 py-10">
      <div className="electrobun-webkit-app-region-drag absolute top-0 left-0 right-0 h-7 hover:bg-white/3 transition-colors duration-200" />
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
            The keyboard shortcut used to start and stop dictation. Changing it
            takes effect immediately.
          </p>
        </motion.div>

        {/* Input Device */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8"
        >
          <h2 className="text-[10px] text-white/25 font-medium uppercase tracking-wider mb-3">
            Input Device
          </h2>
          <DevicePicker
            devices={deviceInfo?.devices ?? {}}
            selectedDevice={deviceInfo?.selectedDevice ?? 0}
            onChange={handleDeviceChange}
          />
          <p className="mt-2.5 text-[10px] text-white/15 leading-relaxed">
            The microphone used for dictation. Updates automatically when
            devices are connected or disconnected.
          </p>
        </motion.div>

        {/* Recording Limit */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8"
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
            <span className="text-[10px] text-white/15 ml-auto">auto-stop</span>
          </div>
          <p className="mt-2.5 text-[10px] text-white/15 leading-relaxed">
            Recording will automatically stop after {durationLabel} to keep
            transcription fast and accurate.
          </p>
        </motion.div>

        {/* Updates */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="text-[10px] text-white/25 font-medium uppercase tracking-wider mb-3">
            Updates
          </h2>
          <div className="rounded-xl border border-white/6 bg-white/2 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5">
              {/* Status icon */}
              <div className="shrink-0 w-4 h-4 flex items-center justify-center">
                <UpdateIcon state={updateState} />
              </div>

              {/* Status text */}
              <div className="flex-1 min-w-0">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={updateState}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    className={`block text-[13px] font-medium ${updateStateTextClass(updateState)}`}
                  >
                    {updateStateLabel(updateState, updateMessage)}
                  </motion.span>
                </AnimatePresence>
              </div>

              {/* Action */}
              <UpdateAction
                state={updateState}
                onCheck={handleCheckForUpdates}
                onRestart={handleApplyUpdate}
              />
            </div>

            {/* Error detail bar */}
            <AnimatePresence>
              {updateState === "error" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-white/5 px-4 py-2.5"
                >
                  <p className="text-[10px] text-orange-400/60 leading-relaxed">
                    {updateMessage ??
                      "Something went wrong. Check your internet connection and try again."}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
