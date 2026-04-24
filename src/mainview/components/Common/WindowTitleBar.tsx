import type { CSSProperties, ReactNode } from "react";
import type { PlatformRuntime } from "../../../shared/platform";
import {
  windowClose,
  windowMinimize,
  windowToggleMaximize,
} from "../../rpc";

type WebkitDragStyle = CSSProperties & { WebkitAppRegion?: "drag" | "no-drag" };

const dragStyle: WebkitDragStyle = { WebkitAppRegion: "drag" };
const noDragStyle: WebkitDragStyle = { WebkitAppRegion: "no-drag" };

function ControlButton({
  label,
  children,
  onClick,
  danger = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={noDragStyle}
      className={`flex h-8 w-11 items-center justify-center text-[15px] leading-none transition-colors duration-150 ${
        danger
          ? "text-white/58 hover:bg-red-500/85 hover:text-white"
          : "text-white/48 hover:bg-white/10 hover:text-white/78"
      }`}
    >
      {children}
    </button>
  );
}

export function WindowTitleBar({
  platform,
}: {
  platform: PlatformRuntime | undefined;
}) {
  if (platform !== "windows") {
    return (
      <div className="electrobun-webkit-app-region-drag absolute top-0 left-0 right-0 z-50 h-7 hover:bg-white/10 transition-colors duration-200" />
    );
  }

  return (
    <div
      style={dragStyle}
      className="absolute top-0 left-0 right-0 z-50 flex h-8 items-center justify-between border-b border-white/8 bg-black/82 backdrop-blur-xl"
    >
      <div className="flex min-w-0 items-center gap-2 px-3 text-[12px] font-medium tracking-wide text-white/38">
        <span className="h-2 w-2 rounded-full bg-cyan-300/75 shadow-[0_0_12px_rgba(103,232,249,0.45)]" />
        <span>Codictate</span>
      </div>
      <div className="flex h-full items-center" style={noDragStyle}>
        <ControlButton label="Minimize" onClick={windowMinimize}>
          <span className="translate-y-[-2px]">-</span>
        </ControlButton>
        <ControlButton label="Maximize" onClick={windowToggleMaximize}>
          <span className="text-[13px]">□</span>
        </ControlButton>
        <ControlButton label="Close" onClick={windowClose} danger>
          <span className="text-[18px]">×</span>
        </ControlButton>
      </div>
    </div>
  );
}
