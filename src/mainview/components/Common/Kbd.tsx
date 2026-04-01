export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[38px] h-9 px-2.5 text-[19px] font-mono text-white/35 border border-white/10 rounded-md bg-white/4 leading-none">
      {children}
    </kbd>
  );
}
