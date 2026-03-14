import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { appEvents, type PermissionState } from "./app-events";
import { fetchPermissions } from "./rpc";
import type { AppStatus, SettingsPane } from "../shared/types";

// ─── Permission Screen ────────────────────────────────────────────────────────

interface PermissionRowProps {
  granted: boolean;
  icon: string;
  title: string;
  description: string;
  pane: SettingsPane;
  onOpen: (pane: SettingsPane) => void;
}

function PermissionRow({
  granted,
  icon,
  title,
  description,
  pane,
  onOpen,
}: PermissionRowProps) {
  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
        granted
          ? "border-white/8 bg-white/3"
          : "border-amber-500/20 bg-amber-500/5"
      }`}
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
          granted ? "bg-white/6" : "bg-amber-500/10"
        }`}
      >
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-white/80">{title}</span>
          {granted ? (
            <span className="text-[10px] font-medium text-emerald-400/80 bg-emerald-400/10 px-2 py-0.5 rounded-full">
              Granted
            </span>
          ) : (
            <span className="text-[10px] font-medium text-amber-400/80 bg-amber-400/10 px-2 py-0.5 rounded-full">
              Required
            </span>
          )}
        </div>
        <p className="text-xs text-white/30 leading-relaxed">{description}</p>
      </div>

      {!granted && (
        <button
          onClick={() => onOpen(pane)}
          className="shrink-0 text-xs font-medium text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          Open Settings →
        </button>
      )}
    </div>
  );
}

function PermissionScreen({
  permissions,
  onOpenSettings,
}: {
  permissions: PermissionState;
  onOpenSettings: (pane: SettingsPane) => void;
}) {
  const allGranted =
    permissions.inputMonitoring &&
    permissions.microphone &&
    permissions.accessibility &&
    permissions.documents;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#07090f] text-white select-none px-8">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl border border-white/10 flex items-center justify-center text-2xl mb-5">
            ⏺
          </div>
          <h1 className="text-xl font-semibold tracking-tight mb-1">
            Codictate
          </h1>
          <p className="text-xs text-white/30">Local voice dictation</p>
        </div>

        {/* Setup card */}
        <div className="border border-white/8 rounded-2xl p-5 bg-white/2">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white/70 mb-1">
              {allGranted ? "All set!" : "Setup required"}
            </h2>
            <p className="text-xs text-white/30 leading-relaxed">
              {allGranted
                ? "Codictate has everything it needs."
                : "Grant the following permissions so Codictate can listen for your shortcut and record your voice."}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <PermissionRow
              granted={permissions.inputMonitoring}
              icon="⌨"
              title="Input Monitoring"
              description="Detect the ⌥Space shortcut globally, even when the app is in the background."
              pane="inputMonitoring"
              onOpen={onOpenSettings}
            />
            <PermissionRow
              granted={permissions.microphone}
              icon="🎙"
              title="Microphone"
              description="Record your voice to transcribe it into text."
              pane="microphone"
              onOpen={onOpenSettings}
            />
            <PermissionRow
              granted={permissions.accessibility}
              icon="🔑"
              title="Accessibility"
              description="Simulate keystrokes to paste transcription into other apps."
              pane="accessibility"
              onOpen={onOpenSettings}
            />
            <PermissionRow
              granted={permissions.documents}
              icon="📁"
              title="Files & Folders"
              description="Save transcription history and recordings to your Documents folder."
              pane="documents"
              onOpen={onOpenSettings}
            />
          </div>

          {!allGranted && (
            <p className="mt-4 text-[11px] text-white/20 text-center leading-relaxed">
              This screen updates automatically once permissions are granted.
              <br />
              You may need to restart the app after granting Input Monitoring.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Ready Screen ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AppStatus }) {
  if (status === "recording") {
    return (
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400" />
        </span>
        <span className="text-xs text-red-400/80 font-medium">Recording…</span>
      </div>
    );
  }

  if (status === "transcribing") {
    return (
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-xs text-amber-400/80 font-medium">
          Transcribing…
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      <span className="text-xs text-white/25">Ready</span>
    </div>
  );
}

function ReadyScreen({ status }: { status: AppStatus }) {
  const isActive = status !== "ready";

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#07090f] text-white select-none">
      {/* Icon */}
      <div
        className={`w-14 h-14 rounded-2xl border flex items-center justify-center text-2xl mb-6 transition-colors ${
          status === "recording"
            ? "border-red-500/30 bg-red-500/5"
            : status === "transcribing"
              ? "border-amber-500/20 bg-amber-500/5"
              : "border-white/10"
        }`}
      >
        {status === "recording" ? "⏺" : status === "transcribing" ? "✦" : "⏺"}
      </div>

      {/* Title */}
      <h1 className="text-xl font-semibold tracking-tight mb-1">Codictate</h1>
      <p className="text-xs text-white/30 mb-12">Local voice dictation</p>

      {/* Shortcuts */}
      <div
        className={`flex flex-col items-center gap-5 transition-opacity ${isActive ? "opacity-30" : "opacity-100"}`}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Kbd>⌥</Kbd>
            <span className="text-white/20 text-xs">+</span>
            <Kbd>Space</Kbd>
          </div>
          <span className="text-xs text-white/30">Start / stop recording</span>
        </div>

        <div className="w-px h-4 bg-white/10" />

        <div className="flex flex-col items-center gap-2">
          <Kbd>Esc</Kbd>
          <span className="text-xs text-white/30">Cancel recording</span>
        </div>
      </div>

      {/* Status */}
      <div className="absolute bottom-8">
        <StatusBadge status={status} />
      </div>
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
      <div className="flex items-center justify-center min-h-screen bg-[#07090f]">
        <div className="w-1.5 h-1.5 rounded-full bg-white/20 animate-pulse" />
      </div>
    );
  }

  if (!allPermissionsGranted) {
    return <PermissionScreen permissions={p} onOpenSettings={openSettings} />;
  }

  return <ReadyScreen status={status} />;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-3 py-1.5 text-xs font-mono border border-white/10 rounded-lg bg-white/4 text-white/60">
      {children}
    </kbd>
  );
}
