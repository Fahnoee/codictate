import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import type { AppSettings, DevAppPreviewRoute } from "../../../shared/types";
import {
  DEFAULT_MODEL_ID,
  DEFAULT_TRANSLATE_DOWNLOAD_MODEL_ID,
  LARGE_V3_Q5_MODEL_ID,
  getTranslateReadiness,
  getWhisperModel,
  isTranslateCapableModelId,
} from "../../../shared/whisper-models";
import {
  SPEECH_MODELS,
  coerceTranscriptionLanguageIdForModel,
} from "../../../shared/speech-models";
import {
  cancelModelDownload,
  deleteWhisperModel,
  downloadWhisperModel,
  fetchSettings,
  setStreamMode,
  setTranscriptionLanguage,
  setTranslateToEnglish,
  setWhisperModel,
} from "../../rpc";
import { appEvents } from "../../app-events";
import {
  WordmarkCodictate,
  wordmarkCodictateTypographyClass,
} from "../Brand/WordmarkCodictate";
import { SectionTranscription } from "./Sections/SectionTranscription";
import { SectionModes } from "./Sections/SectionModes";
import { SectionFormatting } from "./Sections/SectionFormatting";
import { SectionShortcuts } from "./Sections/SectionShortcuts";
import { SectionAudio } from "./Sections/SectionAudio";
import { SectionUi } from "./Sections/SectionUi";
import { SectionGeneral } from "./Sections/SectionGeneral";
import { SectionFun } from "./Sections/SectionFun";
import { SectionDictionary } from "./Sections/SectionDictionary";

export type SettingsCategory =
  | "transcription"
  | "modes"
  | "formatting"
  | "shortcuts"
  | "audio"
  | "ui"
  | "general"
  | "dictionary"
  | "fun";

const SECRET_UNLOCK_CLICK_COUNT = 3;
const SECRET_UNLOCK_WINDOW_MS = 900;

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
        <polyline points="4 7 4 4 20 4 20 7" />
        <line x1="9" x2="15" y1="20" y2="20" />
        <line x1="12" x2="12" y1="4" y2="20" />
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
    id: "dictionary",
    label: "Dictionary",
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
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
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

export function SettingsScreen({
  settings,
  onBack,
  initialCategory,
  devPreviewRoute = null,
  onDevPreviewRouteChange,
}: {
  settings: AppSettings;
  onBack: () => void;
  initialCategory?: SettingsCategory;
  devPreviewRoute?: DevAppPreviewRoute | null;
  onDevPreviewRouteChange?: (route: DevAppPreviewRoute | null) => void;
}) {
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(
    initialCategory ?? "transcription",
  );
  const [funModeUnlocked, setFunModeUnlocked] = useState(false);
  const logoClickCountRef = useRef(0);
  const logoClickResetTimerRef = useRef<number | null>(null);

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
  /** Model id being downloaded to satisfy a translate toggle, if any. */
  const translatePendingRef = useRef<string | null>(null);
  const [translateDownloadModelId, setTranslateDownloadModelId] = useState<
    string | null
  >(null);

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

  const handleWordmarkSecretTap = useCallback(() => {
    if (logoClickResetTimerRef.current !== null) {
      window.clearTimeout(logoClickResetTimerRef.current);
    }
    logoClickCountRef.current += 1;
    if (logoClickCountRef.current >= SECRET_UNLOCK_CLICK_COUNT) {
      logoClickCountRef.current = 0;
      logoClickResetTimerRef.current = null;
      setFunModeUnlocked(true);
      setActiveCategory("fun");
      return;
    }
    logoClickResetTimerRef.current = window.setTimeout(() => {
      logoClickCountRef.current = 0;
      logoClickResetTimerRef.current = null;
    }, SECRET_UNLOCK_WINDOW_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (logoClickResetTimerRef.current !== null) {
        window.clearTimeout(logoClickResetTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-codictate-page text-white select-none">
      <div className="electrobun-webkit-app-region-drag absolute top-0 left-0 right-0 z-50 h-7 hover:bg-white/10 transition-colors duration-200" />

      {/* Sidebar */}
      <div className="flex w-[248px] shrink-0 flex-col border-r border-white/10 bg-white/2 px-3 pb-6 pt-10">
        <div className="mb-8">
          <button
            type="button"
            onClick={handleWordmarkSecretTap}
            className="cursor-pointer rounded-lg outline-none transition-opacity duration-200 hover:opacity-95 focus-visible:ring-2 focus-visible:ring-white/20"
            aria-label="Codictate"
          >
            <WordmarkCodictate
              as="h1"
              className={`text-[30px] ${wordmarkCodictateTypographyClass}`}
            />
          </button>
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
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-16 pt-12 sm:px-8 lg:px-12">
        <div className="w-full max-w-[820px] mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {activeCategory === "transcription" && (
                <SectionTranscription
                  settings={settings}
                  modelAvailability={modelAvailability}
                  downloadProgress={downloadProgress}
                  onModelSelect={handleModelSelect}
                  onModelDownload={handleModelDownload}
                  onCancelDownload={handleCancelDownload}
                  onModelDelete={handleModelDelete}
                />
              )}

              {activeCategory === "modes" && (
                <SectionModes
                  settings={settings}
                  modelAvailability={modelAvailability}
                  downloadProgress={downloadProgress}
                  translateDownloadModelId={translateDownloadModelId}
                  onTranslateToggle={handleTranslateToggle}
                  onCancelDownload={handleCancelDownload}
                />
              )}

              {activeCategory === "formatting" && (
                <SectionFormatting settings={settings} />
              )}

              {activeCategory === "shortcuts" && (
                <SectionShortcuts settings={settings} />
              )}

              {activeCategory === "audio" && (
                <SectionAudio settings={settings} />
              )}

              {activeCategory === "ui" && <SectionUi settings={settings} />}

              {activeCategory === "general" && (
                <SectionGeneral
                  settings={settings}
                  devPreviewRoute={devPreviewRoute}
                  onDevPreviewRouteChange={onDevPreviewRouteChange}
                />
              )}

              {activeCategory === "dictionary" && (
                <SectionDictionary settings={settings} />
              )}

              {activeCategory === "fun" && funModeUnlocked && (
                <SectionFun
                  settings={settings}
                  onBackToSettings={() => setActiveCategory("general")}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
