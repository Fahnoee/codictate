"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import type {
  AppSettings,
  DevAppPreviewRoute,
  FormattingEmailClosingStyle,
  FormattingEmailGreetingStyle,
  RecordingIndicatorMode,
  ShortcutId,
  StreamTranscriptionMode,
  UpdateCheckState,
  FormattingModeId,
} from "../../../shared/types";
import { FORMATTING_MODES } from "../../../shared/formatting-modes";
import {
  dictationShortcutBehaviorHint,
  dictationHoldOnlyShortcutHint,
} from "../../../shared/shortcut-options";
import { TRANSCRIPTION_LANGUAGE_HINT } from "../../../shared/transcription-languages";
import { formatRecordingDurationLabel } from "../../../shared/recording-duration-presets";
import {
  DEFAULT_MODEL_ID,
  DEFAULT_STREAM_CAPABLE_MODEL_ID,
  DEFAULT_TRANSLATE_DOWNLOAD_MODEL_ID,
  LARGE_V3_Q5_MODEL_ID,
  formatModelSize,
  getWhisperModel,
  getTranslateReadiness,
  isTranslateCapableModelId,
  parakeetSupportsTranscriptionLanguageId,
} from "../../../shared/whisper-models";
import {
  PARAKEET_FIRST_RUN_SETTINGS_HINT,
  PARAKEET_FIRST_RUN_STREAM_HELPER,
  SPEECH_MODELS,
  coerceTranscriptionLanguageIdForModel,
  speechModelLocksTranscriptionLanguage,
} from "../../../shared/speech-models";
import {
  setShortcut,
  setShortcutHoldOnly,
  setAudioDevice,
  fetchDevices,
  fetchSettings,
  triggerUpdateCheck,
  triggerApplyUpdate,
  setDebugMode,
  setTranscriptionLanguage,
  setMaxRecordingDuration,
  setRecordingIndicatorMode,
  copyDebugLog,
  setWhisperModel,
  setTranslateToEnglish,
  setTranslateDefaultLanguage,
  setStreamMode,
  setStreamTranscriptionMode,
  setFormattingMode,
  setUserDisplayName,
  setFormattingAutoSelectEnabled,
  setFormattingEmailIncludeSenderName,
  setFormattingEmailGreetingStyle,
  setFormattingEmailClosingStyle,
  setFormattingEmailCustomGreeting,
  setFormattingEmailCustomClosing,
  setAudioDuckingLevel,
  setAudioDuckingIncludeHeadphones,
  downloadWhisperModel,
  cancelModelDownload,
  deleteWhisperModel,
} from "../../rpc";
import { appEvents } from "../../app-events";
import { ShortcutPicker } from "./ShortcutPicker";
import { HoldOnlyShortcutPicker } from "./HoldOnlyShortcutPicker";
import { DevicePicker } from "./DevicePicker";
import { LanguagePicker } from "./LanguagePicker";
import { RecordingLimitPicker } from "./RecordingLimitPicker";
import { ModelPicker } from "./ModelPicker";
import {
  WordmarkCodictate,
  wordmarkCodictateTypographyClass,
} from "../Brand/WordmarkCodictate";

/** Secondary copy under each block: readable, softer than card content. */
const settingsHelperClass =
  "mt-3 text-[18px] text-white/44 leading-relaxed font-sans font-normal";

/** Select value when translate default is still `auto` on disk — not a real language id. */
const TRANSLATE_DEFAULT_PLACEHOLDER = "__translate_pick__";

const devPreviewSelectClass =
  "w-full appearance-none rounded-lg border font-medium text-white/78 outline-none " +
  "border-white/12 bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] " +
  "hover:border-white/18 hover:bg-white/7 " +
  "focus-visible:border-white/26 focus-visible:ring-2 focus-visible:ring-white/12 focus-visible:ring-offset-0 " +
  "cursor-pointer transition-[border-color,background-color,box-shadow] duration-200 " +
  "[color-scheme:dark] pl-4 pr-11 py-3.5 text-[21px] leading-snug";

const FORMATTING_GREETING_STYLE_OPTIONS: {
  value: FormattingEmailGreetingStyle;
  label: string;
}[] = [
  { value: "auto", label: "Auto" },
  { value: "hi", label: "Hi" },
  { value: "hello", label: "Hello" },
  { value: "custom", label: "Custom…" },
];

const FORMATTING_CLOSING_STYLE_OPTIONS: {
  value: FormattingEmailClosingStyle;
  label: string;
}[] = [
  { value: "auto", label: "Auto" },
  { value: "best-regards", label: "Best regards" },
  { value: "thanks", label: "Thanks" },
  { value: "kind-regards", label: "Kind regards" },
  { value: "custom", label: "Custom…" },
];

type SettingsCategory =
  | "transcription"
  | "modes"
  | "formatting"
  | "shortcuts"
  | "audio"
  | "ui"
  | "general";

const CATEGORIES: {
  id: SettingsCategory;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "transcription",
    label: "Transcription",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </svg>
    ),
  },
  {
    id: "modes",
    label: "Modes",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
      </svg>
    ),
  },
  {
    id: "formatting",
    label: "Formatting",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
        <path d="m15 5 4 4" />
      </svg>
    ),
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="20" height="16" x="2" y="4" rx="2" ry="2" />
        <path d="M6 8h.01" />
        <path d="M10 8h.01" />
        <path d="M14 8h.01" />
        <path d="M18 8h.01" />
        <path d="M8 12h.01" />
        <path d="M12 12h.01" />
        <path d="M16 12h.01" />
        <path d="M7 16h10" />
      </svg>
    ),
  },
  {
    id: "audio",
    label: "Audio",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
    ),
  },
  {
    id: "ui",
    label: "UI",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="20" height="14" x="2" y="3" rx="2" />
        <line x1="8" x2="16" y1="21" y2="21" />
        <line x1="12" x2="12" y1="17" y2="21" />
      </svg>
    ),
  },
  {
    id: "general",
    label: "General",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
];

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
      return "text-white/55";
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
        className="text-white/45 animate-spin"
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
      className="text-white/38"
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
        className="shrink-0 px-3 py-1.5 rounded-lg text-[19px] font-semibold bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/20 hover:border-blue-400/35 text-blue-300/90 transition-colors duration-200 cursor-pointer"
      >
        Restart
      </button>
    );
  }
  if (state === "error") {
    return (
      <button
        onClick={onCheck}
        className="shrink-0 px-3 py-1.5 rounded-lg text-[19px] font-medium border border-white/12 hover:border-white/20 bg-white/4 hover:bg-white/7 text-white/48 hover:text-white/68 transition-colors duration-200 cursor-pointer"
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
      className="shrink-0 px-3 py-1.5 rounded-lg text-[19px] font-medium border border-white/12 hover:border-white/20 bg-white/4 hover:bg-white/7 text-white/48 hover:text-white/68 transition-colors duration-200 cursor-pointer"
    >
      Check
    </button>
  );
}

export function SettingsScreen({
  settings,
  onBack,
  devPreviewRoute = null,
  onDevPreviewRouteChange,
}: {
  settings: AppSettings;
  onBack: () => void;
  devPreviewRoute?: DevAppPreviewRoute | null;
  onDevPreviewRouteChange?: (route: DevAppPreviewRoute | null) => void;
}) {
  const queryClient = useQueryClient();
  const { data: deviceInfo } = useQuery({
    queryKey: ["devices"],
    queryFn: fetchDevices,
  });

  const [activeCategory, setActiveCategory] =
    useState<SettingsCategory>("transcription");
  const [updateState, setUpdateState] = useState<UpdateCheckState>("idle");
  const [updateMessage, setUpdateMessage] = useState<string | undefined>();
  const [isCopied, setIsCopied] = useState(false);

  // Model availability: seed from query cache (populated at startup by pushInitialState),
  // falling back to bundled-only defaults for models not yet reported.
  const [modelAvailability, setModelAvailability] = useState<
    Record<string, boolean>
  >(() => {
    const cached = queryClient.getQueryData<Record<string, boolean>>([
      "modelAvailability",
    ]);
    const defaults = Object.fromEntries(
      SPEECH_MODELS.map((m) => [m.id, m.bundled ?? false]),
    );
    return cached ? { ...defaults, ...cached } : defaults;
  });
  const [downloadProgress, setDownloadProgress] = useState<
    Record<string, number>
  >({});
  const [userDisplayNameDraft, setUserDisplayNameDraft] = useState("");
  const [customGreetingDraft, setCustomGreetingDraft] = useState("");
  const [customClosingDraft, setCustomClosingDraft] = useState("");
  /** Model id being downloaded to satisfy a translate toggle, if any. */
  const translatePendingRef = useRef<string | null>(null);
  const [translateDownloadModelId, setTranslateDownloadModelId] = useState<
    string | null
  >(null);

  useEffect(() => {
    return appEvents.on("updateCheckStatus", ({ state, message }) => {
      setUpdateState(state);
      setUpdateMessage(message);
      if (state === "up-to-date") {
        setTimeout(() => setUpdateState("idle"), 4000);
      }
    });
  }, []);

  useEffect(() => {
    return appEvents.on("modelAvailability", ({ modelId, available }) => {
      setModelAvailability((prev) => ({ ...prev, [modelId]: available }));
    });
  }, []);

  useEffect(() => {
    const unsub = appEvents.on(
      "modelDownloadProgress",
      async ({ modelId, progressFraction, done, error }) => {
        if (!done) {
          setDownloadProgress((prev) => ({
            ...prev,
            [modelId]: progressFraction,
          }));
          return;
        }

        // Download finished (success or failure)
        setDownloadProgress((prev) => {
          const next = { ...prev };
          delete next[modelId];
          return next;
        });

        const pendingTranslate = translatePendingRef.current;
        if (pendingTranslate === modelId) {
          setTranslateDownloadModelId(null);
          translatePendingRef.current = null;
          if (!error && isTranslateCapableModelId(modelId)) {
            const current = queryClient.getQueryData<AppSettings>(["settings"]);
            const sel = current?.whisperModelId ?? DEFAULT_MODEL_ID;
            if (!isTranslateCapableModelId(sel) || sel !== modelId) {
              const hadStream = current?.streamMode ?? false;
              await setWhisperModel(modelId);
              queryClient.setQueryData(["settings"], (old: AppSettings) => ({
                ...old,
                whisperModelId: modelId,
                ...(hadStream ? { streamMode: false } : {}),
              }));
              if (hadStream) {
                const ok = await setStreamMode(false);
                if (!ok) {
                  queryClient.setQueryData(["settings"], await fetchSettings());
                }
              }
            }
            const ok = await setTranslateToEnglish(true);
            if (ok) {
              queryClient.setQueryData(["settings"], (old: AppSettings) => ({
                ...old,
                translateToEnglish: true,
              }));
            } else {
              const fresh = await fetchSettings();
              queryClient.setQueryData(["settings"], fresh);
            }
          }
        }

        if (!error) {
          setModelAvailability((prev) => ({ ...prev, [modelId]: true }));
          // Auto-select when downloading from the model picker (not a translate-pending flow).
          if (
            pendingTranslate !== modelId &&
            modelId !== LARGE_V3_Q5_MODEL_ID
          ) {
            const cur = queryClient.getQueryData<AppSettings>(["settings"]);
            const hadStream = cur?.streamMode ?? false;
            const nextLang = coerceTranscriptionLanguageIdForModel(
              modelId,
              cur?.transcriptionLanguageId ?? "auto",
            );
            await setWhisperModel(modelId);
            queryClient.setQueryData(["settings"], (old: AppSettings) => ({
              ...old,
              whisperModelId: modelId,
              transcriptionLanguageId: nextLang,
              ...(hadStream ? { streamMode: false } : {}),
            }));
            if (nextLang !== cur?.transcriptionLanguageId) {
              await setTranscriptionLanguage(nextLang);
            }
            if (hadStream) {
              const ok = await setStreamMode(false);
              if (!ok) {
                queryClient.setQueryData(["settings"], await fetchSettings());
              }
            }
          }
        }
      },
    );
    return unsub;
  }, [queryClient]);

  const handleCheckForUpdates = useCallback(() => {
    setUpdateState("checking");
    triggerUpdateCheck();
  }, []);

  const handleApplyUpdate = useCallback(() => {
    triggerApplyUpdate();
  }, []);

  const handleShortcutChange = useCallback(
    async (id: ShortcutId) => {
      queryClient.setQueryData(["settings"], {
        ...settings,
        shortcutId: id,
        shortcutHoldOnlyId:
          settings.shortcutHoldOnlyId === id
            ? null
            : settings.shortcutHoldOnlyId,
      });
      await setShortcut(id);
    },
    [queryClient, settings],
  );

  const handleHoldOnlyShortcutChange = useCallback(
    async (id: ShortcutId | null) => {
      queryClient.setQueryData(["settings"], {
        ...settings,
        shortcutHoldOnlyId: id,
      });
      await setShortcutHoldOnly(id);
    },
    [queryClient, settings],
  );

  const handleDebugToggle = useCallback(async () => {
    await setDebugMode(!settings.debugMode);
  }, [settings.debugMode]);

  const handleCopyLog = useCallback(() => {
    copyDebugLog();
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, []);

  const handleDevPreviewRouteSelect = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      onDevPreviewRouteChange?.(v === "" ? null : (v as DevAppPreviewRoute));
    },
    [onDevPreviewRouteChange],
  );

  const showDevTools = import.meta.env.DEV && onDevPreviewRouteChange != null;

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

  const handleTranscriptionLanguageChange = useCallback(
    async (transcriptionLanguageId: string) => {
      queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
        old
          ? {
              ...old,
              transcriptionLanguageId,
            }
          : old,
      );
      await setTranscriptionLanguage(transcriptionLanguageId);
    },
    [queryClient, settings],
  );

  const handleMaxRecordingDurationChange = useCallback(
    async (maxRecordingDuration: number) => {
      queryClient.setQueryData(["settings"], {
        ...settings,
        maxRecordingDuration,
      });
      await setMaxRecordingDuration(maxRecordingDuration);
    },
    [queryClient, settings],
  );

  const handleRecordingIndicatorModeChange = useCallback(
    async (mode: RecordingIndicatorMode) => {
      queryClient.setQueryData(["settings"], {
        ...settings,
        recordingIndicatorMode: mode,
      });
      const ok = await setRecordingIndicatorMode(mode);
      if (!ok) {
        const fresh = await fetchSettings();
        queryClient.setQueryData(["settings"], fresh);
      }
    },
    [queryClient, settings],
  );

  const handleModelSelect = useCallback(
    async (modelId: string) => {
      if (modelId === settings.whisperModelId) return;
      const hadStream = settings.streamMode;
      const nextLang = coerceTranscriptionLanguageIdForModel(
        modelId,
        settings.transcriptionLanguageId,
      );
      queryClient.setQueryData(["settings"], {
        ...settings,
        whisperModelId: modelId,
        transcriptionLanguageId: nextLang,
        ...(hadStream ? { streamMode: false } : {}),
      });
      await setWhisperModel(modelId);
      if (nextLang !== settings.transcriptionLanguageId) {
        await setTranscriptionLanguage(nextLang);
      }
      if (hadStream) {
        const ok = await setStreamMode(false);
        if (!ok) {
          queryClient.setQueryData(["settings"], await fetchSettings());
        }
      }
    },
    [queryClient, settings],
  );

  const handleModelDownload = useCallback((modelId: string) => {
    setDownloadProgress((prev) => ({ ...prev, [modelId]: 0 }));
    downloadWhisperModel(modelId);
  }, []);

  const handleCancelDownload = useCallback((modelId: string) => {
    cancelModelDownload(modelId);
    if (translatePendingRef.current === modelId) {
      translatePendingRef.current = null;
      setTranslateDownloadModelId(null);
    }
    setDownloadProgress((prev) => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
  }, []);

  const handleModelDelete = useCallback(
    async (modelId: string) => {
      deleteWhisperModel(modelId);
      setModelAvailability((prev) => ({ ...prev, [modelId]: false }));

      // If the deleted model was selected, fall back to the default model.
      if (settings.whisperModelId === modelId) {
        const hadStream = settings.streamMode;
        queryClient.setQueryData(
          ["settings"],
          (old: AppSettings | undefined) =>
            old
              ? {
                  ...old,
                  whisperModelId: DEFAULT_MODEL_ID,
                  ...(hadStream ? { streamMode: false } : {}),
                }
              : old,
        );
        await setWhisperModel(DEFAULT_MODEL_ID);
        if (hadStream) {
          const ok = await setStreamMode(false);
          if (!ok) {
            queryClient.setQueryData(["settings"], await fetchSettings());
          }
        }
      }

      if (
        settings.translateToEnglish &&
        isTranslateCapableModelId(modelId) &&
        settings.whisperModelId === modelId
      ) {
        queryClient.setQueryData(["settings"], (old: AppSettings) => ({
          ...old,
          translateToEnglish: false,
        }));
        await setTranslateToEnglish(false);
      }
    },
    [settings, queryClient],
  );

  const handleTranslateToggle = useCallback(async () => {
    if (settings.translateToEnglish) {
      queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
        old
          ? {
              ...old,
              translateToEnglish: false,
              transcriptionLanguageId: "auto",
            }
          : old,
      );
      await setTranslateToEnglish(false);
      return;
    }

    const isModelAvail = (id: string) =>
      modelAvailability[id] ?? getWhisperModel(id)?.bundled ?? false;

    const readiness = getTranslateReadiness(
      settings.whisperModelId,
      settings.transcriptionLanguageId,
      settings.translateDefaultLanguageId,
      isModelAvail,
    );

    if (readiness.kind === "ready") {
      const sourceLanguageId =
        settings.transcriptionLanguageId === "auto"
          ? settings.translateDefaultLanguageId
          : settings.transcriptionLanguageId;

      queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
        old
          ? {
              ...old,
              translateToEnglish: true,
              transcriptionLanguageId: sourceLanguageId,
            }
          : old,
      );
      const ok = await setTranslateToEnglish(true);
      if (!ok) {
        const fresh = await fetchSettings();
        queryClient.setQueryData(["settings"], fresh);
      }
      return;
    }

    if (readiness.kind === "need_download") {
      const sel = settings.whisperModelId;
      const target =
        isTranslateCapableModelId(sel) && !isModelAvail(sel)
          ? sel
          : DEFAULT_TRANSLATE_DOWNLOAD_MODEL_ID;
      translatePendingRef.current = target;
      setTranslateDownloadModelId(target);
      setDownloadProgress((prev) => ({ ...prev, [target]: 0 }));
      downloadWhisperModel(target);
      return;
    }

    // need_switch_model or need_language — handled in Settings UI / language pickers.
  }, [settings, queryClient, modelAvailability]);

  const handleTranslateDefaultLanguageChange = useCallback(
    async (languageId: string) => {
      if (
        languageId === TRANSLATE_DEFAULT_PLACEHOLDER ||
        languageId === "auto"
      ) {
        return;
      }
      queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
        old
          ? {
              ...old,
              translateDefaultLanguageId: languageId,
            }
          : old,
      );
      await setTranslateDefaultLanguage(languageId);
    },
    [queryClient, settings],
  );

  const handleStreamModeToggle = useCallback(async () => {
    const newValue = !settings.streamMode;
    queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
      old ? { ...old, streamMode: newValue } : old,
    );
    const ok = await setStreamMode(newValue);
    if (!ok) {
      queryClient.setQueryData(["settings"], await fetchSettings());
    }
  }, [settings.streamMode, queryClient]);

  const handleStreamTranscriptionModeChange = useCallback(
    async (mode: StreamTranscriptionMode) => {
      queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
        old ? { ...old, streamTranscriptionMode: mode } : old,
      );
      await setStreamTranscriptionMode(mode);
    },
    [queryClient],
  );

  const handleFormattingModeChange = useCallback(
    async (modeId: FormattingModeId) => {
      queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
        old ? { ...old, formattingModeId: modeId } : old,
      );
      await setFormattingMode(modeId);
    },
    [queryClient],
  );

  useEffect(() => {
    setUserDisplayNameDraft(settings.userDisplayName);
  }, [settings.userDisplayName]);

  useEffect(() => {
    setCustomGreetingDraft(settings.formattingEmailCustomGreeting);
  }, [settings.formattingEmailCustomGreeting]);

  useEffect(() => {
    setCustomClosingDraft(settings.formattingEmailCustomClosing);
  }, [settings.formattingEmailCustomClosing]);

  const handleUserDisplayNameCommit = useCallback(async () => {
    const normalized = userDisplayNameDraft.trim();
    if (normalized === settings.userDisplayName) return;
    queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
      old ? { ...old, userDisplayName: normalized } : old,
    );
    const ok = await setUserDisplayName(normalized);
    if (!ok) {
      queryClient.setQueryData(["settings"], await fetchSettings());
    }
  }, [queryClient, settings.userDisplayName, userDisplayNameDraft]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void handleUserDisplayNameCommit();
    }, 600);
    return () => clearTimeout(timer);
  }, [userDisplayNameDraft, handleUserDisplayNameCommit]);

  const handleCustomGreetingCommit = useCallback(async () => {
    const text = customGreetingDraft.trim();
    if (text === settings.formattingEmailCustomGreeting) return;
    queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
      old ? { ...old, formattingEmailCustomGreeting: text } : old,
    );
    await setFormattingEmailCustomGreeting(text);
  }, [queryClient, settings.formattingEmailCustomGreeting, customGreetingDraft]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void handleCustomGreetingCommit();
    }, 600);
    return () => clearTimeout(timer);
  }, [customGreetingDraft, handleCustomGreetingCommit]);

  const handleCustomClosingCommit = useCallback(async () => {
    const text = customClosingDraft.trim();
    if (text === settings.formattingEmailCustomClosing) return;
    queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
      old ? { ...old, formattingEmailCustomClosing: text } : old,
    );
    await setFormattingEmailCustomClosing(text);
  }, [queryClient, settings.formattingEmailCustomClosing, customClosingDraft]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void handleCustomClosingCommit();
    }, 600);
    return () => clearTimeout(timer);
  }, [customClosingDraft, handleCustomClosingCommit]);

  const handleFormattingAutoSelectToggle = useCallback(async () => {
    const newValue = !settings.formattingAutoSelectEnabled;
    queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
      old ? { ...old, formattingAutoSelectEnabled: newValue } : old,
    );
    const ok = await setFormattingAutoSelectEnabled(newValue);
    if (!ok) {
      queryClient.setQueryData(["settings"], await fetchSettings());
    }
  }, [queryClient, settings.formattingAutoSelectEnabled]);

  const handleFormattingEmailIncludeSenderNameToggle = useCallback(async () => {
    const newValue = !settings.formattingEmailIncludeSenderName;
    queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
      old ? { ...old, formattingEmailIncludeSenderName: newValue } : old,
    );
    const ok = await setFormattingEmailIncludeSenderName(newValue);
    if (!ok) {
      queryClient.setQueryData(["settings"], await fetchSettings());
    }
  }, [queryClient, settings.formattingEmailIncludeSenderName]);

  const handleFormattingEmailGreetingStyleChange = useCallback(
    async (event: ChangeEvent<HTMLSelectElement>) => {
      const style = event.target.value as FormattingEmailGreetingStyle;
      queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
        old ? { ...old, formattingEmailGreetingStyle: style } : old,
      );
      const ok = await setFormattingEmailGreetingStyle(style);
      if (!ok) {
        queryClient.setQueryData(["settings"], await fetchSettings());
      }
    },
    [queryClient],
  );

  const handleFormattingEmailClosingStyleChange = useCallback(
    async (event: ChangeEvent<HTMLSelectElement>) => {
      const style = event.target.value as FormattingEmailClosingStyle;
      queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
        old ? { ...old, formattingEmailClosingStyle: style } : old,
      );
      const ok = await setFormattingEmailClosingStyle(style);
      if (!ok) {
        queryClient.setQueryData(["settings"], await fetchSettings());
      }
    },
    [queryClient],
  );

  const handleAudioDuckingLevelChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const level = Number(event.target.value);
      queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
        old ? { ...old, audioDuckingLevel: level } : old,
      );
      await setAudioDuckingLevel(level);
    },
    [queryClient],
  );

  const handleAudioDuckingIncludeHeadphonesToggle = useCallback(async () => {
    const newValue = !settings.audioDuckingIncludeHeadphones;
    queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
      old ? { ...old, audioDuckingIncludeHeadphones: newValue } : old,
    );
    await setAudioDuckingIncludeHeadphones(newValue);
  }, [queryClient, settings.audioDuckingIncludeHeadphones]);

  const durationLabel = formatRecordingDurationLabel(
    settings.maxRecordingDuration,
  );

  return (
    <div className="flex h-screen bg-codictate-page text-white select-none overflow-hidden">
      <div className="electrobun-webkit-app-region-drag absolute top-0 left-0 right-0 h-7 hover:bg-white/10 transition-colors duration-200 z-50" />

      {/* Sidebar */}
      <div className="w-[248px] shrink-0 border-r border-white/10 bg-white/2 flex flex-col pt-10 pb-6 px-3">
        <div className="mb-8">
          <WordmarkCodictate
            as="h1"
            className={`text-[30px] ${wordmarkCodictateTypographyClass}`}
          />
        </div>
        <nav className="flex flex-col gap-1">
          {CATEGORIES.map((c) => {
            const isActive = activeCategory === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[16px] font-medium transition-colors duration-200 cursor-pointer ${
                  isActive
                    ? "bg-white/10 text-white/90"
                    : "text-white/50 hover:bg-white/5 hover:text-white/70"
                }`}
              >
                <div className={isActive ? "text-white/80" : "text-white/40"}>
                  {c.icon}
                </div>
                {c.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto pt-4 px-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[15px] font-medium text-white/40 hover:text-white/70 transition-colors duration-200 cursor-pointer"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            Back to App
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto pt-12 pb-16 px-10">
        <div className="max-w-[540px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {activeCategory === "transcription" && (
                <>
                  <div className="mb-8">
                    <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                      Transcription Model
                    </h2>
                    <ModelPicker
                      value={settings.whisperModelId}
                      modelAvailability={modelAvailability}
                      downloadProgress={downloadProgress}
                      onSelect={handleModelSelect}
                      onDownload={handleModelDownload}
                      onCancelDownload={handleCancelDownload}
                      onDelete={handleModelDelete}
                    />
                    <p className={settingsHelperClass}>
                      Whisper models run locally. Turbo is bundled; others
                      download on demand. Stream mode requires Parakeet.
                      Translate to English requires Small or Large Whisper.
                    </p>
                    <p className={`${settingsHelperClass} text-amber-200/55`}>
                      {PARAKEET_FIRST_RUN_SETTINGS_HINT}
                    </p>
                  </div>

                  <div className="mb-8">
                    <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                      Transcription Language
                    </h2>
                    <LanguagePicker
                      value={settings.transcriptionLanguageId}
                      onChange={handleTranscriptionLanguageChange}
                      speechModelId={settings.whisperModelId}
                    />
                    <p className={settingsHelperClass}>
                      {speechModelLocksTranscriptionLanguage(
                        settings.whisperModelId,
                      )
                        ? "Parakeet auto-detects spoken language. Manual selection is disabled."
                        : TRANSCRIPTION_LANGUAGE_HINT}
                    </p>
                  </div>

                  <div className="mb-8">
                    <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                      Recording Limit
                    </h2>
                    <RecordingLimitPicker
                      valueSeconds={settings.maxRecordingDuration}
                      onChange={handleMaxRecordingDurationChange}
                    />
                    <p className={settingsHelperClass}>
                      Recording stops automatically after {durationLabel} to
                      maintain speed and accuracy. Longer limits use more disk
                      space and increase transcription time.
                    </p>
                  </div>
                </>
              )}

              {activeCategory === "modes" && (
                <>
                  <div className="mb-8">
                    <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                      Translate to English
                    </h2>
                    <div className="rounded-xl border border-white/11 bg-white/4 overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="flex-1 min-w-0">
                          <span
                            className={`block text-[21px] font-medium ${settings.translateToEnglish ? "text-white/78" : "text-white/58"}`}
                          >
                            {settings.translateToEnglish
                              ? "Translation active"
                              : "Translate to English"}
                          </span>
                        </div>
                        <button
                          onClick={handleTranslateToggle}
                          disabled={translateDownloadModelId !== null}
                          className={`relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer border ${
                            settings.translateToEnglish
                              ? "bg-blue-500/30 border-blue-400/30"
                              : "bg-white/7 border-white/14"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                          aria-label="Toggle translate to English"
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
                              settings.translateToEnglish
                                ? "left-4 bg-blue-400/90"
                                : "left-0.5 bg-white/40"
                            }`}
                          />
                        </button>
                      </div>

                      <AnimatePresence>
                        {translateDownloadModelId !== null && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-t border-white/10 px-4 py-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <p className="text-[18px] text-white/55 font-sans leading-relaxed">
                                  Downloading the{" "}
                                  {getWhisperModel(translateDownloadModelId)
                                    ?.label ?? translateDownloadModelId}{" "}
                                  model (
                                  {formatModelSize(
                                    getWhisperModel(translateDownloadModelId)
                                      ?.sizeMB ?? 0,
                                  )}
                                  )…
                                </p>
                                <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                                  <motion.div
                                    className="h-full rounded-full bg-blue-400/60"
                                    animate={{
                                      width: `${Math.round((downloadProgress[translateDownloadModelId] ?? 0) * 100)}%`,
                                    }}
                                    transition={{ duration: 0.2 }}
                                  />
                                </div>
                              </div>
                              <button
                                onClick={() =>
                                  handleCancelDownload(translateDownloadModelId)
                                }
                                className="shrink-0 px-2.5 py-1 rounded-lg text-[17px] font-medium border border-white/12 hover:border-white/22 bg-white/4 hover:bg-white/8 text-white/44 hover:text-white/64 transition-colors duration-200 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="mt-3">
                      <p className="text-[17px] text-white/44 font-sans mb-2">
                        Default source language
                      </p>
                      <LanguagePicker
                        value={
                          settings.translateDefaultLanguageId === "auto"
                            ? TRANSLATE_DEFAULT_PLACEHOLDER
                            : settings.translateDefaultLanguageId
                        }
                        onChange={handleTranslateDefaultLanguageChange}
                        leadingDisabledOption={{
                          value: TRANSLATE_DEFAULT_PLACEHOLDER,
                          label:
                            "Choose source language (required for translate mode)…",
                        }}
                        excludeAuto
                        ariaLabel="Default source language for translation"
                      />
                    </div>

                    <p className={settingsHelperClass}>
                      Translate mode requires a fixed source language and a
                      Small or Large Whisper model (not Turbo). Download models
                      under <b>Transcription</b>.
                    </p>
                  </div>

                  <div className="mb-8">
                    <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                      Stream mode
                    </h2>
                    <div className="rounded-xl border border-white/11 bg-white/4 overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="flex-1 min-w-0">
                          <span
                            className={`block text-[21px] font-medium ${settings.streamMode ? "text-white/78" : "text-white/58"}`}
                          >
                            {settings.streamMode
                              ? "Stream mode active"
                              : "Stream mode"}
                          </span>
                        </div>
                        <button
                          onClick={handleStreamModeToggle}
                          className={`relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer border ${
                            settings.streamMode
                              ? "bg-blue-500/30 border-blue-400/30"
                              : "bg-white/7 border-white/14"
                          }`}
                          aria-label="Toggle stream mode"
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
                              settings.streamMode
                                ? "left-4 bg-blue-400/90"
                                : "left-0.5 bg-white/40"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                    <p className={settingsHelperClass}>
                      Press shortcut to start streaming, again (or Esc) to stop.
                      Requires Parakeet model.{" "}
                      <span className="text-amber-200/55">
                        {PARAKEET_FIRST_RUN_STREAM_HELPER}
                      </span>
                    </p>
                    {!modelAvailability[DEFAULT_STREAM_CAPABLE_MODEL_ID] && (
                      <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/8 px-4 py-3">
                        <p className="text-[17px] text-white/70 leading-snug">
                          Install{" "}
                          <strong className="text-white/85 font-medium">
                            Parakeet TDT v3
                          </strong>{" "}
                          to use stream mode. After install, the first
                          transcription or stream may take several minutes while
                          Core ML prepares on your Mac.
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            downloadWhisperModel(
                              DEFAULT_STREAM_CAPABLE_MODEL_ID,
                            )
                          }
                          className="mt-3 px-3 py-2 rounded-lg text-[17px] font-medium border border-amber-400/35 bg-amber-500/15 hover:bg-amber-500/25 text-amber-100/90 transition-colors cursor-pointer"
                        >
                          Download Parakeet
                        </button>
                      </div>
                    )}
                    {settings.streamMode &&
                      !parakeetSupportsTranscriptionLanguageId(
                        settings.transcriptionLanguageId,
                      ) && (
                        <p
                          className={`${settingsHelperClass} text-amber-200/55`}
                        >
                          Parakeet supports auto-detect or 25 European
                          languages. Change transcription language for stream
                          mode.
                        </p>
                      )}
                    <div className="mt-4 rounded-xl border border-white/11 bg-black/10 p-2">
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            {
                              id: "vad",
                              title: "VAD / Stable",
                              body: "Waits for a pause, then pastes completed sentences.",
                            },
                            {
                              id: "live",
                              title: "Live",
                              body: "Pastes words as you speak them",
                            },
                          ] as const
                        ).map((mode) => {
                          const active =
                            settings.streamTranscriptionMode === mode.id;
                          return (
                            <button
                              key={mode.id}
                              onClick={() =>
                                void handleStreamTranscriptionModeChange(
                                  mode.id,
                                )
                              }
                              className={`rounded-xl border px-3 py-3 text-left transition-colors duration-200 cursor-pointer ${
                                active
                                  ? "border-blue-400/30 bg-blue-500/15 text-white/88"
                                  : "border-white/10 bg-white/4 text-white/62 hover:border-white/18 hover:bg-white/7"
                              }`}
                            >
                              <span className="block text-[18px] font-medium">
                                {mode.title}
                              </span>
                              <span className="mt-1 block text-[15px] leading-snug text-white/48">
                                {mode.body}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeCategory === "formatting" && (
                <>
                  {!settings.formattingAvailable && (
                    <div className="mb-6 rounded-xl border border-white/10 bg-white/4 px-4 py-3.5">
                      <p className="text-[18px] text-white/44 leading-relaxed font-sans">
                        Be aware: output formatting only works on{" "}
                        <span className="text-white/62 font-medium">
                          macOS 26 or later
                        </span>{" "}
                        with Apple Intelligence enabled in System Settings.
                      </p>
                    </div>
                  )}
                  <div className="mb-8">
                    <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                      Format Mode
                    </h2>
                    <div className="rounded-xl border border-white/11 bg-white/4 overflow-hidden divide-y divide-white/8">
                      {FORMATTING_MODES.map((mode) => {
                        return (
                          <button
                            key={mode.id}
                            onClick={() => handleFormattingModeChange(mode.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 cursor-pointer ${
                              settings.formattingModeId === mode.id
                                ? "bg-purple-500/10"
                                : "hover:bg-white/4"
                            }`}
                          >
                            <div
                              className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center ${
                                settings.formattingModeId === mode.id
                                  ? "border-purple-400/60 bg-purple-500/30"
                                  : "border-white/20"
                              }`}
                            >
                              {settings.formattingModeId === mode.id && (
                                <div className="w-2 h-2 rounded-full bg-purple-400/80" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span
                                className={`block text-[21px] font-medium ${
                                  settings.formattingModeId === mode.id
                                    ? "text-white/86"
                                    : "text-white/60"
                                }`}
                              >
                                {mode.label}
                              </span>
                              <span className="block text-[17px] text-white/40 mt-0.5">
                                {mode.description}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <p className={settingsHelperClass}>
                      When a format is selected, your transcribed speech will be
                      reshaped using Apple Intelligence before being pasted.
                      Works in standard recording mode only — not stream mode.
                    </p>
                  </div>

                  <div className="mb-8">
                    <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                      Email behavior
                    </h2>
                    <div className="rounded-xl border border-white/11 bg-white/4 overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="flex-1 min-w-0">
                          <span
                            className={`block text-[21px] font-medium ${settings.formattingAutoSelectEnabled ? "text-white/78" : "text-white/58"}`}
                          >
                            Auto-select in mail apps
                          </span>
                          <span className="mt-0.5 block text-[17px] text-white/40 leading-snug">
                            Automatically use email formatting when the focused
                            app looks like an email client.
                          </span>
                        </div>
                        <button
                          onClick={handleFormattingAutoSelectToggle}
                          className={`relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer border ${
                            settings.formattingAutoSelectEnabled
                              ? "bg-purple-500/30 border-purple-400/30"
                              : "bg-white/7 border-white/14"
                          }`}
                          aria-label="Toggle automatic email formatting"
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
                              settings.formattingAutoSelectEnabled
                                ? "left-4 bg-purple-400/90"
                                : "left-0.5 bg-white/40"
                            }`}
                          />
                        </button>
                      </div>
                      <div className="border-t border-white/8 px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <span
                              className={`block text-[21px] font-medium ${settings.formattingEmailIncludeSenderName ? "text-white/78" : "text-white/58"}`}
                            >
                              Add my name to email sign-off
                            </span>
                            <span className="mt-0.5 block text-[17px] text-white/40 leading-snug">
                              Uses your stored name when the email needs a
                              sign-off and you did not dictate one clearly.
                            </span>
                          </div>
                          <button
                            onClick={
                              handleFormattingEmailIncludeSenderNameToggle
                            }
                            className={`relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer border ${
                              settings.formattingEmailIncludeSenderName
                                ? "bg-purple-500/30 border-purple-400/30"
                                : "bg-white/7 border-white/14"
                            }`}
                            aria-label="Toggle sender name in email sign-off"
                          >
                            <span
                              className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
                                settings.formattingEmailIncludeSenderName
                                  ? "left-4 bg-purple-400/90"
                                  : "left-0.5 bg-white/40"
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="block">
                        <span className="mb-2 block text-[17px] text-white/44 font-sans">
                          Greeting style
                        </span>
                        <label className="block">
                          <select
                            value={settings.formattingEmailGreetingStyle}
                            onChange={handleFormattingEmailGreetingStyleChange}
                            className={devPreviewSelectClass}
                            aria-label="Preferred email greeting style"
                          >
                            {FORMATTING_GREETING_STYLE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <AnimatePresence>
                          {settings.formattingEmailGreetingStyle === "custom" && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18 }}
                              className="overflow-hidden"
                            >
                              <input
                                type="text"
                                value={customGreetingDraft}
                                onChange={(e) =>
                                  setCustomGreetingDraft(e.target.value)
                                }
                                onBlur={() => void handleCustomGreetingCommit()}
                                placeholder="e.g. Dear"
                                className="mt-2 w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2.5 text-[19px] font-medium text-white/78 outline-none transition-[border-color,background-color] duration-200 placeholder:text-white/24 hover:border-white/18 focus-visible:border-white/26 focus-visible:ring-2 focus-visible:ring-white/12 focus-visible:ring-offset-0"
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <div className="block">
                        <span className="mb-2 block text-[17px] text-white/44 font-sans">
                          Closing style
                        </span>
                        <label className="block">
                          <select
                            value={settings.formattingEmailClosingStyle}
                            onChange={handleFormattingEmailClosingStyleChange}
                            className={devPreviewSelectClass}
                            aria-label="Preferred email closing style"
                          >
                            {FORMATTING_CLOSING_STYLE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <AnimatePresence>
                          {settings.formattingEmailClosingStyle === "custom" && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18 }}
                              className="overflow-hidden"
                            >
                              <input
                                type="text"
                                value={customClosingDraft}
                                onChange={(e) =>
                                  setCustomClosingDraft(e.target.value)
                                }
                                onBlur={() => void handleCustomClosingCommit()}
                                placeholder="e.g. Cheers"
                                className="mt-2 w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2.5 text-[19px] font-medium text-white/78 outline-none transition-[border-color,background-color] duration-200 placeholder:text-white/24 hover:border-white/18 focus-visible:border-white/26 focus-visible:ring-2 focus-visible:ring-white/12 focus-visible:ring-offset-0"
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    <p className={settingsHelperClass}>
                      The formatter keeps the input language and only fills in
                      missing pieces like greeting, sign-off, and spacing.
                    </p>
                  </div>
                </>
              )}

              {activeCategory === "shortcuts" && (
                <>
                  <div className="mb-8">
                    <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                      Main shortcut
                    </h2>
                    <ShortcutPicker
                      value={settings.shortcutId}
                      onChange={handleShortcutChange}
                    />
                    <p className={settingsHelperClass}>
                      {dictationShortcutBehaviorHint()}
                    </p>
                  </div>

                  <div className="mb-8">
                    <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                      Hold-only shortcut
                    </h2>
                    <HoldOnlyShortcutPicker
                      value={settings.shortcutHoldOnlyId}
                      mainShortcutId={settings.shortcutId}
                      onChange={handleHoldOnlyShortcutChange}
                    />
                    <p className={settingsHelperClass}>
                      {dictationHoldOnlyShortcutHint()}
                    </p>
                  </div>
                </>
              )}

              {activeCategory === "audio" && (
                <>
                  <div className="mb-8">
                    <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                      Input Device
                    </h2>
                    <DevicePicker
                      devices={deviceInfo?.devices ?? {}}
                      selectedDevice={deviceInfo?.selectedDevice ?? 0}
                      onChange={handleDeviceChange}
                    />
                    <p className={settingsHelperClass}>
                      Microphone used for dictation. Updates automatically when
                      devices change.
                    </p>
                  </div>

                  <div className="mb-8">
                    <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                      Audio Ducking
                    </h2>
                    <div className="rounded-xl border border-white/11 bg-white/4 overflow-hidden divide-y divide-white/8">
                      <div className="px-4 py-3.5">
                        <span className="block text-[21px] font-medium text-white/62">
                          Built-in speakers
                        </span>
                        <span className="mt-0.5 block text-[17px] text-white/40 leading-snug">
                          Always fully muted while recording.
                        </span>
                      </div>
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="flex-1 min-w-0">
                          <span
                            className={`block text-[21px] font-medium ${settings.audioDuckingIncludeHeadphones ? "text-white/78" : "text-white/58"}`}
                          >
                            Headphones & Bluetooth
                          </span>
                          <span className="mt-0.5 block text-[17px] text-white/40 leading-snug">
                            Also lower headphone volume while recording.
                          </span>
                        </div>
                        <button
                          onClick={handleAudioDuckingIncludeHeadphonesToggle}
                          className={`relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer border ${
                            settings.audioDuckingIncludeHeadphones
                              ? "bg-blue-500/30 border-blue-400/30"
                              : "bg-white/7 border-white/14"
                          }`}
                          aria-label="Toggle ducking for headphones"
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
                              settings.audioDuckingIncludeHeadphones
                                ? "left-4 bg-blue-400/90"
                                : "left-0.5 bg-white/40"
                            }`}
                          />
                        </button>
                      </div>
                      <AnimatePresence>
                        {settings.audioDuckingIncludeHeadphones && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-t border-white/8 px-4 py-3.5"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[17px] text-white/44 font-sans">
                                Duck amount
                              </span>
                              <span className="text-[17px] text-white/55 font-medium tabular-nums">
                                {settings.audioDuckingLevel === 0
                                  ? "Fully mute"
                                  : settings.audioDuckingLevel === 100
                                    ? "No change"
                                    : `${100 - settings.audioDuckingLevel}% quieter`}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={settings.audioDuckingLevel}
                              onChange={handleAudioDuckingLevelChange}
                              className="w-full accent-blue-400 cursor-pointer"
                              aria-label="Headphone duck amount"
                            />
                            <div className="flex justify-between mt-1">
                              <span className="text-[14px] text-white/28">
                                Fully mute
                              </span>
                              <span className="text-[14px] text-white/28">
                                No change
                              </span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <p className={settingsHelperClass}>
                      Speaker audio is always silenced during recording. Turn on
                      headphone ducking to also lower music or other audio when
                      you dictate with headphones on.
                    </p>
                  </div>
                </>
              )}

              {activeCategory === "ui" && (
                <>
                  <div className="mb-8">
                    <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                      Recording indicator
                    </h2>
                    <div className="flex flex-col gap-2">
                      {(
                        [
                          {
                            mode: "off" as const,
                            label: "Off",
                            hint: "No floating indicator on the desktop.",
                          },
                          {
                            mode: "when-active" as const,
                            label: "When recording",
                            hint: "Shows while dictating or transcribing.",
                          },
                          {
                            mode: "always" as const,
                            label: "Always",
                            hint: "Always visible in the corner (subtle when idle).",
                          },
                        ] as const
                      ).map(({ mode, label, hint }) => {
                        const selected =
                          settings.recordingIndicatorMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() =>
                              handleRecordingIndicatorModeChange(mode)
                            }
                            className={`w-full text-left rounded-xl border px-4 py-3.5 transition-colors duration-200 cursor-pointer ${
                              selected
                                ? "border-white/22 bg-white/8"
                                : "border-white/11 bg-white/4 hover:border-white/16 hover:bg-white/6"
                            }`}
                          >
                            <span
                              className={`block text-[21px] font-medium ${selected ? "text-white/88" : "text-white/62"}`}
                            >
                              {label}
                            </span>
                            <span className="mt-0.5 block text-[17px] text-white/40 leading-snug">
                              {hint}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {activeCategory === "general" && (
                <>
                  <div className="mb-8">
                    <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                      Profile
                    </h2>
                    <div className="rounded-xl border border-white/11 bg-white/4 overflow-hidden px-4 py-3.5">
                      <label className="block">
                        <span className="mb-2 block text-[17px] text-white/44 font-sans">
                          Your name
                        </span>
                        <input
                          type="text"
                          value={userDisplayNameDraft}
                          onChange={(event) =>
                            setUserDisplayNameDraft(event.target.value)
                          }
                          onBlur={() => void handleUserDisplayNameCommit()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.currentTarget.blur();
                            }
                          }}
                          placeholder="Your name"
                          className="w-full rounded-lg border border-white/12 bg-white/5 px-4 py-3.5 text-[21px] font-medium text-white/78 outline-none transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-white/24 hover:border-white/18 hover:bg-white/7 focus-visible:border-white/26 focus-visible:ring-2 focus-visible:ring-white/12 focus-visible:ring-offset-0"
                        />
                      </label>
                    </div>
                    <p className={settingsHelperClass}>
                      Stored as a general profile value. Formatting can use it
                      for email sign-offs, and future features can reuse it
                      elsewhere.
                    </p>
                  </div>

                  <div className="mb-8">
                    <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                      Updates
                    </h2>
                    <div className="rounded-xl border border-white/11 bg-white/4 overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="shrink-0 w-4 h-4 flex items-center justify-center">
                          <UpdateIcon state={updateState} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <AnimatePresence mode="wait">
                            <motion.span
                              key={updateState}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.18 }}
                              className={`block text-[21px] font-medium ${updateStateTextClass(updateState)}`}
                            >
                              {updateStateLabel(updateState, updateMessage)}
                            </motion.span>
                          </AnimatePresence>
                        </div>
                        <UpdateAction
                          state={updateState}
                          onCheck={handleCheckForUpdates}
                          onRestart={handleApplyUpdate}
                        />
                      </div>

                      <AnimatePresence>
                        {updateState === "error" && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-t border-white/10 px-4 py-2.5"
                          >
                            <p className="text-[18px] text-orange-300/85 leading-relaxed font-sans font-normal">
                              {updateMessage ??
                                "Something went wrong. Check your internet connection and try again."}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="mb-8">
                    <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                      Diagnostics
                    </h2>
                    <div className="rounded-xl border border-white/11 bg-white/4 overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="shrink-0 w-4 h-4 flex items-center justify-center">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={
                              settings.debugMode
                                ? "text-amber-400/70"
                                : "text-white/38"
                            }
                          >
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                            <path d="M2 12l10 5 10-5" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span
                            className={`block text-[21px] font-medium ${settings.debugMode ? "text-amber-400/80" : "text-white/58"}`}
                          >
                            {settings.debugMode
                              ? "Debug logging active"
                              : "Debug logging"}
                          </span>
                        </div>
                        <button
                          onClick={handleDebugToggle}
                          className={`relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer border ${
                            settings.debugMode
                              ? "bg-amber-500/30 border-amber-400/30"
                              : "bg-white/7 border-white/14"
                          }`}
                          aria-label="Toggle debug logging"
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
                              settings.debugMode
                                ? "left-4 bg-amber-400/90"
                                : "left-0.5 bg-white/40"
                            }`}
                          />
                        </button>
                      </div>

                      <AnimatePresence>
                        {settings.debugMode && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-t border-white/10 px-4 py-3"
                          >
                            <button
                              onClick={handleCopyLog}
                              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[19px] font-medium border transition-colors duration-200 cursor-pointer ${
                                isCopied
                                  ? "bg-emerald-500/15 border-emerald-400/25 text-emerald-400/80"
                                  : "border-white/12 hover:border-white/20 bg-white/4 hover:bg-white/7 text-white/52 hover:text-white/72"
                              }`}
                            >
                              {isCopied ? (
                                <>
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  Copied to clipboard
                                </>
                              ) : (
                                <>
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <rect
                                      x="9"
                                      y="9"
                                      width="13"
                                      height="13"
                                      rx="2"
                                      ry="2"
                                    />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                  Copy log to clipboard
                                </>
                              )}
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <p className={settingsHelperClass}>
                      Records session activity. Stops automatically after 5
                      minutes. Share with support for diagnostics.
                    </p>
                  </div>

                  {showDevTools && (
                    <div className="mb-8">
                      <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
                        Development
                      </h2>
                      <div className="relative group">
                        <select
                          value={devPreviewRoute ?? ""}
                          onChange={handleDevPreviewRouteSelect}
                          className={devPreviewSelectClass}
                          aria-label="Preview root screen"
                        >
                          <option
                            value=""
                            className="bg-zinc-900 text-white/78"
                          >
                            Default (normal routing)
                          </option>
                          <option
                            value="permissions"
                            className="bg-zinc-900 text-white"
                          >
                            Permissions
                          </option>
                          <option
                            value="onboarding"
                            className="bg-zinc-900 text-white"
                          >
                            Product onboarding
                          </option>
                          <option
                            value="ready"
                            className="bg-zinc-900 text-white"
                          >
                            Ready (main)
                          </option>
                        </select>
                        <span
                          className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-white/38 transition-colors duration-200 group-hover:text-white/50 right-3.5"
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
                      <p className={settingsHelperClass}>
                        Vite dev only: jump to a root screen to iterate on UI.
                        Closes Settings. Open Settings from the menu to clear.
                      </p>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
