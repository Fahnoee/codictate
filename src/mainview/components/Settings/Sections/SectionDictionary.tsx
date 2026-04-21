import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AppSettings } from "../../../../shared/types";
import {
  addDictionaryEntry,
  fetchSettings,
  removeDictionaryEntry,
} from "../../../rpc";

type Props = {
  settings: AppSettings;
};

export function SectionDictionary({ settings }: Props) {
  const queryClient = useQueryClient();
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback(async () => {
    const word = inputValue.trim();
    if (!word) return;

    const key = word.toLowerCase();
    if (
      settings.dictionaryEntries.some((e) => e.toLowerCase() === key)
    ) {
      setInputValue("");
      return;
    }

    queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
      old
        ? { ...old, dictionaryEntries: [...old.dictionaryEntries, word] }
        : old,
    );
    setInputValue("");

    const ok = await addDictionaryEntry(word);
    if (!ok) {
      const fresh = await fetchSettings();
      queryClient.setQueryData(["settings"], fresh);
    }
  }, [inputValue, queryClient, settings.dictionaryEntries]);

  const handleRemove = useCallback(
    async (word: string) => {
      queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
        old
          ? {
              ...old,
              dictionaryEntries: old.dictionaryEntries.filter(
                (e) => e.toLowerCase() !== word.toLowerCase(),
              ),
            }
          : old,
      );

      const ok = await removeDictionaryEntry(word);
      if (!ok) {
        const fresh = await fetchSettings();
        queryClient.setQueryData(["settings"], fresh);
      }
    },
    [queryClient],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleAdd();
    },
    [handleAdd],
  );

  return (
    <>
      <div className="mb-6">
        <span className="block text-[16px] uppercase tracking-[0.18em] text-white/38">
          Settings
        </span>
        <h2 className="mt-2 text-[34px] tracking-tight text-white/90">
          Dictionary
        </h2>
        <p className="mt-3 text-[18px] text-white/44 leading-relaxed font-sans font-normal">
          Add words or phrases that should always be transcribed correctly.
          Codictate will automatically fix similar-sounding mishearings.
        </p>
      </div>

      {/* Input row */}
      <div className="mb-6 flex gap-3">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Electrobun"
          className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-[18px] text-white/90 placeholder-white/28 outline-none transition-[border-color,background-color] duration-200 hover:border-white/18 hover:bg-white/7 focus-visible:border-white/26 focus-visible:ring-2 focus-visible:ring-white/12"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!inputValue.trim()}
          className="shrink-0 rounded-xl border border-white/14 bg-white/7 px-5 py-3 text-[17px] font-medium text-white/75 transition-colors duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {/* Entries list */}
      <div className="overflow-hidden rounded-xl border border-white/11 bg-white/4">
        {settings.dictionaryEntries.length === 0 ? (
          <div className="px-5 py-8 text-center text-[17px] text-white/34">
            No words added yet. Add a word above to get started.
          </div>
        ) : (
          <ul>
            {settings.dictionaryEntries.map((word, i) => (
              <li
                key={word}
                className={`flex items-center justify-between gap-4 px-5 py-4 ${
                  i > 0 ? "border-t border-white/8" : ""
                }`}
              >
                <span className="text-[18px] font-medium text-white/85">
                  {word}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(word)}
                  aria-label={`Remove ${word}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/40 transition-colors duration-200 hover:border-white/18 hover:bg-white/8 hover:text-white/70"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
