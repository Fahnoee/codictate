"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const VIEW_MARGIN = 10;
const ANCHOR_GAP = 6;
const FLOAT_MAX_WIDTH = 280;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Place a fixed panel so it stays inside the window; prefers `side` then flips if needed. */
function computeFloatRect(
  anchor: DOMRect,
  side: "top" | "bottom",
  panelWidth: number,
  panelHeight: number,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = clamp(panelWidth, 120, vw - 2 * VIEW_MARGIN);
  let left = anchor.left + anchor.width / 2 - w / 2;
  left = clamp(left, VIEW_MARGIN, vw - w - VIEW_MARGIN);

  const placeBelow = () => anchor.bottom + ANCHOR_GAP;
  const placeAbove = () => anchor.top - panelHeight - ANCHOR_GAP;

  let top: number;
  if (side === "bottom") {
    top = placeBelow();
    if (top + panelHeight > vh - VIEW_MARGIN) {
      top = placeAbove();
    }
  } else {
    top = placeAbove();
    if (top < VIEW_MARGIN) {
      top = placeBelow();
    }
  }
  top = clamp(top, VIEW_MARGIN, vh - panelHeight - VIEW_MARGIN);
  return { top, left };
}

/**
 * Hover/focus tooltip without the ~1–2s delay of native `title` (especially on macOS).
 * Use `floatInViewport` when a scroll parent or panel width would clip an absolutely positioned bubble.
 */
export function InstantTooltip({
  text,
  children,
  className,
  tooltipClassName,
  side = "top",
  floatInViewport = false,
  interactive = false,
}: {
  text: ReactNode;
  children: ReactNode;
  className?: string;
  /** Merged onto the tooltip panel (e.g. width, max-height, whitespace). */
  tooltipClassName?: string;
  /** `top`: prefer bubble above anchor. `bottom`: prefer below. */
  side?: "top" | "bottom";
  /** Render with `position: fixed` in `document.body` and clamp to the window (avoids overflow clipping). */
  floatInViewport?: boolean;
  /** Allows hoverable/clickable content inside the tooltip panel. */
  interactive?: boolean;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const floaterRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [floatRect, setFloatRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open || !floatInViewport) {
      setFloatRect(null);
      return;
    }
    const anchor = anchorRef.current;
    const floater = floaterRef.current;
    if (!anchor || !floater) return;

    const vw = window.innerWidth;
    const width = Math.min(FLOAT_MAX_WIDTH, vw - 2 * VIEW_MARGIN);
    const height = floater.offsetHeight;
    const r = anchor.getBoundingClientRect();
    const { top, left } = computeFloatRect(r, side, width, height);
    setFloatRect({ top, left, width });
  }, [open, floatInViewport, side, text]);

  useLayoutEffect(() => {
    if (!open || !floatInViewport) return;
    const dismiss = () => setOpen(false);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open, floatInViewport]);

  const positionClass =
    side === "top"
      ? "bottom-full left-1/2 mb-1.5 -translate-x-1/2"
      : "top-full left-1/2 mt-1.5 -translate-x-1/2";

  const bubbleBase = `${interactive ? "pointer-events-auto" : "pointer-events-none"} rounded-lg border border-white/14 bg-[#1c1c1f]/98 px-3 py-2 text-left leading-snug text-white/90 shadow-lg whitespace-normal`;

  if (floatInViewport) {
    const initialWidth =
      typeof window !== "undefined"
        ? Math.min(FLOAT_MAX_WIDTH, window.innerWidth - 2 * VIEW_MARGIN)
        : FLOAT_MAX_WIDTH;

    const portal =
      open &&
      typeof document !== "undefined" &&
      createPortal(
        <span
          ref={floaterRef}
          role="tooltip"
          style={
            floatRect
              ? {
                  position: "fixed",
                  top: floatRect.top,
                  left: floatRect.left,
                  width: floatRect.width,
                  zIndex: 10000,
                  opacity: 1,
                }
              : {
                  position: "fixed",
                  top: -9999,
                  left: 0,
                  width: initialWidth,
                  zIndex: 10000,
                  opacity: 0,
                  pointerEvents: "none",
                }
          }
          className={`${bubbleBase} text-[17px] max-h-[min(220px,38vh)] overflow-y-auto ${tooltipClassName ?? ""}`}
          onPointerEnter={interactive ? () => setOpen(true) : undefined}
          onPointerLeave={interactive ? () => setOpen(false) : undefined}
        >
          {text}
        </span>,
        document.body,
      );

    return (
      <>
        <span
          ref={anchorRef}
          className={`inline-flex max-w-full ${className ?? ""}`}
          onPointerEnter={() => setOpen(true)}
          onPointerLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        >
          {children}
        </span>
        {portal}
      </>
    );
  }

  if (!interactive) {
    return (
      <span
        className={`group relative inline-flex max-w-full ${className ?? ""}`}
      >
        {children}
        <span
          role="tooltip"
          className={`absolute ${positionClass} z-60 w-[min(100vw-2rem,15rem)] ${bubbleBase} text-[18px] opacity-0 transition-none group-hover:opacity-100 group-focus-within:opacity-100 ${tooltipClassName ?? ""}`}
        >
          {text}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`relative inline-flex max-w-full ${className ?? ""}`}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <span
        role="tooltip"
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        className={`absolute ${positionClass} z-60 w-[min(100vw-2rem,16.5rem)] ${bubbleBase} text-[17px] transition-none ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        } ${tooltipClassName ?? ""}`}
      >
        {text}
      </span>
    </span>
  );
}
