export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 text-[11px] font-mono text-white/35 border border-white/10 rounded-md bg-white/4 leading-none">
      {children}
    </kbd>
  );
}
