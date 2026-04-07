"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import type {
  AppSettings,
  AppStatus,
  RecordingIndicatorMode,
  ShortcutId,
} from "../../../shared/types";
import { shortcutDisplayKeys } from "../../../shared/shortcut-options";
import {
  completeOnboarding,
  setOnboardingIndicatorPreview,
  setRecordingIndicatorMode,
  setShortcut,
  setTranscriptionLanguage,
  setTranslateDefaultLanguage,
} from "../../rpc";
import { appEvents } from "../../app-events";
import { WordmarkCodictate } from "../Brand/WordmarkCodictate";
import { ShortcutPicker } from "../Settings/ShortcutPicker";
import { LanguagePicker } from "../Settings/LanguagePicker";
import { RecordingOrb } from "../Ready/RecordingOrb";
import { DictationShortcutStartHint } from "../Common/DictationShortcutStartHint";
import { Kbd } from "../Common/Kbd";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

type Step = 0 | 1 | 2 | 3;

const INDICATOR_ONBOARDING_OPTIONS: readonly {
  mode: RecordingIndicatorMode;
  label: string;
  hint: string;
}[] = [
  {
    mode: "always",
    label: "Always on",
    hint: "Stays in the corner; subtle while idle, active while you dictate.",
  },
  {
    mode: "when-active",
    label: "Only while dictating",
    hint: "Shows while you are recording or transcribing, then hides.",
  },
  {
    mode: "off",
    label: "Off",
    hint: "No floating indicator on the desktop.",
  },
] as const;

/** Concrete language for translate-default picker (never `auto`). */
function initialTranslateDefaultDraft(s: AppSettings): string {
  if (s.translateDefaultLanguageId && s.translateDefaultLanguageId !== "auto") {
    return s.translateDefaultLanguageId;
  }
  if (s.transcriptionLanguageId !== "auto") {
    return s.transcriptionLanguageId;
  }
  return "en";
}

export function ProductOnboardingScreen({
  settings,
}: {
  settings: AppSettings;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(0);
  const [shortcutDraft, setShortcutDraft] = useState<ShortcutId>(
    settings.shortcutId,
  );
  const [languageDraft, setLanguageDraft] = useState(() =>
    initialTranslateDefaultDraft(settings),
  );
  const [status, setStatus] = useState<AppStatus>("ready");
  const [busy, setBusy] = useState(false);
  const [dictationTrialComplete, setDictationTrialComplete] = useState(false);
  const [indicatorDraft, setIndicatorDraft] =
    useState<RecordingIndicatorMode>("always");
  const dictationEngagedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return appEvents.on("status", (s) => setStatus(s));
  }, []);

  const mergeSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      queryClient.setQueryData(
        ["settings"],
        (old: AppSettings | undefined) => ({
          ...(old ?? settings),
          ...patch,
        }),
      );
    },
    [queryClient, settings],
  );

  useEffect(() => {
    if (step === 2) {
      dictationEngagedRef.current = false;
      setDictationTrialComplete(false);
      const t = window.setTimeout(() => textareaRef.current?.focus(), 200);
      return () => window.clearTimeout(t);
    }
  }, [step]);

  useEffect(() => {
    if (step !== 2 || dictationTrialComplete) return;
    if (status === "recording" || status === "transcribing") {
      dictationEngagedRef.current = true;
    } else if (status === "ready" && dictationEngagedRef.current) {
      setDictationTrialComplete(true);
    }
  }, [status, step, dictationTrialComplete]);

  useEffect(() => {
    if (step !== 3) {
      void setOnboardingIndicatorPreview({ active: false });
      return;
    }
    void setOnboardingIndicatorPreview({ active: true, mode: indicatorDraft });
  }, [step, indicatorDraft]);

  useEffect(() => {
    return () => {
      void setOnboardingIndicatorPreview({ active: false });
    };
  }, []);

  useEffect(() => {
    setShortcutDraft(settings.shortcutId);
  }, [settings.shortcutId]);

  const handleShortcutContinue = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await setShortcut(shortcutDraft);
      if (ok) {
        mergeSettings({ shortcutId: shortcutDraft });
        setStep(1);
      }
    } finally {
      setBusy(false);
    }
  }, [mergeSettings, shortcutDraft]);

  const handleLanguageContinue = useCallback(async () => {
    setBusy(true);
    try {
      const okDefault = await setTranslateDefaultLanguage(languageDraft);
      if (!okDefault) return;
      const okAuto = await setTranscriptionLanguage("auto");
      if (!okAuto) return;
      mergeSettings({
        translateDefaultLanguageId: languageDraft,
        transcriptionLanguageId: "auto",
      });
      setStep(2);
    } finally {
      setBusy(false);
    }
  }, [languageDraft, mergeSettings]);

  const handleTryDictationContinue = useCallback(() => {
    if (!dictationTrialComplete) return;
    setStep(3);
  }, [dictationTrialComplete]);

  const handleIndicatorFinish = useCallback(async () => {
    setBusy(true);
    try {
      const okMode = await setRecordingIndicatorMode(indicatorDraft);
      if (!okMode) return;
      mergeSettings({ recordingIndicatorMode: indicatorDraft });
      const ok = await completeOnboarding();
      if (ok) {
        mergeSettings({ onboardingCompleted: true });
      }
    } finally {
      setBusy(false);
    }
  }, [mergeSettings, indicatorDraft]);

  const displayKeys = useMemo(
    () => shortcutDisplayKeys(shortcutDraft),
    [shortcutDraft],
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-codictate-page text-white select-none px-6 py-10">
      <div className="electrobun-webkit-app-region-drag absolute top-0 left-0 right-0 h-7 hover:bg-white/3 transition-colors duration-200" />
      <div className="w-full max-w-[440px] flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="flex flex-col items-center mb-6"
        >
          <WordmarkCodictate
            as="h1"
            showMark
            className="text-[22px] font-semibold tracking-tight text-white/80"
          />
          <p className="text-[18px] text-white/28 mt-1">Quick setup</p>
        </motion.div>

        <div className="flex gap-2 mb-6">
          {([0, 1, 2, 3] as const).map((i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                step === i
                  ? "w-8 bg-white/45"
                  : step > i
                    ? "w-1.5 bg-emerald-400/50"
                    : "w-1.5 bg-white/10"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="s0"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="w-full"
            >
              <p className="text-[20px] text-white/55 text-center mb-4 leading-snug">
                Choose a shortcut to dictate from any app.
              </p>
              <ShortcutPicker
                value={shortcutDraft}
                onChange={setShortcutDraft}
              />
              <div className="mx-auto mt-6 flex w-full max-w-[min(440px,calc(100%-1.5rem))] flex-col items-center gap-6">
                <div className="flex items-center gap-1.5">
                  {displayKeys.map((key, i) => (
                    <span
                      key={`onb-main-${i}-${key}`}
                      className="flex items-center gap-1.5"
                    >
                      {i > 0 && (
                        <span className="text-[18px] font-light text-white/42">
                          +
                        </span>
                      )}
                      <Kbd>{key}</Kbd>
                    </span>
                  ))}
                </div>
                <DictationShortcutStartHint align="center" />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleShortcutContinue()}
                className="mt-5 w-full py-3 rounded-xl text-[19px] font-medium bg-white/12 hover:bg-white/18 border border-white/14 text-white/85 transition-colors disabled:opacity-40"
              >
                Continue
              </button>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="s1"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="w-full"
            >
              <p className="text-[20px] text-white/55 text-center mb-4 leading-snug">
                Choose your mother toungue language or leave it at English. This
                is the language which should be translted{" "}
                <span className="font-bold">from</span>, when you use "Translate
                Mode".
              </p>
              <p className="text-[20px] text-white/50 text-center mb-4 leading-relaxed">
                You can change this anytime in settings.
              </p>
              <LanguagePicker
                value={languageDraft}
                onChange={setLanguageDraft}
                excludeAuto
                ariaLabel="Default language for translate mode"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleLanguageContinue()}
                className="mt-5 w-full py-3 rounded-xl text-[19px] font-medium bg-white/12 hover:bg-white/18 border border-white/14 text-white/85 transition-colors disabled:opacity-40"
              >
                Continue
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="s2"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="w-full flex flex-col items-center"
            >
              <p className="mb-3 text-center text-[20px] leading-snug text-white/55">
                Try dictation once to continue. Click in the box, use your
                shortcut to speak, then stop the same way when you are done.
              </p>
              <div className="mx-auto mb-4 flex w-full max-w-[min(440px,calc(100%-1.5rem))] flex-col items-center gap-6">
                <div className="flex items-center gap-1.5">
                  {displayKeys.map((key, i) => (
                    <span
                      key={`onb-try-${i}-${key}`}
                      className="flex items-center gap-1.5"
                    >
                      {i > 0 && (
                        <span className="text-[18px] font-light text-white/42">
                          +
                        </span>
                      )}
                      <Kbd>{key}</Kbd>
                    </span>
                  ))}
                </div>
                <DictationShortcutStartHint align="center" />
              </div>
              <div className="mb-3 grid w-full max-w-md grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-4 mx-auto">
                <div className="flex h-20 justify-center">
                  <RecordingOrb status={status} />
                </div>
                <span className="min-h-[1.35rem] text-left text-[17px] text-white/35 leading-snug">
                  {status === "recording" && "Listening…"}
                  {status === "transcribing" && "Transcribing…"}
                  {status === "ready" && "Idle"}
                </span>
              </div>

              <textarea
                ref={textareaRef}
                rows={6}
                placeholder="Your dictation appears here…"
                className="w-full rounded-xl border border-white/12 bg-white/4 px-4 py-3 text-[19px] text-white/85 placeholder:text-white/25 outline-none focus-visible:border-white/22 focus-visible:ring-2 focus-visible:ring-white/10 resize-y min-h-[140px] select-text"
              />

              {!dictationTrialComplete && (
                <p className="mt-4 text-center text-[16px] text-amber-200/55 leading-snug">
                  Finish one dictation session (recording or transcribing, then
                  idle) to unlock the next step.
                </p>
              )}

              <button
                type="button"
                disabled={busy || !dictationTrialComplete}
                onClick={handleTryDictationContinue}
                className="mt-5 w-full py-3 rounded-xl text-[19px] font-medium bg-white/12 hover:bg-white/18 border border-white/14 text-white/85 transition-colors disabled:opacity-40"
              >
                Continue
              </button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="s3"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="w-full flex flex-col items-center"
            >
              <p className="mb-2 text-center text-[20px] leading-snug text-white/55">
                Desktop recording indicator
              </p>
              <p className="mb-5 text-center text-[17px] leading-snug text-white/38">
                The floating chip updates on your desktop as you choose — try
                each option. You can change this anytime in settings.
              </p>
              <div className="flex w-full flex-col gap-2">
                {INDICATOR_ONBOARDING_OPTIONS.map(({ mode, label, hint }) => {
                  const selected = indicatorDraft === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setIndicatorDraft(mode)}
                      className={`w-full text-left rounded-xl border px-4 py-3.5 transition-colors duration-200 cursor-pointer ${
                        selected
                          ? "border-white/22 bg-white/8"
                          : "border-white/11 bg-white/4 hover:border-white/16 hover:bg-white/6"
                      }`}
                    >
                      <span
                        className={`block text-[19px] font-medium ${selected ? "text-white/88" : "text-white/62"}`}
                      >
                        {label}
                      </span>
                      <span className="mt-0.5 block text-[16px] text-white/40 leading-snug">
                        {hint}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleIndicatorFinish()}
                className="mt-5 w-full py-3 rounded-xl text-[19px] font-medium bg-white/12 hover:bg-white/18 border border-white/14 text-white/85 transition-colors disabled:opacity-40"
              >
                Continue to Codictate
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
