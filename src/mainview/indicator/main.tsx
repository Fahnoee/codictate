import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Electroview } from "electrobun/view";
import { motion } from "motion/react";
import type { AppStatus, IndicatorWebviewRPCType } from "../../shared/types";
import { VoiceActivityCore } from "../components/Common/VoiceActivityCore";
import "../indicator.css";

let pushStatus: (s: AppStatus) => void = () => {};

const rpc = Electroview.defineRPC<IndicatorWebviewRPCType>({
  handlers: {
    messages: {
      updateStatus: ({ status }) => {
        pushStatus(status);
      },
    },
  },
});

new Electroview({ rpc });

function IndicatorChip({ status }: { status: AppStatus }) {
  const [hovered, setHovered] = useState(false);
  const label =
    status === "recording"
      ? "Recording"
      : status === "transcribing"
        ? "Transcribing"
        : "Idle";
  const isIdle = status === "ready";
  const chipSize = isIdle && !hovered ? 38 : 56;
  const coreScale = isIdle && !hovered ? 0.76 : 1;

  return (
    <div className="flex h-full w-full items-center justify-center">
      <motion.div
        className="pointer-events-auto electrobun-webkit-app-region-drag flex shrink-0 cursor-grab items-center justify-center rounded-full bg-black shadow-[0_6px_28px_rgb(0_0_0/0.55)] active:cursor-grabbing"
        role="status"
        aria-label={label}
        animate={{
          width: chipSize,
          height: chipSize,
          boxShadow:
            isIdle && !hovered
              ? "0 3px 10px rgb(0 0 0 / 0.35)"
              : "0 4px 14px rgb(0 0 0 / 0.45)",
        }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
      >
        <motion.div
          animate={{ scale: coreScale }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <VoiceActivityCore status={status} variant="indicator" />
        </motion.div>
      </motion.div>
    </div>
  );
}

function App() {
  const [status, setStatus] = useState<AppStatus>("ready");

  useEffect(() => {
    pushStatus = setStatus;
    return () => {
      pushStatus = () => {};
    };
  }, []);

  return <IndicatorChip status={status} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
