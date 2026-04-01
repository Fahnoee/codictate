"use client";

import { motion } from "motion/react";
import type { ShortcutId } from "../../../shared/types";
import { Kbd } from "../Common/Kbd";

interface ShortcutOption {
  id: ShortcutId;
  keys: string[];
  label: string;
}

const OPTIONS: ShortcutOption[] = [
  { id: "option-space", keys: ["⌥", "Space"], label: "Option + Space" },
  { id: "right-option", keys: ["Right ⌥"], label: "Right Option key" },
  { id: "option-f1", keys: ["⌥", "F1"], label: "Option + F1" },
  { id: "option-f2", keys: ["⌥", "F2"], label: "Option + F2" },
  { id: "option-enter", keys: ["⌥", "Enter"], label: "Option + Enter" },
];

export function ShortcutPicker({
  value,
  onChange,
}: {
  value: ShortcutId;
  onChange: (id: ShortcutId) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {OPTIONS.map((opt) => {
        const isActive = opt.id === value;
        return (
          <motion.button
            key={opt.id}
            onClick={() => onChange(opt.id)}
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

            <div className="flex items-center gap-1.5">
              {opt.keys.map((key, i) => (
                <span key={key} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span className="text-white/40 text-[18px] font-light">
                      +
                    </span>
                  )}
                  <Kbd>{key}</Kbd>
                </span>
              ))}
            </div>

            <span
              className={`text-[19px] ml-auto font-sans transition-colors duration-200 ${
                isActive ? "text-white/72" : "text-white/56"
              }`}
            >
              {opt.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
