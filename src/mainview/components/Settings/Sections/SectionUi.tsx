import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AppSettings,
  RecordingIndicatorMode,
} from "../../../../shared/types";
import { fetchSettings, setRecordingIndicatorMode } from "../../../rpc";

type Props = {
  settings: AppSettings;
};

const INDICATOR_OPTIONS = [
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
];

export function SectionUi({ settings }: Props) {
  const queryClient = useQueryClient();

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

  return (
    <div className="mb-8">
      <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
        Recording indicator
      </h2>
      <div className="flex flex-col gap-2">
        {INDICATOR_OPTIONS.map(({ mode, label, hint }) => {
          const selected = settings.recordingIndicatorMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => handleRecordingIndicatorModeChange(mode)}
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
  );
}
