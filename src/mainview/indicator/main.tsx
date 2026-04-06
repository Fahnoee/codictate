import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Electroview } from "electrobun/view";
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
  const label =
    status === "recording"
      ? "Recording"
      : status === "transcribing"
        ? "Transcribing"
        : "Idle";

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full bg-black shadow-[0_6px_28px_rgb(0_0_0/0.55)]"
        role="status"
        aria-label={label}
      >
        <VoiceActivityCore status={status} variant="indicator" />
      </div>
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
