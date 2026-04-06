import { motion, AnimatePresence } from "motion/react";
import type { AppStatus } from "../../../shared/types";
import { VoiceActivityCore } from "../Common/VoiceActivityCore";

export function RecordingOrb({ status }: { status: AppStatus }) {
  const isRecording = status === "recording";
  const isTranscribing = status === "transcribing";

  return (
    <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
      <AnimatePresence>
        {isRecording && (
          <motion.span
            key="pulse-ring"
            className="absolute inset-0 rounded-full border border-red-500/30"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1.35, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isRecording && (
          <motion.span
            key="mid-ring"
            className="absolute inset-0 rounded-full border border-red-500/20"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1.18, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: "easeOut",
              delay: 0.35,
            }}
          />
        )}
      </AnimatePresence>

      <motion.div
        className={`relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border transition-colors duration-500 ${
          isRecording
            ? "border-red-500/25 bg-red-500/8"
            : isTranscribing
              ? "border-amber-400/20 bg-amber-400/5"
              : "border-white/8 bg-white/3"
        }`}
        style={{ transformOrigin: "center center" }}
        animate={{
          scale: isRecording ? [1, 1.04, 1] : 1,
        }}
        transition={
          isRecording
            ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      >
        <VoiceActivityCore status={status} variant="ready" />
      </motion.div>
    </div>
  );
}
