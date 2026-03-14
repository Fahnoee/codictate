import { motion, AnimatePresence } from "motion/react";
import type { AppStatus } from "../../../shared/types";

export function RecordingOrb({ status }: { status: AppStatus }) {
  const isRecording = status === "recording";
  const isTranscribing = status === "transcribing";

  return (
    <div className="relative flex items-center justify-center w-20 h-20">
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
        layout
        className={`relative z-10 w-14 h-14 rounded-full border flex items-center justify-center transition-colors duration-500 ${
          isRecording
            ? "border-red-500/25 bg-red-500/8"
            : isTranscribing
              ? "border-amber-400/20 bg-amber-400/5"
              : "border-white/8 bg-white/3"
        }`}
        animate={{
          scale: isRecording ? [1, 1.04, 1] : 1,
        }}
        transition={
          isRecording
            ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      >
        {isTranscribing ? (
          <motion.div
            className="flex items-end gap-[2px] h-4"
            initial="hidden"
            animate="visible"
          >
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="block w-[3px] rounded-full bg-amber-400/60"
                animate={{ scaleY: [0.3, 1, 0.3] }}
                transition={{
                  duration: 0.9,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }}
                style={{ height: "100%", transformOrigin: "bottom" }}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div
            className="flex items-end gap-[2px] h-4"
            animate={isRecording ? "active" : "idle"}
          >
            {[0.45, 0.75, 1, 0.7, 0.5].map((base, i) => (
              <motion.span
                key={i}
                className={`block w-[3px] rounded-full transition-colors duration-500 ${isRecording ? "bg-red-400/70" : "bg-white/15"}`}
                animate={
                  isRecording
                    ? {
                        scaleY: [base, base * 0.4 + 0.1, base + 0.2, base],
                      }
                    : { scaleY: base }
                }
                transition={
                  isRecording
                    ? {
                        duration: 0.6 + i * 0.07,
                        repeat: Infinity,
                        delay: i * 0.1,
                        ease: "easeInOut",
                      }
                    : { duration: 0.4 }
                }
                style={{ height: "100%", transformOrigin: "bottom" }}
              />
            ))}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
