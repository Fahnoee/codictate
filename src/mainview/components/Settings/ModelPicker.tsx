"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  SPEECH_MODELS,
  formatModelSize,
  parakeetSupportedLanguagesTooltipText,
} from "../../../shared/speech-models";
import { InstantTooltip } from "../Common/InstantTooltip";

export function ModelPicker({
  value,
  modelAvailability,
  downloadProgress,
  onSelect,
  onDownload,
  onCancelDownload,
  onDelete,
}: {
  value: string;
  modelAvailability: Record<string, boolean>;
  downloadProgress: Record<string, number>;
  onSelect: (modelId: string) => void;
  onDownload: (modelId: string) => void;
  onCancelDownload: (modelId: string) => void;
  onDelete: (modelId: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const parakeetLangsTooltip = parakeetSupportedLanguagesTooltipText();

  return (
    <div className="flex flex-col gap-1">
      {SPEECH_MODELS.map((model) => {
        const isSelected = model.id === value;
        const isAvailable =
          modelAvailability[model.id] ?? model.bundled ?? false;
        const progress = downloadProgress[model.id];
        const isDownloading = progress !== undefined;
        const isDeletable = isAvailable && !model.bundled && !isSelected;
        const isPendingDelete = confirmDelete === model.id;
        const streamLabel =
          model.modeSupport === "both" || model.modeSupport === "stream"
            ? "Stream"
            : null;

        return (
          <motion.div
            key={model.id}
            className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors duration-200 ${
              isSelected
                ? "border-white/26 bg-white/6"
                : "border-white/11 bg-white/4"
            } ${isAvailable && !isSelected ? "hover:border-white/16 hover:bg-white/6 cursor-pointer" : ""}`}
            onClick={() => {
              if (confirmDelete) {
                setConfirmDelete(null);
                return;
              }
              if (isAvailable) onSelect(model.id);
            }}
          >
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

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-[21px] font-medium font-sans transition-colors duration-200 ${
                    isSelected ? "text-white/78" : "text-white/62"
                  }`}
                >
                  {model.label}
                </span>
                {model.engine === "whisperkit" && (
                  <InstantTooltip
                    text={parakeetLangsTooltip}
                    side="bottom"
                    tooltipClassName="pointer-events-auto w-[min(100vw-2rem,26rem)] max-h-[min(55vh,22rem)] overflow-y-auto whitespace-pre-line"
                  >
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-white/12 bg-white/5 text-white/38 hover:text-white/55 hover:border-white/18 hover:bg-white/7 focus-visible:border-white/26 focus-visible:ring-2 focus-visible:ring-white/12 focus-visible:ring-offset-0 transition-[border-color,background-color,box-shadow] cursor-pointer"
                      aria-label={parakeetLangsTooltip}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4" />
                        <path d="M12 8h.01" />
                      </svg>
                    </button>
                  </InstantTooltip>
                )}
                {model.bundled && (
                  <span className="px-1.5 py-0.5 rounded text-[13px] font-medium bg-white/8 text-white/38 border border-white/10">
                    Default
                  </span>
                )}
                {streamLabel && (
                  <span className="px-1.5 py-0.5 rounded text-[13px] font-medium bg-blue-500/12 text-blue-300/55 border border-blue-400/18">
                    {streamLabel}
                  </span>
                )}
              </div>
              <span className="block text-[17px] text-white/36 font-sans leading-tight mt-0.5">
                {model.description}
              </span>

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

            <div className="shrink-0 flex items-center gap-2">
              <span className="text-[17px] text-white/30 font-sans tabular-nums">
                {formatModelSize(model.downloadSizeMB)}
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

              {isDeletable && !isPendingDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(model.id);
                  }}
                  className="px-2.5 py-1 rounded-lg text-[17px] font-medium border border-white/8 hover:border-red-400/28 bg-white/3 hover:bg-red-500/10 text-white/28 hover:text-red-400/70 transition-colors duration-200 cursor-pointer"
                  aria-label={`Remove ${model.label} model`}
                >
                  Remove
                </button>
              )}

              {isDeletable && isPendingDelete && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] text-white/40">Sure?</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(null);
                      onDelete(model.id);
                    }}
                    className="px-2.5 py-1 rounded-lg text-[17px] font-medium border border-red-400/30 bg-red-500/15 hover:bg-red-500/25 text-red-400/80 hover:text-red-400 transition-colors duration-200 cursor-pointer"
                  >
                    Delete
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(null);
                    }}
                    className="px-2.5 py-1 rounded-lg text-[17px] font-medium border border-white/10 bg-white/3 hover:bg-white/6 text-white/38 hover:text-white/58 transition-colors duration-200 cursor-pointer"
                  >
                    Keep
                  </button>
                </div>
              )}

              {isAvailable &&
                !isDownloading &&
                !model.bundled &&
                isSelected && (
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
