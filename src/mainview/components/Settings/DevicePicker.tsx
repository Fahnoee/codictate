"use client";

import { motion } from "motion/react";

interface DevicePickerProps {
  devices: Record<string, string>;
  selectedDevice: number;
  onChange: (index: number) => void;
}

export function DevicePicker({
  devices,
  selectedDevice,
  onChange,
}: DevicePickerProps) {
  const entries = Object.entries(devices);

  if (entries.length === 0) {
    return (
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
          className="text-white/15 shrink-0"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
        <span className="text-[13px] text-white/25">No microphones found</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {entries.map(([indexStr, name]) => {
        const index = Number(indexStr);
        const isActive = index === selectedDevice;
        return (
          <motion.button
            key={indexStr}
            onClick={() => onChange(index)}
            className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors duration-200 cursor-pointer text-left ${
              isActive
                ? "border-white/20 bg-white/5"
                : "border-white/6 bg-white/2 hover:border-white/10 hover:bg-white/3"
            }`}
          >
            <div
              className="shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors duration-200"
              style={{
                borderColor: isActive
                  ? "rgba(255,255,255,0.3)"
                  : "rgba(255,255,255,0.1)",
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

            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`shrink-0 transition-colors duration-200 ${isActive ? "text-white/35" : "text-white/15"}`}
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>

            <span
              className={`text-[13px] font-medium truncate transition-colors duration-200 ${isActive ? "text-white/60" : "text-white/35"}`}
            >
              {name}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
