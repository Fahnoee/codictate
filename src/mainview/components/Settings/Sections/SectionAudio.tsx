import { useCallback, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import type { AppSettings } from "../../../../shared/types";
import {
  fetchDevices,
  setAudioDevice,
  setAudioDuckingIncludeBuiltInSpeakers,
  setAudioDuckingIncludeHeadphones,
  setAudioDuckingLevel,
} from "../../../rpc";
import { DevicePicker } from "../DevicePicker";
import { settingsHelperClass } from "../settings-shared";

type Props = {
  settings: AppSettings;
};

type AudioDuckingPatch = Partial<
  Pick<
    AppSettings,
    | "audioDuckingLevel"
    | "audioDuckingIncludeHeadphones"
    | "audioDuckingIncludeBuiltInSpeakers"
  >
>;

const AUDIO_DUCKING_KEYS = [
  "audioDuckingLevel",
  "audioDuckingIncludeHeadphones",
  "audioDuckingIncludeBuiltInSpeakers",
] as const;

export function SectionAudio({ settings }: Props) {
  const queryClient = useQueryClient();
  const { data: deviceInfo } = useQuery({
    queryKey: ["devices"],
    queryFn: fetchDevices,
  });

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

  const updateAudioDuckingSetting = useCallback(
    async (patch: AudioDuckingPatch, persist: () => Promise<boolean>) => {
      const settingsKey = ["settings"];
      const previous =
        queryClient.getQueryData<AppSettings>(settingsKey) ?? settings;

      queryClient.setQueryData(settingsKey, (old: AppSettings | undefined) =>
        old ? { ...old, ...patch } : old,
      );

      const ok = await persist();
      if (ok) return;

      queryClient.setQueryData(
        settingsKey,
        (current: AppSettings | undefined) => {
          if (!current) return current;

          const next = { ...current };
          let changed = false;

          for (const key of AUDIO_DUCKING_KEYS) {
            if (!(key in patch)) continue;
            if (current[key] !== patch[key]) continue;
            switch (key) {
              case "audioDuckingLevel":
                next.audioDuckingLevel = previous.audioDuckingLevel;
                break;
              case "audioDuckingIncludeHeadphones":
                next.audioDuckingIncludeHeadphones =
                  previous.audioDuckingIncludeHeadphones;
                break;
              case "audioDuckingIncludeBuiltInSpeakers":
                next.audioDuckingIncludeBuiltInSpeakers =
                  previous.audioDuckingIncludeBuiltInSpeakers;
                break;
            }
            changed = true;
          }

          return changed ? next : current;
        },
      );
    },
    [queryClient, settings],
  );

  const handleAudioDuckingLevelChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const level = Number(event.target.value);
      await updateAudioDuckingSetting({ audioDuckingLevel: level }, () =>
        setAudioDuckingLevel(level),
      );
    },
    [updateAudioDuckingSetting],
  );

  const handleAudioDuckingIncludeHeadphonesToggle = useCallback(async () => {
    const newValue = !settings.audioDuckingIncludeHeadphones;
    await updateAudioDuckingSetting(
      { audioDuckingIncludeHeadphones: newValue },
      () => setAudioDuckingIncludeHeadphones(newValue),
    );
  }, [settings.audioDuckingIncludeHeadphones, updateAudioDuckingSetting]);

  const handleAudioDuckingIncludeBuiltInToggle = useCallback(async () => {
    const newValue = !settings.audioDuckingIncludeBuiltInSpeakers;
    await updateAudioDuckingSetting(
      { audioDuckingIncludeBuiltInSpeakers: newValue },
      () => setAudioDuckingIncludeBuiltInSpeakers(newValue),
    );
  }, [settings.audioDuckingIncludeBuiltInSpeakers, updateAudioDuckingSetting]);

  return (
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
          Microphone used for dictation. Updates automatically when devices
          change.
        </p>
      </div>

      <div className="mb-8">
        <h2 className="text-[18px] text-white/48 font-medium uppercase tracking-wider mb-3">
          Audio Ducking
        </h2>
        <div className="rounded-xl border border-white/11 bg-white/4 overflow-hidden divide-y divide-white/8">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex-1 min-w-0">
              <span
                className={`block text-[21px] font-medium ${settings.audioDuckingIncludeBuiltInSpeakers ? "text-white/78" : "text-white/58"}`}
              >
                Built-in speakers
              </span>
              <span className="mt-0.5 block text-[17px] text-white/40 leading-snug">
                Mute Mac speaker output while dictating (classic recording and
                stream mode).
              </span>
            </div>
            <button
              onClick={handleAudioDuckingIncludeBuiltInToggle}
              className={`relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer border ${
                settings.audioDuckingIncludeBuiltInSpeakers
                  ? "bg-blue-500/30 border-blue-400/30"
                  : "bg-white/7 border-white/14"
              }`}
              aria-label="Toggle ducking for built-in speakers"
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
                  settings.audioDuckingIncludeBuiltInSpeakers
                    ? "left-4 bg-blue-400/90"
                    : "left-0.5 bg-white/40"
                }`}
              />
            </button>
          </div>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex-1 min-w-0">
              <span
                className={`block text-[21px] font-medium ${settings.audioDuckingIncludeHeadphones ? "text-white/78" : "text-white/58"}`}
              >
                Headphones & Bluetooth
              </span>
              <span className="mt-0.5 block text-[17px] text-white/40 leading-snug">
                Also lower headphone volume while dictating (classic recording
                and stream mode).
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
                  <span className="text-[14px] text-white/28">Fully mute</span>
                  <span className="text-[14px] text-white/28">No change</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <p className={settingsHelperClass}>
          Turn off built-in ducking if you want music or system audio to keep
          playing on Mac speakers. Turn on headphone ducking to lower Bluetooth,
          USB, or wired headphone volume while you dictate.
        </p>
      </div>
    </>
  );
}
