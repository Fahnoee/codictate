"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import type { AppSettings, AppStatus, ShortcutId } from "../../../shared/types";
import { shortcutDisplayKeys } from "../../../shared/shortcut-options";
import {
  completeOnboarding,
  setShortcut,
  setTranscriptionLanguage,
  setTranslateDefaultLanguage,
} from "../../rpc";
import { appEvents } from "../../app-events";
import { WordmarkCodictate } from "../Brand/WordmarkCodictate";
import { ShortcutPicker } from "../Settings/ShortcutPicker";
import { LanguagePicker } from "../Settings/LanguagePicker";
import { RecordingOrb } from "../Ready/RecordingOrb";
import { Kbd } from "../Common/Kbd";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

type Step = 0 | 1 | 2;

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
      const t = window.setTimeout(() => textareaRef.current?.focus(), 200);
      return () => window.clearTimeout(t);
    }
  }, [step]);

  const handleShortcutContinue = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await setShortcut(shortcutDraft);
      if (ok) mergeSettings({ shortcutId: shortcutDraft });
      setStep(1);
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

  const finishOnboarding = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await completeOnboarding();
      if (ok) {
        mergeSettings({ onboardingCompleted: true });
      }
    } finally {
      setBusy(false);
    }
  }, [mergeSettings]);

  const keys = shortcutDisplayKeys(shortcutDraft);

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
          {([0, 1, 2] as const).map((i) => (
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
                Choose the shortcut you&apos;ll hold to dictate from any app.
              </p>
              <ShortcutPicker
                value={shortcutDraft}
                onChange={setShortcutDraft}
              />
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
              <p className="text-[16px] text-white/28 text-center mb-4 leading-relaxed">
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
              <p className="text-[20px] text-white/55 text-center mb-1 leading-snug">
                Click in the box below, use your shortcut:{" "}
                <span className="inline-flex items-center gap-1 align-middle">
                  {keys.map((k, idx) => (
                    <span key={k} className="inline-flex items-center gap-1">
                      {idx > 0 && (
                        <span className="text-white/35 text-[17px]">+</span>
                      )}
                      <Kbd>{k}</Kbd>
                    </span>
                  ))}
                </span>
                And start dictating.
              </p>
              <p className="text-[18px] text-white/50 text-center mb-4 leading-relaxed">
                Press to record, press again to stop, and Codictate will
                transcribe for you.
              </p>

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

              <div className="flex flex-col gap-2 mt-5 w-full">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void finishOnboarding()}
                  className="w-full py-3 rounded-xl text-[19px] font-medium bg-white/12 hover:bg-white/18 border border-white/14 text-white/85 transition-colors disabled:opacity-40"
                >
                  Continue to Codictate
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void finishOnboarding()}
                  className="text-[17px] text-white/30 hover:text-white/45 transition-colors py-1"
                >
                  Skip try-out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
