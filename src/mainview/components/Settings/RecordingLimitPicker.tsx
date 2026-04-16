import { motion } from "motion/react";
import {
  RECORDING_DURATION_PRESET_SECONDS,
  formatRecordingDurationLabel,
} from "../../../shared/recording-duration-presets";

export function RecordingLimitPicker({
  valueSeconds,
  onChange,
}: {
  valueSeconds: number;
  onChange: (seconds: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {RECORDING_DURATION_PRESET_SECONDS.map((seconds) => {
        const isActive = seconds === valueSeconds;
        const label = formatRecordingDurationLabel(seconds);
        return (
          <motion.button
            key={seconds}
            type="button"
            onClick={() => onChange(seconds)}
            className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors duration-200 cursor-pointer ${
              isActive
                ? "border-white/26 bg-white/6"
                : "border-white/11 bg-white/4 hover:border-white/16 hover:bg-white/6"
            }`}
          >
            <div
              className="shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors duration-200"
              style={{
                borderColor: isActive
                  ? "rgba(255,255,255,0.38)"
                  : "rgba(255,255,255,0.18)",
              }}
            >
              {isActive && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  className="w-2 h-2 rounded-full bg-white/60"
                />
              )}
            </div>
            <span
              className={`text-[21px] font-medium font-sans transition-colors duration-200 ${
                isActive ? "text-white/78" : "text-white/62"
              }`}
            >
              {label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
