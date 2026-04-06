"use client";

import { motion } from "motion/react";
import type { ShortcutId } from "../../../shared/types";
import { shortcutOptionsGrouped } from "../../../shared/shortcut-options";
import { Kbd } from "../Common/Kbd";

export function ShortcutPicker({
  value,
  onChange,
}: {
  value: ShortcutId;
  onChange: (id: ShortcutId) => void;
}) {
  const groups = shortcutOptionsGrouped();

  return (
    <div
      className="max-h-[min(340px,52vh)] overflow-y-auto overflow-x-hidden rounded-xl border border-white/8 bg-white/2 pr-1 -mr-1 [scrollbar-gutter:stable]"
      style={{ scrollbarWidth: "thin" }}
    >
      <div className="flex flex-col gap-4 p-1">
        {groups.map(({ family, title, options }) => (
          <div key={family}>
            <p className="px-3 pt-2 pb-1.5 text-[14px] font-medium uppercase tracking-wider text-white/36">
              {title}
            </p>
            <div className="flex flex-col gap-1">
              {options.map((opt) => {
                const isActive = opt.id === value;
                return (
                  <motion.button
                    key={opt.id}
                    type="button"
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
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 25,
                          }}
                          className="w-2 h-2 rounded-full bg-white/60"
                        />
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      {opt.keys.map((key, i) => (
                        <span
                          key={`${opt.id}-key-${i}`}
                          className="flex items-center gap-1.5"
                        >
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
                      className={`shrink-0 text-[17px] sm:text-[19px] max-w-[min(11rem,42%)] text-right font-sans transition-colors duration-200 leading-snug ${
                        isActive ? "text-white/72" : "text-white/56"
                      }`}
                    >
                      {opt.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
