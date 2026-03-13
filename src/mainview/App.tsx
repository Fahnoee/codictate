export default function App() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#07090f] text-white select-none">
      {/* Icon */}
      <div className="w-14 h-14 rounded-2xl border border-white/10 flex items-center justify-center text-2xl mb-6">
        ⏺
      </div>

      {/* Title */}
      <h1 className="text-xl font-semibold tracking-tight mb-1">Codictate</h1>
      <p className="text-xs text-white/30 mb-14">Local voice dictation</p>

      {/* Shortcuts */}
      <div className="flex flex-col items-center gap-5">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Kbd>⌥</Kbd>
            <span className="text-white/20 text-xs">+</span>
            <Kbd>Space</Kbd>
          </div>
          <span className="text-xs text-white/30">Start / stop recording</span>
        </div>

        <div className="w-px h-4 bg-white/10" />

        <div className="flex flex-col items-center gap-2">
          <Kbd>Esc</Kbd>
          <span className="text-xs text-white/30">Cancel recording</span>
        </div>
      </div>

      {/* Status */}
      <div className="absolute bottom-8 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span className="text-xs text-white/25">Ready</span>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-3 py-1.5 text-xs font-mono border border-white/10 rounded-lg bg-white/4 text-white/60">
      {children}
    </kbd>
  );
}
