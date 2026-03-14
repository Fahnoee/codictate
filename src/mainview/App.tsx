import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { appEvents, type PermissionState } from "./app-events";
import { fetchPermissions, fetchDevices } from "./rpc";
import type { AppStatus, DeviceInfo, SettingsPane } from "../shared/types";

// ─── Shared motion variants ───────────────────────────────────────────────────

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.35, ease: EASE_OUT },
  }),
  exit: { opacity: 0, y: -6, transition: { duration: 0.2 } },
};

// ─── Permission Screen ────────────────────────────────────────────────────────

function PermissionRow({
  granted,
  label,
  description,
  pane,
  index,
  onOpen,
}: {
  granted: boolean;
  label: string;
  description: string;
  pane: SettingsPane;
  index: number;
  onOpen: (pane: SettingsPane) => void;
}) {
  return (
    <motion.div
      custom={index}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      layout
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors duration-300 ${
        granted ? "border-white/6 bg-white/3" : "border-white/10 bg-white/2"
      }`}
    >
      {/* Status dot */}
      <div className="shrink-0 w-5 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {granted ? (
            <motion.span
              key="check"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="block w-[7px] h-[7px] rounded-full bg-emerald-400"
            />
          ) : (
            <motion.span
              key="dot"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              className="block w-[7px] h-[7px] rounded-full bg-white/20"
            />
          )}
        </AnimatePresence>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-[13px] font-medium leading-none transition-colors duration-300 ${granted ? "text-white/60" : "text-white/80"}`}
          >
            {label}
          </span>
          {granted && (
            <motion.span
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[10px] text-emerald-400/60 font-medium"
            >
              granted
            </motion.span>
          )}
        </div>
        <p className="text-[11px] text-white/25 mt-0.5 leading-snug">
          {description}
        </p>
      </div>

      {/* Action */}
      <AnimatePresence>
        {!granted && (
          <motion.button
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            onClick={() => onOpen(pane)}
            className="shrink-0 text-[11px] text-white/35 hover:text-white/70 border border-white/8 hover:border-white/20 px-2.5 py-1 rounded-lg transition-colors duration-200 cursor-pointer"
          >
            Allow →
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PermissionScreen({
  permissions,
  onOpenSettings,
}: {
  permissions: PermissionState;
  onOpenSettings: (pane: SettingsPane) => void;
}) {
  const grantedCount = [
    permissions.inputMonitoring,
    permissions.microphone,
    permissions.accessibility,
    permissions.documents,
  ].filter(Boolean).length;

  const allGranted = grantedCount === 4;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#070810] text-white select-none px-6">
      <div className="w-full max-w-[340px]">
        {/* Logo area */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center mb-8"
        >
          {/* Waveform logo mark */}
          <div className="relative w-12 h-12 mb-4 flex items-end justify-center gap-[3px]">
            {[0.4, 0.65, 1, 0.8, 0.55, 0.75, 0.45].map((h, i) => (
              <div
                key={i}
                className="w-[3px] rounded-full bg-white/20"
                style={{ height: `${h * 100}%` }}
              />
            ))}
          </div>
          <h1 className="text-[15px] font-semibold tracking-tight text-white/80">
            Codictate
          </h1>
          <p className="text-[11px] text-white/25 mt-0.5">
            A few things before we start
          </p>
        </motion.div>

        {/* Progress bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="mb-4"
        >
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[10px] text-white/25 font-medium uppercase tracking-wider">
              Permissions
            </span>
            <span className="text-[10px] text-white/25">
              {grantedCount} / 4
            </span>
          </div>
          <div className="h-[2px] bg-white/6 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${allGranted ? "bg-emerald-400" : "bg-white/30"}`}
              initial={{ width: 0 }}
              animate={{ width: `${(grantedCount / 4) * 100}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </motion.div>

        {/* Permission rows */}
        <div className="flex flex-col gap-1.5">
          <PermissionRow
            granted={permissions.inputMonitoring}
            label="Input Monitoring"
            description="Detect the ⌥Space shortcut while the app is in background"
            pane="inputMonitoring"
            index={0}
            onOpen={onOpenSettings}
          />
          <PermissionRow
            granted={permissions.microphone}
            label="Microphone"
            description="Record your voice to transcribe into text"
            pane="microphone"
            index={1}
            onOpen={onOpenSettings}
          />
          <PermissionRow
            granted={permissions.accessibility}
            label="Accessibility"
            description="Simulate keystrokes to paste transcription into other apps"
            pane="accessibility"
            index={2}
            onOpen={onOpenSettings}
          />
          <PermissionRow
            granted={permissions.documents}
            label="Files & Folders"
            description="Save recordings and transcription history"
            pane="documents"
            index={3}
            onOpen={onOpenSettings}
          />
        </div>

        {/* Footer note */}
        <AnimatePresence>
          {!allGranted && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.5, duration: 0.3 }}
              className="mt-5 text-[10px] text-white/15 text-center leading-relaxed"
            >
              Updates live — return to this window after granting each
              permission.
              <br />
              Input Monitoring requires an app restart.
            </motion.p>
          )}
        </AnimatePresence>

        {/* All granted state */}
        <AnimatePresence>
          {allGranted && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-5 flex flex-col items-center gap-1"
            >
              <div className="text-[11px] text-emerald-400/70 font-medium">
                All set — ready to dictate
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Ready Screen ─────────────────────────────────────────────────────────────

function RecordingOrb({ status }: { status: AppStatus }) {
  const isRecording = status === "recording";
  const isTranscribing = status === "transcribing";

  return (
    <div className="relative flex items-center justify-center w-20 h-20">
      {/* Outer pulse ring — only while recording */}
      <AnimatePresence>
        {isRecording && (
          <motion.span
            key="pulse-ring"
            className="absolute inset-0 rounded-full border border-red-500/30"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1.35, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* Mid ring */}
      <AnimatePresence>
        {isRecording && (
          <motion.span
            key="mid-ring"
            className="absolute inset-0 rounded-full border border-red-500/20"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1.18, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: "easeOut",
              delay: 0.35,
            }}
          />
        )}
      </AnimatePresence>

      {/* Core orb */}
      <motion.div
        layout
        className={`relative z-10 w-14 h-14 rounded-full border flex items-center justify-center transition-colors duration-500 ${
          isRecording
            ? "border-red-500/25 bg-red-500/8"
            : isTranscribing
              ? "border-amber-400/20 bg-amber-400/5"
              : "border-white/8 bg-white/3"
        }`}
        animate={{
          scale: isRecording ? [1, 1.04, 1] : 1,
        }}
        transition={
          isRecording
            ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      >
        {isTranscribing ? (
          <motion.div
            className="flex items-end gap-[2px] h-4"
            initial="hidden"
            animate="visible"
          >
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="block w-[3px] rounded-full bg-amber-400/60"
                animate={{ scaleY: [0.3, 1, 0.3] }}
                transition={{
                  duration: 0.9,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }}
                style={{ height: "100%", transformOrigin: "bottom" }}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div
            className="flex items-end gap-[2px] h-4"
            animate={isRecording ? "active" : "idle"}
          >
            {[0.45, 0.75, 1, 0.7, 0.5].map((base, i) => (
              <motion.span
                key={i}
                className={`block w-[3px] rounded-full transition-colors duration-500 ${isRecording ? "bg-red-400/70" : "bg-white/15"}`}
                animate={
                  isRecording
                    ? {
                        scaleY: [base, base * 0.4 + 0.1, base + 0.2, base],
                      }
                    : { scaleY: base }
                }
                transition={
                  isRecording
                    ? {
                        duration: 0.6 + i * 0.07,
                        repeat: Infinity,
                        delay: i * 0.1,
                        ease: "easeInOut",
                      }
                    : { duration: 0.4 }
                }
                style={{ height: "100%", transformOrigin: "bottom" }}
              />
            ))}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

function ReadyScreen({
  status,
  deviceInfo,
}: {
  status: AppStatus;
  deviceInfo?: DeviceInfo;
}) {
  const isRecording = status === "recording";
  const isTranscribing = status === "transcribing";
  const isIdle = status === "ready";

  const micName = deviceInfo
    ? (deviceInfo.devices[String(deviceInfo.selectedDevice)] ?? "Default")
    : null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#070810] text-white select-none">
      {/* Orb */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-7"
      >
        <RecordingOrb status={status} />
      </motion.div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center mb-10"
      >
        <h1 className="text-[15px] font-semibold tracking-tight text-white/70">
          Codictate
        </h1>
        <AnimatePresence mode="wait">
          <motion.p
            key={status}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className={`text-[11px] mt-0.5 font-medium ${
              isRecording
                ? "text-red-400/70"
                : isTranscribing
                  ? "text-amber-400/60"
                  : "text-white/20"
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

      {/* Shortcut keys */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: isIdle ? 1 : 0.2, y: 0 }}
        transition={{ delay: 0.18, duration: 0.35 }}
        className="flex flex-col items-center gap-5"
      >
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Kbd>⌥</Kbd>
            <span className="text-white/15 text-[10px] font-light">+</span>
            <Kbd>Space</Kbd>
          </div>
          <span className="text-[10px] text-white/20">
            Start / stop recording
          </span>
        </div>

        <div className="w-px h-3 bg-white/8" />

        <div className="flex flex-col items-center gap-2">
          <Kbd>Esc</Kbd>
          <span className="text-[10px] text-white/20">Cancel</span>
        </div>
      </motion.div>

      {/* Active microphone indicator */}
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
              className="text-white/20 shrink-0"
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
            <span className="text-[10px] text-white/20 max-w-[180px] truncate">
              {micName}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const DEFAULT_PERMISSIONS: PermissionState = {
  inputMonitoring: false,
  microphone: false,
  accessibility: false,
  documents: false,
};

export default function App() {
  const { data: permissions } = useQuery({
    queryKey: ["permissions"],
    queryFn: fetchPermissions,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (
        d?.inputMonitoring &&
        d?.microphone &&
        d?.accessibility &&
        d?.documents
      )
        return false;
      return 3000;
    },
    refetchOnWindowFocus: true,
    staleTime: 1000,
  });

  const { data: deviceInfo } = useQuery({
    queryKey: ["devices"],
    queryFn: fetchDevices,
    staleTime: Infinity,
  });

  const [status, setStatus] = useState<AppStatus>("ready");

  useEffect(() => {
    return appEvents.on("status", (s) => setStatus(s));
  }, []);

  const openSettings = useCallback((pane: SettingsPane) => {
    appEvents.emit("openSettings", pane);
  }, []);

  const p = permissions ?? DEFAULT_PERMISSIONS;
  const allPermissionsGranted =
    p.inputMonitoring && p.microphone && p.accessibility && p.documents;

  if (!permissions) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#070810]">
        <motion.div
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="w-1.5 h-1.5 rounded-full bg-white/20"
        />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {!allPermissionsGranted ? (
        <motion.div
          key="permissions"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <PermissionScreen permissions={p} onOpenSettings={openSettings} />
        </motion.div>
      ) : (
        <motion.div
          key="ready"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <ReadyScreen status={status} deviceInfo={deviceInfo} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 text-[11px] font-mono text-white/35 border border-white/10 rounded-md bg-white/4 leading-none">
      {children}
    </kbd>
  );
}
