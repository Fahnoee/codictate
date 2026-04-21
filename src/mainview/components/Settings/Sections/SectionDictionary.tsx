import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AppSettings,
  DictionaryCandidate,
  DictionaryEntry,
} from "../../../../shared/types";
import {
  addDictionaryEntry,
  fetchSettings,
  removeDictionaryCandidate,
  removeDictionaryEntry,
  setDictionaryAutoLearn,
} from "../../../rpc";

type Props = {
  settings: AppSettings;
};

function SparkleIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-label="Auto-learned"
    >
      <path d="M12 2l2.09 6.26L21 10l-6.91 1.74L12 18l-2.09-6.26L3 10l6.91-1.74L12 2z" />
    </svg>
  );
}

export function SectionDictionary({ settings }: Props) {
  const queryClient = useQueryClient();
  const dictionary = settings.dictionary;
  const [entryKind, setEntryKind] = useState<DictionaryEntry["kind"]>("fuzzy");
  const [inputValue, setInputValue] = useState("");
  const [replacementFromValue, setReplacementFromValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const entryKey = useCallback(
    (entry: Pick<DictionaryEntry, "kind" | "text" | "from">) => {
      return entry.kind === "replacement"
        ? `replacement:${(entry.from ?? "").trim().toLowerCase()}=>${entry.text
            .trim()
            .toLowerCase()}`
        : `fuzzy:${entry.text.trim().toLowerCase()}`;
    },
    [],
  );

  const handleAdd = useCallback(async () => {
    const text = inputValue.trim();
    const from = replacementFromValue.trim();
    if (!text) return;
    if (entryKind === "replacement" && !from) return;

    const nextEntry: DictionaryEntry =
      entryKind === "replacement"
        ? { kind: "replacement", from, text, source: "manual" }
        : { kind: "fuzzy", text, source: "manual" };

    if (dictionary.entries.some((e) => entryKey(e) === entryKey(nextEntry))) {
      setInputValue("");
      setReplacementFromValue("");
      return;
    }

    queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
      old
        ? {
            ...old,
            dictionary: {
              ...old.dictionary,
              entries: [...old.dictionary.entries, nextEntry],
            },
          }
        : old,
    );
    setInputValue("");
    setReplacementFromValue("");

    const ok = await addDictionaryEntry(
      entryKind === "replacement"
        ? { kind: "replacement", from, text }
        : { kind: "fuzzy", text },
    );
    if (!ok) {
      const fresh = await fetchSettings();
      queryClient.setQueryData(["settings"], fresh);
    }
  }, [
    entryKind,
    entryKey,
    inputValue,
    queryClient,
    replacementFromValue,
    dictionary.entries,
  ]);

  const handleRemove = useCallback(
    async (entry: DictionaryEntry) => {
      queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
        old
          ? {
              ...old,
              dictionary: {
                ...old.dictionary,
                entries: old.dictionary.entries.filter(
                  (e) => entryKey(e) !== entryKey(entry),
                ),
              },
            }
          : old,
      );

      const ok = await removeDictionaryEntry({
        kind: entry.kind,
        text: entry.text,
        from: entry.from,
      });
      if (!ok) {
        const fresh = await fetchSettings();
        queryClient.setQueryData(["settings"], fresh);
      }
    },
    [entryKey, queryClient],
  );

  const handleAutoLearnToggle = useCallback(async () => {
    const next = !dictionary.autoLearn;
    queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
      old
        ? {
            ...old,
            dictionary: {
              ...old.dictionary,
              autoLearn: next,
            },
          }
        : old,
    );
    const ok = await setDictionaryAutoLearn(next);
    if (!ok) {
      const fresh = await fetchSettings();
      queryClient.setQueryData(["settings"], fresh);
    }
  }, [dictionary.autoLearn, queryClient]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleAdd();
    },
    [handleAdd],
  );

  const hasAutoEntries = dictionary.entries.some((e) => e.source === "auto");

  const handleRemoveCandidate = useCallback(
    async (candidate: DictionaryCandidate) => {
      queryClient.setQueryData(["settings"], (old: AppSettings | undefined) =>
        old
          ? {
              ...old,
              dictionary: {
                ...old.dictionary,
                candidates: old.dictionary.candidates.filter(
                  (entry) =>
                    !(
                      entry.from.trim().toLowerCase() ===
                        candidate.from.trim().toLowerCase() &&
                      entry.to.trim().toLowerCase() ===
                        candidate.to.trim().toLowerCase()
                    ),
                ),
              },
            }
          : old,
      );

      const ok = await removeDictionaryCandidate(candidate);
      if (!ok) {
        const fresh = await fetchSettings();
        queryClient.setQueryData(["settings"], fresh);
      }
    },
    [queryClient],
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
          Add fuzzy terms for similar-sounding fixes, or exact replacements for
          things like abbreviations and learned corrections.
        </p>
      </div>

      {/* Auto-learn toggle */}
      <div className="mb-6 overflow-hidden rounded-xl border border-white/11 bg-white/4">
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <span className="block text-[18px] font-medium text-white/85">
              Auto-learn corrections
            </span>
            <span className="mt-1 block text-[16px] leading-snug text-white/44">
              Corrections are staged first and only learned after they happen
              twice. If the same raw output shows up again and you leave it
              unchanged, the pending candidate is discarded. Works in native
              macOS apps like Mail, Notes, Pages, and TextEdit. Does not work in
              browsers or Electron-based apps like Slack or VS Code.
            </span>
          </div>
          <button
            type="button"
            onClick={handleAutoLearnToggle}
            className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ${
              dictionary.autoLearn
                ? "border-white/30 bg-white/18"
                : "border-white/14 bg-white/7"
            }`}
            aria-label="Toggle auto-learn corrections"
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full transition-all duration-200 ${
                dictionary.autoLearn
                  ? "left-[21px] bg-white/90"
                  : "left-0.5 bg-white/40"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-3">
        <button
          type="button"
          onClick={() => setEntryKind("fuzzy")}
          className={`rounded-xl border px-4 py-2.5 text-[16px] transition-colors duration-200 ${
            entryKind === "fuzzy"
              ? "border-white/24 bg-white/12 text-white/88"
              : "border-white/10 bg-white/5 text-white/48 hover:border-white/16 hover:text-white/72"
          }`}
        >
          Fuzzy term
        </button>
        <button
          type="button"
          onClick={() => setEntryKind("replacement")}
          className={`rounded-xl border px-4 py-2.5 text-[16px] transition-colors duration-200 ${
            entryKind === "replacement"
              ? "border-white/24 bg-white/12 text-white/88"
              : "border-white/10 bg-white/5 text-white/48 hover:border-white/16 hover:text-white/72"
          }`}
        >
          Exact replacement
        </button>
      </div>

      {/* Input row */}
      <div className="mb-6 flex gap-3">
        {entryKind === "replacement" && (
          <input
            type="text"
            value={replacementFromValue}
            onChange={(e) => setReplacementFromValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Replace this, e.g. BTW"
            className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-[18px] text-white/90 placeholder-white/28 outline-none transition-[border-color,background-color] duration-200 hover:border-white/18 hover:bg-white/7 focus-visible:border-white/26 focus-visible:ring-2 focus-visible:ring-white/12"
          />
        )}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            entryKind === "replacement"
              ? "With this, e.g. by the way"
              : "Canonical term, e.g. Electrobun"
          }
          className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-[18px] text-white/90 placeholder-white/28 outline-none transition-[border-color,background-color] duration-200 hover:border-white/18 hover:bg-white/7 focus-visible:border-white/26 focus-visible:ring-2 focus-visible:ring-white/12"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={
            !inputValue.trim() ||
            (entryKind === "replacement" && !replacementFromValue.trim())
          }
          className="shrink-0 rounded-xl border border-white/14 bg-white/7 px-5 py-3 text-[17px] font-medium text-white/75 transition-colors duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {dictionary.candidates.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-xl border border-amber-200/12 bg-amber-200/[0.04]">
          <div className="border-b border-amber-200/10 px-5 py-4">
            <div className="text-[18px] font-medium text-amber-50/88">
              Pending auto-learn candidates
            </div>
            <div className="mt-1 text-[15px] leading-snug text-white/44">
              These corrections need one more matching edit before they become
              exact replacements.
            </div>
          </div>
          <ul>
            {dictionary.candidates.map((candidate, i) => (
              <li
                key={`${candidate.from}=>${candidate.to}`}
                className={`flex items-center justify-between gap-4 px-5 py-4 ${
                  i > 0 ? "border-t border-amber-200/10" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-[18px] font-medium text-amber-50/82">
                    {candidate.from} {"\u2192"} {candidate.to}
                  </div>
                  <div className="mt-1 text-[13px] uppercase tracking-[0.12em] text-white/34">
                    {candidate.corrections} of 2 confirmations
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveCandidate(candidate)}
                  aria-label={`Dismiss candidate ${candidate.from} to ${candidate.to}`}
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
        </div>
      )}

      {/* Entries list */}
      <div className="overflow-hidden rounded-xl border border-white/11 bg-white/4">
        {dictionary.entries.length === 0 ? (
          <div className="px-5 py-8 text-center text-[17px] text-white/34">
            No words added yet. Add a word above to get started.
          </div>
        ) : (
          <>
            {hasAutoEntries && (
              <div className="flex items-center gap-2 border-b border-white/8 px-5 py-3">
                <span className="text-[13px] text-amber-300/60">
                  <SparkleIcon />
                </span>
                <span className="text-[14px] text-white/34">
                  learned automatically from your corrections
                </span>
              </div>
            )}
            <ul>
              {dictionary.entries.map((entry, i) => (
                <li
                  key={entryKey(entry)}
                  className={`flex items-center justify-between gap-4 px-5 py-4 ${
                    i > 0 || hasAutoEntries ? "border-t border-white/8" : ""
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {entry.source === "auto" && (
                      <span
                        className="shrink-0 text-amber-300/55"
                        title="Added automatically from a correction"
                      >
                        <SparkleIcon />
                      </span>
                    )}
                    <div className="min-w-0">
                      {entry.kind === "replacement" ? (
                        <div
                          className={`truncate text-[18px] font-medium ${
                            entry.source === "auto"
                              ? "text-amber-100/80"
                              : "text-white/85"
                          }`}
                        >
                          {entry.from} {"\u2192"} {entry.text}
                        </div>
                      ) : (
                        <span
                          className={`text-[18px] font-medium truncate ${
                            entry.source === "auto"
                              ? "text-amber-100/80"
                              : "text-white/85"
                          }`}
                        >
                          {entry.text}
                        </span>
                      )}
                      <div className="mt-1 text-[13px] uppercase tracking-[0.12em] text-white/30">
                        {entry.kind === "replacement"
                          ? "exact replacement"
                          : "fuzzy match"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(entry)}
                    aria-label={`Remove ${entry.kind === "replacement" ? `${entry.from} to ${entry.text}` : entry.text}`}
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
          </>
        )}
      </div>
    </>
  );
}
