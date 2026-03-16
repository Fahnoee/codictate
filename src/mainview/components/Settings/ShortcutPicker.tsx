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

            <div className="flex items-center gap-1.5">
              {opt.keys.map((key, i) => (
                <span key={key} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span className="text-white/15 text-[10px] font-light">
                      +
                    </span>
                  )}
                  <Kbd>{key}</Kbd>
                </span>
              ))}
            </div>

            <span
              className={`text-[11px] ml-auto transition-colors duration-200 ${
                isActive ? "text-white/40" : "text-white/20"
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
