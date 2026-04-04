"use client";

import { motion } from "motion/react";
import {
  WHISPER_MODELS,
  formatModelSize,
} from "../../../shared/whisper-models";

export function ModelPicker({
  value,
  modelAvailability,
  downloadProgress,
  onSelect,
  onDownload,
  onCancelDownload,
}: {
  value: string;
  modelAvailability: Record<string, boolean>;
  downloadProgress: Record<string, number>;
  onSelect: (modelId: string) => void;
  onDownload: (modelId: string) => void;
  onCancelDownload: (modelId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {WHISPER_MODELS.map((model) => {
        const isSelected = model.id === value;
        const isAvailable =
          modelAvailability[model.id] ?? model.bundled ?? false;
        const progress = downloadProgress[model.id];
        const isDownloading = progress !== undefined;

        return (
          <motion.div
            key={model.id}
            className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors duration-200 ${
              isSelected
                ? "border-white/26 bg-white/6"
                : "border-white/11 bg-white/4"
            } ${isAvailable && !isSelected ? "hover:border-white/16 hover:bg-white/6 cursor-pointer" : ""}`}
            onClick={() => {
              if (isAvailable) onSelect(model.id);
            }}
          >
            {/* Selection indicator */}
            <div
              className="shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors duration-200"
              style={{
                borderColor: isSelected
                  ? "rgba(255,255,255,0.38)"
                  : "rgba(255,255,255,0.18)",
              }}
            >
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  className="w-2 h-2 rounded-full bg-white/60"
                />
              )}
            </div>

            {/* Label + description */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[21px] font-medium font-sans transition-colors duration-200 ${
                    isSelected ? "text-white/78" : "text-white/62"
                  }`}
                >
                  {model.label}
                </span>
                {model.bundled && (
                  <span className="px-1.5 py-0.5 rounded text-[13px] font-medium bg-white/8 text-white/38 border border-white/10">
                    Default
                  </span>
                )}
              </div>
              <span className="block text-[17px] text-white/36 font-sans leading-tight mt-0.5">
                {model.description}
              </span>

              {/* Download progress bar */}
              {isDownloading && (
                <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-white/40"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(progress * 100)}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
              )}
            </div>

            {/* Right side: size + download/cancel */}
            <div className="shrink-0 flex items-center gap-2">
              <span className="text-[17px] text-white/30 font-sans tabular-nums">
                {formatModelSize(model.sizeMB)}
              </span>

              {!isAvailable && !isDownloading && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(model.id);
                  }}
                  className="px-2.5 py-1 rounded-lg text-[17px] font-medium border border-white/12 hover:border-white/22 bg-white/4 hover:bg-white/8 text-white/52 hover:text-white/72 transition-colors duration-200 cursor-pointer"
                >
                  Download
                </button>
              )}

              {isDownloading && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelDownload(model.id);
                  }}
                  className="px-2.5 py-1 rounded-lg text-[17px] font-medium border border-white/12 hover:border-white/22 bg-white/4 hover:bg-white/8 text-white/38 hover:text-white/58 transition-colors duration-200 cursor-pointer"
                >
                  Cancel
                </button>
              )}

              {isAvailable && !isDownloading && !model.bundled && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white/28"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
